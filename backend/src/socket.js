const jwt = require('jsonwebtoken')
const QRCode = require('qrcode')
const crypto = require('crypto')
const pool = require('./db')
const INITIATIVE_MIN = -10
const INITIATIVE_MAX = 99
const AC_MIN = 1
const AC_MAX = 30
const TEMP_HP_MAX = 9999

// In-memory click history per session for the active puzzle.
// Cleared when a new puzzle is shown or puzzle is closed.
const puzzleClicks = new Map() // sessionId (number) → Array<number[]>

// Valid D&D 5e condition ids — mirrors frontend/src/utils/conditions.js
const VALID_CONDITIONS = new Set([
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious',
])

const MIN_DOOM_DURATION_SECONDS = 5
const MAX_DOOM_DURATION_SECONDS = 24 * 60 * 60
const MIN_TIMER_DURATION_SECONDS = 5
const MAX_TIMER_DURATION_SECONDS = 24 * 60 * 60
const MAX_COMBAT_ROUND = 9999
const MIN_TENSION_STEPS = 2
const MAX_TENSION_STEPS = 20
const MAX_TITLE_LENGTH = 200
const MIN_TIMESCALE_HOURS = 1
const MAX_TIMESCALE_HOURS = 168
const MIN_TIMESCALE_SLOTS = 2
const MAX_TIMESCALE_SLOTS = 24
const TENSION_DIRECTIONS = new Set(['ascending', 'descending'])
const MAP_SCALE_MIN = 0.1
const MAP_SCALE_MAX = 10
const MAP_FOG_STROKES_MAX = 500
const MAX_FACTION_VALUE = 1000
const MIN_FACTION_VALUE = -1000

// Types de fiche de contenu affichables sur la TV / envoyables à un joueur — jamais
// 'class' (fiche trop volumineuse : progression 1-20, sous-classes, emplacements de
// sorts...). L'admin envoie l'objet déjà résolu côté client (il l'a via ses propres
// endpoints authentifiés /api/spells, /api/races, etc.) ; le serveur ne fait que le
// valider superficiellement, le stocker et le relayer — voir 'show-content' plus bas.
const CONTENT_TYPES = new Set(['spell', 'item', 'race', 'background', 'ability', 'service', 'condition'])
const MAX_CONTENT_JSON_LENGTH = 50_000

/**
 * Parses the JSON-serialized content sheet currently shown on TV, if any.
 * @param {object} session - A row from the sessions table
 * @returns {object|null}
 */
function serializeCurrentContent(session) {
  if (session.tv_mode !== 'content' || !session.current_content_data) return null
  try {
    return { contentType: session.current_content_type, contentData: JSON.parse(session.current_content_data) }
  } catch {
    return null
  }
}

/**
 * Sanitizes a player name: trims whitespace and collapses multiple spaces.
 * @param {string} name
 * @returns {string}
 */
function sanitizePlayerName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ')
}

/**
 * Normalizes a player name to lowercase for deduplication checks.
 * @param {string} name
 * @returns {string}
 */
function normalizePlayerName(name) {
  return sanitizePlayerName(name).toLowerCase()
}

/**
 * Fetches all factions for a session ordered by creation date.
 * @param {number} sessionId
 * @returns {Promise<Array>}
 */
async function getFactionsBySession(sessionId) {
  const r = await pool.query('SELECT * FROM factions WHERE session_id = $1 ORDER BY created_at ASC', [sessionId])
  return r.rows
}

/**
 * Fetches a merchant and its items from the database.
 * @param {number} merchantId
 * @returns {Promise<{id, name, description, items: Array}|null>}
 */
async function getMerchantData(merchantId) {
  const mr = await pool.query('SELECT * FROM merchants WHERE id = $1', [merchantId])
  const merchant = mr.rows[0]
  if (!merchant) return null
  const items = await pool.query(
    'SELECT * FROM merchant_items WHERE merchant_id = $1 ORDER BY category, name',
    [merchantId]
  )
  return { ...merchant, items: items.rows }
}

/**
 * Serializes the doom clock state from a session row.
 * Returns null if there is no active doom clock or if it has already expired.
 * @param {object} session - A row from the sessions table
 * @returns {{title: string, endAt: string}|null}
 */
function serializeDoomClock(session) {
  if (!session?.doom_clock_end_at) return null
  const endAt = new Date(session.doom_clock_end_at)
  if (Number.isNaN(endAt.getTime()) || endAt.getTime() <= Date.now()) return null
  return {
    title: session.doom_clock_title || 'DOOM CLOCK',
    endAt: endAt.toISOString(),
  }
}

/**
 * Serializes the tension scale state from a session row.
 * Returns null if no tension scale is active (no title or invalid steps).
 * @param {object} session - A row from the sessions table
 * @returns {{title, steps, level, direction, vibrationEnabled}|null}
 */
function serializeTensionScale(session) {
  const steps = parseInt(session?.tension_steps) || 0
  if (!session?.tension_title || steps <= 0) return null
  const direction = TENSION_DIRECTIONS.has(session.tension_direction) ? session.tension_direction : 'ascending'
  return {
    title: session.tension_title,
    steps,
    level: Math.max(0, Math.min(steps, parseInt(session.tension_level) || 0)),
    direction,
    vibrationEnabled: !!session.tension_vibration,
  }
}

function serializeTimeScale(session) {
  const slotCount = parseInt(session?.timescale_slot_count) || 0
  const totalHours = parseInt(session?.timescale_total_hours) || 0
  if (!session?.timescale_title || slotCount <= 0 || totalHours <= 0) return null
  const restSlots = Math.max(1, parseInt(session.timescale_rest_slots) || 1)
  const elapsedSlots = Math.max(0, Math.min(slotCount, parseInt(session.timescale_elapsed_slots) || 0))
  return {
    title: session.timescale_title,
    totalHours,
    slotCount,
    restSlots,
    elapsedSlots,
    restTaken: !!session.timescale_rest_taken,
    slotHours: totalHours / slotCount,
  }
}

/**
 * Fetches the grid configuration for a map image URL within a session.
 * Returns null if no matching image row is found.
 * @param {number} sessionId
 * @param {string} mapUrl
 * @returns {Promise<{gridType, gridCols, gridRows, gridHexOrientation}|null>}
 */
async function getMapGridConfig(sessionId, mapUrl) {
  if (!mapUrl) return null
  try {
    const res = await pool.query(
      `SELECT grid_type, grid_cols, grid_rows, grid_hex_orientation, grid_offset_x, grid_offset_y, grid_cell_w, grid_cell_h
       FROM session_images WHERE session_id = $1 AND url = $2 AND type = 'map'`,
      [sessionId, mapUrl]
    )
    const row = res.rows[0]
    if (!row) return null
    return {
      gridType: row.grid_type || 'none',
      gridCols: row.grid_cols || null,
      gridRows: row.grid_rows || null,
      gridHexOrientation: row.grid_hex_orientation || 'flat',
      gridOffsetX: row.grid_offset_x ?? 0,
      gridOffsetY: row.grid_offset_y ?? 0,
      gridCellW: row.grid_cell_w ?? null,
      gridCellH: row.grid_cell_h ?? null,
    }
  } catch { return null }
}

/**
 * Serializes the battlemap state from a session row.
 * Safely parses JSON columns (map_viewport, map_fog_strokes, map_tokens, map_fog_cells) with fallbacks.
 * Returns null if there is no active map URL.
 * @param {object} session - A row from the sessions table
 * @param {object|null} gridConfig - Optional grid config from session_images
 * @returns {{mapUrl, fogEnabled, viewport, fogStrokes, mapTokens, gridType, gridCols, gridRows, gridHexOrientation, fogCells}|null}
 */
function serializeMapState(session, gridConfig = null) {
  if (!session?.current_map_url) return null
  let viewport = { xn: 0, yn: 0, scale: 1 }
  try {
    const parsed = session.map_viewport ? JSON.parse(session.map_viewport) : null
    if (parsed && typeof parsed.scale === 'number') {
      viewport = {
        xn: parsed.xn ?? parsed.x ?? 0,
        yn: parsed.yn ?? parsed.y ?? 0,
        scale: parsed.scale,
      }
    }
  } catch { /* use default */ }
  let fogStrokes = []
  try {
    const parsed = session.map_fog_strokes ? JSON.parse(session.map_fog_strokes) : null
    if (Array.isArray(parsed)) fogStrokes = parsed
  } catch { /* use default */ }
  let mapTokens = {}
  try {
    const parsed = session.map_tokens ? JSON.parse(session.map_tokens) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) mapTokens = parsed
  } catch { /* use default */ }
  let fogCells = []
  try {
    const parsed = session.map_fog_cells ? JSON.parse(session.map_fog_cells) : null
    if (Array.isArray(parsed)) fogCells = parsed
  } catch { /* use default */ }
  return {
    mapUrl: session.current_map_url,
    fogEnabled: !!session.map_fog_enabled,
    viewport,
    fogStrokes,
    mapTokens,
    gridType: gridConfig?.gridType || 'none',
    gridCols: gridConfig?.gridCols || null,
    gridRows: gridConfig?.gridRows || null,
    gridHexOrientation: gridConfig?.gridHexOrientation || 'flat',
    gridOffsetX: gridConfig?.gridOffsetX ?? 0,
    gridOffsetY: gridConfig?.gridOffsetY ?? 0,
    gridCellW: gridConfig?.gridCellW ?? null,
    gridCellH: gridConfig?.gridCellH ?? null,
    fogCells,
  }
}

/**
 * Returns vote state for a given vote, optionally filtering for active votes only.
 * Includes result counts per option, total players in the session, and voter names.
 * @param {number} sessionId
 * @param {number|null} voteId
 * @param {boolean} activeOnly - If true, only returns the vote if its status is 'active'
 * @returns {Promise<{id, question, options, isAnonymous, results, totalPlayers, totalVotes, voterNames, status}|null>}
 */
async function getVoteState(sessionId, voteId, activeOnly = true) {
  if (!voteId) return null
  const voteInfo = activeOnly
    ? await pool.query('SELECT * FROM votes WHERE id = $1 AND status = $2', [voteId, 'active'])
    : await pool.query('SELECT * FROM votes WHERE id = $1', [voteId])
  const vote = voteInfo.rows[0]
  if (!vote) return null
  const options = typeof vote.options === 'string' ? JSON.parse(vote.options) : vote.options
  const responses = await pool.query('SELECT option_index, player_name FROM vote_responses WHERE vote_id = $1', [vote.id])
  const results = options.map((_, i) => responses.rows.filter(r => r.option_index === i).length)
  const totalPlayers = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
  return {
    id: vote.id,
    question: vote.question,
    options,
    isAnonymous: vote.is_anonymous,
    results,
    totalPlayers: totalPlayers.rows[0].total,
    totalVotes: responses.rows.length,
    voterNames: responses.rows.map(r => ({ name: r.player_name, optionIndex: r.option_index })),
    status: vote.status,
  }
}

/**
 * Convenience wrapper: returns the active vote for a session, without the status field.
 * @param {number} sessionId
 * @param {number|null} voteId
 */
async function getActiveVote(sessionId, voteId) {
  const vote = await getVoteState(sessionId, voteId, true)
  if (!vote) return null
  const { status, ...rest } = vote
  return rest
}

/**
 * Derniers messages du MJ adressés à ce joueur (diffusion à tous OU ciblés sur son id),
 * pour rattraper au join/reconnexion un message envoyé pendant la fenêtre où le client n'a
 * pas encore de listener 'new-message' actif (voir CLAUDE.md). Exclut volontairement les
 * messages joueur→MJ (`from_player_id` non nul, table `messages` partagée dans les deux sens) :
 * ce ne sont pas des messages que CE joueur doit recevoir. Les messages "partage d'or"
 * (`send-gold-split`) ne sont jamais persistés dans `messages` — ils restent live-only, hors
 * périmètre de ce rattrapage.
 * @param {number} sessionId
 * @param {number} playerId
 * @param {number} [limit=50]
 */
async function getRecentMessagesForPlayer(sessionId, playerId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, from_name, type, content, voice_style, text_effect, author_color, sent_at
     FROM messages
     WHERE session_id = $1 AND from_player_id IS NULL AND (to_player_id = $2 OR to_player_id IS NULL)
     ORDER BY sent_at DESC LIMIT $3`,
    [sessionId, playerId, limit]
  )
  return rows.reverse().map(r => ({
    id: r.id,
    fromName: r.from_name,
    type: r.type,
    content: r.content,
    voiceStyle: r.voice_style,
    textEffect: r.text_effect,
    authorColor: r.author_color,
    sentAt: r.sent_at,
  }))
}

/**
 * Serializes the free timer state from a session row.
 * Returns null if there is no active timer or if it has already expired.
 * @param {object} session - A row from the sessions table
 * @returns {{label: string, endAt: string}|null}
 */
function serializeTimer(session) {
  if (!session?.timer_end_at) return null
  const endAt = new Date(session.timer_end_at)
  if (Number.isNaN(endAt.getTime()) || endAt.getTime() <= Date.now()) return null
  return {
    label: session.timer_label || 'Minuteur',
    endAt: endAt.toISOString(),
  }
}

/**
 * Vérifie que cet admin peut agir sur le contenu de jeu de cette session — propriétaire,
 * collaborateur (session_shares), ou session publique — sans en récupérer le contenu.
 * Couvre le cas — répété une douzaine de fois dans les handlers ci-dessous — où seule
 * l'existence de l'accès importe (les handlers qui ont besoin de colonnes précises de la
 * session continuent leur propre SELECT). Ne couvre PAS les actions de cycle de vie de la
 * session (renommer/fermer/supprimer/republier/partager) : celles-ci restent un test
 * direct de `created_by`, jamais de session_editable().
 * @param {number} sessionId
 * @param {number} adminId
 * @returns {Promise<boolean>}
 */
async function assertSessionAccess(sessionId, adminId) {
  const result = await pool.query('SELECT id FROM sessions WHERE id = $1 AND session_editable(id, $2)', [sessionId, adminId])
  return !!result.rows[0]
}

/**
 * Marchand actif (si le mode TV est 'merchant') et puzzle actif (si le mode TV est
 * 'puzzle') pour une session — calculé à l'identique par join-session/admin-join/tv-join.
 * @param {object} session - A row from the sessions table
 */
async function getActiveMerchantAndPuzzle(session) {
  return {
    activeMerchant: (session.current_merchant_id && session.tv_mode === 'merchant')
      ? await getMerchantData(session.current_merchant_id)
      : null,
    activePuzzle: session.tv_mode === 'puzzle' && session.current_puzzle_image_id ? {
      puzzleImageId: session.current_puzzle_image_id,
      puzzleSeed: parseInt(session.current_puzzle_seed, 10),
      puzzleClicks: puzzleClicks.get(session.id) || [],
    } : null,
  }
}

/**
 * Snapshot complet de l'état d'une session, partagé à l'identique par admin-join
 * (event 'admin-state') et tv-join (event 'tv-snapshot') — seuls les champs propres à
 * chaque audience (sessionId côté admin ; session/players/qrCodeDataUrl/currentImage*
 * côté tv) restent construits par l'appelant. join-session n'utilise volontairement PAS
 * ce snapshot complet : reconstruire factions/grille de carte à chaque connexion joueur
 * déclencherait des requêtes inutiles pour lui (aucune UI joueur ne les affiche). Il
 * compose son propre payload avec getActiveMerchantAndPuzzle() + getActiveVote() —
 * activeVote DOIT y figurer explicitement (voir l'appel dans 'join-session' plus bas) :
 * un joueur qui rejoint/recharge/se reconnecte pendant un vote en cours doit le voir, et
 * PlayerInboxView.vue expose bien un onglet Vote — contrairement à factions/carte, ce
 * n'est pas un champ à omettre.
 * @param {object} session - A row from the sessions table
 * @param {boolean} isDemo - Précalculé par l'appelant : la source diffère selon le
 *   contexte (JWT admin pour admin-join, colonne jointe `admin_is_demo` pour tv-join).
 */
async function buildSessionSnapshot(session, isDemo) {
  const { activeMerchant, activePuzzle } = await getActiveMerchantAndPuzzle(session)
  return {
    tvMode: session.tv_mode || 'lobby',
    doomClock: serializeDoomClock(session),
    tensionScale: serializeTensionScale(session),
    timeScale: serializeTimeScale(session),
    activeVote: await getActiveVote(session.id, session.current_vote_id),
    activeMerchant,
    mapState: serializeMapState(session, await getMapGridConfig(session.id, session.current_map_url)),
    combatRound: session.combat_round || 0,
    timer: serializeTimer(session),
    lobbyBgUrl: session.lobby_bg_url || null,
    currentVideoUrl: session.current_video_url || null,
    activePuzzle,
    isDemo: !!isDemo,
    factions: await getFactionsBySession(session.id),
    tvTheme: session.tv_theme || 'dark',
    activeContent: serializeCurrentContent(session),
  }
}

/**
 * Middleware authenticates admin sockets via JWT from socket.handshake.auth.token.
 *
 * Socket rooms:
 *   - `session:<sessionId>` — all players in a session
 *   - `admin:<sessionId>`   — the MJ/DM managing the session
 *   - `tv:<sessionId>`      — TV display screen(s)
 *
 * @param {import('socket.io').Server} io
 */
function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (token) {
      try {
        socket.admin = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
      } catch { /* not an admin */ }
    }
    next()
  })

  /**
   * Diffuse un même événement + payload vers plusieurs rooms d'une session
   * ('tv'/'admin'/'session' → `${room}:${sessionId}`). Couvre le cas dominant (répété
   * une vingtaine de fois) où admin et TV reçoivent le même event avec le même payload ;
   * les diffusions à audience/payload différents par room restent écrites en clair.
   * @param {number} sessionId
   * @param {string} event
   * @param {*} [payload]
   * @param {string[]} [rooms]
   */
  function broadcastToSession(sessionId, event, payload, rooms = ['tv', 'admin']) {
    for (const room of rooms) {
      if (payload === undefined) io.to(`${room}:${sessionId}`).emit(event)
      else io.to(`${room}:${sessionId}`).emit(event, payload)
    }
  }

  // ── Puzzle resync: re-broadcast the canonical click history instead of an atomic lock on
  // 'puzzle-click'. Two players clicking near-simultaneously can apply the resulting replay in
  // different local order on each client (each applies its own click immediately, then receives
  // the other's later) — a real desync, not just a display lag. Rather than serializing clicks
  // with a lock, a resync re-pushes the full `puzzleClicks` log so clients reload their puzzle
  // iframe from scratch and replay it in server order, self-correcting — but only when actually
  // at risk: fired off a short debounce after a *burst* of clicks on the same session (the
  // concurrent-click window), not on a blind timer, so a session with no concurrent activity never
  // reloads anyone's iframe. A low-frequency interval remains as a safety net for a dropped socket
  // message the debounce wouldn't catch (no second click to trigger it). A player's own action can
  // still be overwritten by a resync if it hasn't reached the server yet — accepted trade-off.
  const PUZZLE_BURST_WINDOW_MS = 800 // two clicks closer together than this = concurrency risk
  const PUZZLE_RESYNC_DEBOUNCE_MS = 1500
  const PUZZLE_RESYNC_SAFETY_INTERVAL_MS = 90_000
  const puzzleResyncTimers = new Map() // sessionId → Timeout
  const puzzleLastClickAt = new Map() // sessionId → ms epoch of the previous click
  function resyncPuzzleNow(sid) {
    const clicks = puzzleClicks.get(sid)
    if (clicks) broadcastToSession(sid, 'puzzle-resync', { puzzleClicks: clicks }, ['session', 'tv', 'admin'])
  }
  // Only arms the debounce when this click landed within PUZZLE_BURST_WINDOW_MS of the previous
  // one for the same session — an isolated click at a normal solving pace never triggers a resync.
  function maybeSchedulePuzzleResync(sid) {
    const now = Date.now()
    const wasBurst = (now - (puzzleLastClickAt.get(sid) || 0)) < PUZZLE_BURST_WINDOW_MS
    puzzleLastClickAt.set(sid, now)
    if (!wasBurst) return
    clearTimeout(puzzleResyncTimers.get(sid))
    puzzleResyncTimers.set(sid, setTimeout(() => {
      puzzleResyncTimers.delete(sid)
      resyncPuzzleNow(sid)
    }, PUZZLE_RESYNC_DEBOUNCE_MS))
  }
  setInterval(() => {
    for (const sid of puzzleClicks.keys()) resyncPuzzleNow(sid)
  }, PUZZLE_RESYNC_SAFETY_INTERVAL_MS)

  /**
   * Enregistre un événement dans le journal de session (table session_events) et le
   * diffuse à l'admin. playerName/value sont omis du payload émis quand non fournis,
   * pour rester fidèle aux payloads historiques par site d'appel (certains événements
   * n'ont ni joueur ni valeur associée).
   * @param {number} sessionId
   * @param {string} eventType
   * @param {string} description
   * @param {{playerName?: string, value?: number}} [extra]
   */
  async function logSessionEvent(sessionId, eventType, description, { playerName, value } = {}) {
    await pool.query(
      'INSERT INTO session_events (session_id, event_type, description, player_name, value) VALUES ($1, $2, $3, $4, $5)',
      [sessionId, eventType, description, playerName ?? null, value ?? null]
    )
    const payload = { eventType, description, createdAt: new Date() }
    if (playerName !== undefined) payload.playerName = playerName
    if (value !== undefined) payload.value = value
    io.to(`admin:${sessionId}`).emit('session-event', payload)
  }

  /**
   * Re-fetches the current vote for a session and broadcasts updated results
   * to admin and TV. Automatically closes the vote if all players have voted.
   * @param {number} sessionId
   */
  async function refreshVoteForSession(sessionId) {
    const sessionRes = await pool.query('SELECT current_vote_id FROM sessions WHERE id = $1', [sessionId])
    const voteId = sessionRes.rows[0]?.current_vote_id
    if (!voteId) return
    const voteUpdate = await getVoteState(sessionId, voteId, true)
    if (!voteUpdate) return
    broadcastToSession(sessionId, 'vote-updated', voteUpdate)
    if (voteUpdate.totalVotes >= voteUpdate.totalPlayers) {
      const closed = await pool.query('UPDATE votes SET status = $1 WHERE id = $2 AND status = $3 RETURNING id', ['closed', voteId, 'active'])
      if (closed.rows[0]) {
        broadcastToSession(sessionId, 'vote-closed', voteUpdate, ['tv', 'session', 'admin'])
      }
    }
  }

  /**
   * Called when a player's socket disconnects (phone sleep, network drop, tab close).
   * The player STAYS in the session — only socket_id is cleared.
   * Admin/TV are NOT notified: the player is still "in session", just temporarily offline.
   * On reconnect the player calls join-session again and gets a new socket_id.
   * @param {import('socket.io').Socket} socket
   */
  async function onPlayerDisconnect(socket) {
    if (!socket.playerId || !socket.sessionId) return
    try {
      // Le AND socket_id = $2 évite qu'un disconnect retardé de CE socket (ex: fermeture TCP
      // tardive après un refresh navigateur) n'efface le socket_id d'une reconnexion plus
      // récente déjà enregistrée sous le même joueur — voir join-session, qui force la
      // déconnexion de l'ancien socket sans attendre ce handler.
      await pool.query('UPDATE players SET socket_id = NULL WHERE id = $1 AND socket_id = $2', [socket.playerId, socket.id])
      socket.playerId = null
      socket.sessionId = null
    } catch (err) { console.error(err) }
  }

  /**
   * Removes a player from the session on voluntary leave or kick.
   * Deletes associated vote responses, purchase requests, and the player record.
   * Notifies admin and TV, refreshes the active vote count, and logs the event.
   * @param {import('socket.io').Socket} socket
   */
  async function removePlayer(socket) {
    if (!socket.playerId || !socket.sessionId) return
    try {
      const pr = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
      const playerName = pr.rows[0]?.player_name ?? 'Inconnu'
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM vote_responses WHERE player_id = $1', [socket.playerId])
        await client.query('DELETE FROM purchase_requests WHERE player_id = $1', [socket.playerId])
        await client.query('UPDATE messages SET to_player_id = NULL WHERE to_player_id = $1', [socket.playerId])
        await client.query('UPDATE dice_results SET sent_to = NULL WHERE sent_to = $1', [socket.playerId])
        await client.query('DELETE FROM players WHERE id = $1', [socket.playerId])
        await client.query('COMMIT')
      } catch (dbErr) {
        await client.query('ROLLBACK')
        throw dbErr
      } finally {
        client.release()
      }
      socket.leave(`session:${socket.sessionId}`)
      const event = { playerId: socket.playerId }
      broadcastToSession(socket.sessionId, 'player-left', event)
      await refreshVoteForSession(socket.sessionId)

      // Log session event
      await logSessionEvent(socket.sessionId, 'leave', `${playerName} a quitté la session`, { playerName })

      socket.playerId = null
      socket.sessionId = null
    } catch (err) { console.error(err) }
  }

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    // ── Player: join ────────────────────────────────────────────────────────
    socket.on('join-session', async ({ code, playerName, ac, hp, maxHp, dndClass, race, subclass, avatarUrl }) => {
      try {
        const cleanName = sanitizePlayerName(playerName)
        if (!cleanName) {
          socket.emit('error', { message: 'Le nom du personnage ne peut pas être vide.', field: 'playerName' })
          return
        }
        const sessionResult = await pool.query(
          `SELECT s.*, a.is_demo AS admin_is_demo
           FROM sessions s
           JOIN admins a ON a.id = s.created_by
           WHERE s.code = $1 AND s.status = 'active'`, [code])
        const session = sessionResult.rows[0]
        if (!session) { socket.emit('error', { message: 'Session introuvable ou fermée.', field: 'sessionCode' }); return }
        const acVal = Math.max(1, parseInt(ac) || 10)
        const hpVal = Math.max(1, parseInt(hp) || 20)
        // maxHp is optional: if provided, use it as max_hp for new players.
        // This prevents the bug where refreshing with 35/50 HP creates a player with max_hp=35.
        const maxHpVal = maxHp ? Math.max(1, parseInt(maxHp) || hpVal) : hpVal
        const classVal = dndClass || null
        const raceVal = race || null
        const subclassVal = subclass || null
        const avatarVal = avatarUrl || null

        const normalizedName = normalizePlayerName(cleanName)
        const existingPlayersRes = await pool.query(
          `SELECT *
           FROM players
           WHERE session_id = $1
           ORDER BY joined_at ASC`,
          [session.id]
        )
        const existingPlayer = existingPlayersRes.rows.find(p => normalizePlayerName(p.player_name) === normalizedName)
        let player
        if (existingPlayer) {
          // Un ancien socket peut rester brièvement présent dans io.sockets.sockets après un
          // rafraîchissement de page (fermeture TCP retardée, surtout sur mobile) : rejeter la
          // nouvelle connexion sur cette seule base bloquait le joueur qui se reconnecte
          // lui-même (il obtenait "Ce nom est déjà pris" en boucle). On fait plutôt prendre le
          // relais à la nouvelle connexion et on force la fermeture de l'ancienne — cohérent
          // avec le cas où socket_id est déjà vide (reconnexion après coupure) juste en dessous.
          if (existingPlayer.socket_id && existingPlayer.socket_id !== socket.id) {
            const existingSocket = io.sockets.sockets.get(existingPlayer.socket_id)
            if (existingSocket) existingSocket.disconnect(true)
          }
          // ac/hp/maxHp ne sont volontairement pas réécrits ici : ce sont des valeurs de
          // partie en cours (dégâts subis, etc.), pas des valeurs à réinitialiser depuis le
          // formulaire de connexion à chaque reconnexion. Classe/sous-classe/race sont en
          // revanche des infos de fiche de personnage qu'un joueur doit pouvoir corriger en
          // se reconnectant sous le même nom.
          const updated = await pool.query(
            `UPDATE players
             SET socket_id = $1, dnd_class = $2, race = $3, subclass = $4
             WHERE id = $5
             RETURNING *`,
            [socket.id, classVal, raceVal, subclassVal, existingPlayer.id]
          )
          player = updated.rows[0]
        } else {
          const playerResult = await pool.query(
            `INSERT INTO players (session_id, player_name, socket_id, ac, max_hp, current_hp, dnd_class, race, subclass, avatar_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [session.id, cleanName, socket.id, acVal, maxHpVal, hpVal, classVal, raceVal, subclassVal, avatarVal]
          )
          player = playerResult.rows[0]
        }
        socket.join(`session:${session.id}`)
        socket.playerId = player.id
        socket.sessionId = session.id

        socket.emit('session-joined', {
          session: { id: session.id, name: session.name, code: session.code },
          player: { id: player.id, player_name: player.player_name, ac: player.ac, max_hp: player.max_hp, current_hp: player.current_hp, temp_hp: player.temp_hp, dnd_class: player.dnd_class, race: player.race, subclass: player.subclass, avatar_url: player.avatar_url, initiative: player.initiative, conditions: player.conditions, is_concentrating: player.is_concentrating },
          ...(await getActiveMerchantAndPuzzle(session)),
          activeVote: await getActiveVote(session.id, session.current_vote_id),
          recentMessages: await getRecentMessagesForPlayer(session.id, player.id),
          isDemo: !!session.admin_is_demo,
        })
        broadcastToSession(session.id, 'player-joined', player)

        // Log session event
        if (!existingPlayer) {
          await logSessionEvent(session.id, 'join', `${cleanName} a rejoint la session`, { playerName: cleanName })
        }
      } catch (err) { console.error(err); socket.emit('error', { message: 'Impossible de rejoindre la session.' }) }
    })

    socket.on('leave-session', async () => { await removePlayer(socket) })

    // ── Player: adjust HP (soin si delta > 0, dégâts si delta < 0) ──────────
    // Unifie l'ancien update-hp (édition absolue) et apply-damage (dégâts positifs
    // uniquement) : un seul champ « Dégâts et Soins » côté joueur, delta signé. Les soins
    // ne touchent jamais temp_hp ; les dégâts (delta < 0) ponctionnent temp_hp en premier —
    // voir CLAUDE.md. Comme toute réduction de current_hp passe obligatoirement par ce
    // handler (il n'existe plus de chemin d'édition absolue côté joueur), l'absorption par
    // les PV temp est garantie par construction, sans besoin de bloquer un autre event.
    socket.on('adjust-hp', async ({ delta }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const parsedDelta = parseInt(delta, 10)
        const d = Number.isFinite(parsedDelta) ? parsedDelta : 0
        if (d === 0) return
        const prev = await pool.query('SELECT current_hp, max_hp, temp_hp, player_name, is_concentrating FROM players WHERE id = $1', [socket.playerId])
        const row = prev.rows[0]
        if (!row) return
        const oldHp = row.current_hp ?? 0
        const maxHpVal = row.max_hp ?? 0
        const oldTempHp = row.temp_hp ?? 0
        const playerName = row.player_name ?? 'Inconnu'
        const wasConcentrating = row.is_concentrating ?? false

        if (d > 0) {
          // Soin : plafonné à max_hp, ne touche jamais les PV temp.
          const newHp = Math.min(maxHpVal, oldHp + d)
          await pool.query('UPDATE players SET current_hp = $1 WHERE id = $2', [newHp, socket.playerId])
          const event = { playerId: socket.playerId, newHp, tempHp: oldTempHp }
          broadcastToSession(socket.sessionId, 'hp-updated', event)
          socket.emit('hp-adjusted', { newHp, tempHp: oldTempHp, delta: newHp - oldHp, absorbed: 0, remaining: 0 })
          const healed = newHp - oldHp
          if (healed > 0) {
            await logSessionEvent(socket.sessionId, 'heal', `${playerName} récupère ${healed} PV (${oldHp} → ${newHp} PV)`, { playerName, value: healed })
          }
          return
        }

        // Dégâts : règle 5e, les PV temporaires absorbent en premier.
        const dmg = -d
        const absorbed = Math.min(dmg, oldTempHp)
        const remaining = dmg - absorbed
        const newTempHp = oldTempHp - absorbed
        const newHp = Math.max(0, oldHp - remaining)
        await pool.query('UPDATE players SET current_hp = $1, temp_hp = $2 WHERE id = $3', [newHp, newTempHp, socket.playerId])
        const event = { playerId: socket.playerId, newHp, tempHp: newTempHp }
        broadcastToSession(socket.sessionId, 'hp-updated', event)
        socket.emit('hp-adjusted', { newHp, tempHp: newTempHp, delta: newHp - oldHp, absorbed, remaining })

        // La DC de concentration se base sur les dégâts totaux subis, PV temp inclus
        // (règle officielle, cf. Sage Advice) — pas seulement sur ce qui a atteint les PV de base.
        if (wasConcentrating) {
          const dc = Math.max(10, Math.ceil(dmg / 2))
          socket.emit('concentration-warning', { damage: dmg, dc })
        }

        let eventType, description
        if (remaining > 0 && newHp === 0) {
          eventType = 'death'
          description = `${playerName} est tombé à 0 PV !`
          if (wasConcentrating) {
            await pool.query('UPDATE players SET is_concentrating = FALSE WHERE id = $1', [socket.playerId])
            broadcastToSession(socket.sessionId, 'concentration-updated', { playerId: socket.playerId, isConcentrating: false })
          }
        } else if (absorbed > 0 && remaining === 0) {
          eventType = 'damage'
          description = `${playerName} subit ${dmg} dégâts, entièrement absorbés par ses PV temporaires.`
        } else if (absorbed > 0) {
          eventType = 'damage'
          description = `${playerName} subit ${dmg} dégâts (${absorbed} absorbés par ses PV temporaires, ${remaining} sur ses PV : ${oldHp} → ${newHp})`
        } else {
          eventType = 'damage'
          description = `${playerName} subit ${dmg} dégâts (${oldHp} → ${newHp} PV)`
        }
        await logSessionEvent(socket.sessionId, eventType, description, { playerName, value: d })
      } catch (err) { console.error(err) }
    })

    // ── Player: update temp HP ──────────────────────────────────────────────
    socket.on('update-temp-hp', async ({ tempHp }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const parsed = parseInt(tempHp, 10)
        const value = Math.max(0, Math.min(TEMP_HP_MAX, Number.isFinite(parsed) ? parsed : 0))
        const updated = await pool.query('UPDATE players SET temp_hp = $1 WHERE id = $2 RETURNING temp_hp', [value, socket.playerId])
        const row = updated.rows[0]
        if (!row) return
        const event = { playerId: socket.playerId, tempHp: row.temp_hp }
        broadcastToSession(socket.sessionId, 'temp-hp-updated', event)
        socket.emit('temp-hp-confirmed', { tempHp: row.temp_hp })
      } catch (err) { console.error(err) }
    })

    // ── Player: update max HP ────────────────────────────────────────────────
    socket.on('update-max-hp', async ({ newMaxHp }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const maxHpVal = Math.max(1, Math.min(9999, parseInt(newMaxHp) || 1))
        const updated = await pool.query(
          'UPDATE players SET max_hp = $1 WHERE id = $2 RETURNING *',
          [maxHpVal, socket.playerId]
        )
        const player = updated.rows[0]
        if (!player) return
        socket.emit('max-hp-update-confirmed', { newMaxHp: player.max_hp })
        const event = { playerId: socket.playerId, newHp: player.current_hp, newMaxHp: player.max_hp, tempHp: player.temp_hp }
        broadcastToSession(socket.sessionId, 'hp-updated', event)
      } catch (err) { console.error(err) }
    })

    // ── Player: update conditions ───────────────────────────────────────────
    socket.on('update-conditions', async ({ conditions }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const validConditions = Array.isArray(conditions)
          ? conditions.filter(c => VALID_CONDITIONS.has(c))
          : []
        const conditionsJson = JSON.stringify(validConditions)
        await pool.query('UPDATE players SET conditions = $1 WHERE id = $2', [conditionsJson, socket.playerId])
        const event = { playerId: socket.playerId, conditions: validConditions }
        broadcastToSession(socket.sessionId, 'conditions-updated', event)
      } catch (err) { console.error(err) }
    })

    // ── Player: update concentration ────────────────────────────────────────
    socket.on('update-concentration', async ({ isConcentrating }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        await pool.query('UPDATE players SET is_concentrating = $1 WHERE id = $2', [isConcentrating, socket.playerId])
        const event = { playerId: socket.playerId, isConcentrating }
        broadcastToSession(socket.sessionId, 'concentration-updated', event)
        socket.emit('concentration-confirmed', { isConcentrating })
      } catch (err) { console.error(err) }
    })

    // ── Player: update initiative ────────────────────────────────────────────
    socket.on('update-initiative', async ({ initiative }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const parsed = parseInt(initiative, 10)
        const value = Number.isFinite(parsed) ? Math.max(INITIATIVE_MIN, Math.min(INITIATIVE_MAX, parsed)) : null
        await pool.query('UPDATE players SET initiative = $1 WHERE id = $2', [value, socket.playerId])
        const event = { playerId: socket.playerId, initiative: value }
        broadcastToSession(socket.sessionId, 'initiative-updated', event)
        socket.emit('initiative-confirmed', { initiative: value })
      } catch (err) { console.error(err) }
    })

    // ── Player: update AC ────────────────────────────────────────────────────
    socket.on('update-ac', async ({ ac }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const parsed = parseInt(ac, 10)
        const value = Number.isFinite(parsed) ? Math.max(AC_MIN, Math.min(AC_MAX, parsed)) : null
        if (value === null) return
        await pool.query('UPDATE players SET ac = $1 WHERE id = $2', [value, socket.playerId])
        const event = { playerId: socket.playerId, ac: value }
        broadcastToSession(socket.sessionId, 'ac-updated', event)
        socket.emit('ac-confirmed', { ac: value })
      } catch (err) { console.error(err) }
    })

    // ── Admin: join room + snapshot ─────────────────────────────────────────
    socket.on('admin-join', async (sessionId) => {
      if (!socket.admin) return
      try {
        const sessionResult = await pool.query(
          'SELECT * FROM sessions WHERE id = $1 AND session_editable(id, $2)', [sessionId, socket.admin.id])
        const session = sessionResult.rows[0]
        if (!session) return
        socket.join(`admin:${sessionId}`)
        const playersResult = await pool.query(
          `SELECT id, session_id, player_name, socket_id, joined_at, ac, max_hp, current_hp, temp_hp, conditions, is_concentrating, initiative, dnd_class, race, subclass, avatar_url
           FROM players WHERE session_id = $1 ORDER BY joined_at ASC`, [sessionId])
        socket.emit('players-snapshot', { sessionId, players: playersResult.rows })
        socket.adminSessionId = sessionId
        socket.emit('admin-state', {
          sessionId,
          ...(await buildSessionSnapshot(session, socket.admin.is_demo)),
        })
      } catch (err) { console.error(err) }
    })

    // ── TV: join as observer ────────────────────────────────────────────────
    socket.on('tv-join', async ({ sessionCode }) => {
      try {
        const sessionResult = await pool.query(
          `SELECT s.*, a.is_demo AS admin_is_demo
           FROM sessions s
           JOIN admins a ON a.id = s.created_by
           WHERE s.code = $1 AND s.status = 'active'`, [sessionCode])
        const session = sessionResult.rows[0]
        if (!session) { socket.emit('error', { message: 'Session not found or closed.' }); return }
        socket.join(`tv:${session.id}`)
        socket.tvSessionId = session.id
        const playersResult = await pool.query(
          `SELECT id, player_name, joined_at, ac, max_hp, current_hp, temp_hp, dnd_class, avatar_url, conditions, is_concentrating, initiative
           FROM players WHERE session_id = $1 ORDER BY joined_at ASC`, [session.id])

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
        const joinUrl = `${frontendUrl}/join/${session.code}`
        const qrCodeDataUrl = await QRCode.toDataURL(joinUrl)

        socket.emit('tv-snapshot', {
          session: { id: session.id, name: session.name },
          players: playersResult.rows,
          sessionCode: session.code,
          qrCodeDataUrl,
          currentImageUrl: session.current_image_url,
          currentImageLabel: session.current_image_label || null,
          ...(await buildSessionSnapshot(session, session.admin_is_demo)),
        })
      } catch (err) { console.error(err) }
    })

    // ── Admin: set TV theme (always mirrors admin's own theme) ─────────────
    socket.on('set-tv-theme', async ({ sessionId, theme }) => {
      if (!socket.admin) return
      if (theme !== 'light' && theme !== 'dark') return
      try {
        await pool.query('UPDATE sessions SET tv_theme = $1 WHERE id = $2 AND session_editable(id, $3)', [theme, sessionId, socket.admin.id])
        io.to(`tv:${sessionId}`).emit('tv-theme-updated', { theme })
      } catch (err) { console.error(err) }
    })

    // ── Admin: set TV mode ──────────────────────────────────────────────────
    socket.on('set-tv-mode', async ({ sessionId, mode }) => {
      if (!socket.admin) return
      try {
        await pool.query('UPDATE sessions SET tv_mode = $1 WHERE id = $2 AND session_editable(id, $3)', [mode, sessionId, socket.admin.id])
        broadcastToSession(sessionId, 'tv-mode-changed', { mode })
      } catch (err) { console.error(err) }
    })

    // ── Admin: show a content sheet (spell/item/race/background/ability/service/
    // condition — never a class) on the TV. The admin sends the sheet it already has
    // client-side (from its own authenticated /api/* fetches) ; the server stores it
    // as-is and relays it, it never re-resolves content itself (see CONTENT_TYPES).
    socket.on('show-content', async ({ sessionId, contentType, contentData }) => {
      if (!socket.admin) return
      if (!CONTENT_TYPES.has(contentType) || !contentData || typeof contentData !== 'object') return
      try {
        const dataStr = JSON.stringify(contentData)
        if (dataStr.length > MAX_CONTENT_JSON_LENGTH) return
        const result = await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_content_type = $2, current_content_data = $3 WHERE id = $4 AND session_editable(id, $5)',
          ['content', contentType, dataStr, sessionId, socket.admin.id]
        )
        if (result.rowCount === 0) return
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'content', contentType, contentData })
      } catch (err) { console.error(err); socket.emit('tv-control-error', { message: 'Impossible d\'afficher ce contenu sur la TV.' }) }
    })

    // ── Admin: start doom clock ──────────────────────────────────────────────
    socket.on('start-doom-clock', async ({ sessionId, title, durationSeconds }) => {
      if (!socket.admin) return
      try {
        const parsedDuration = parseInt(durationSeconds, 10)
        if (Number.isNaN(parsedDuration)) {
          socket.emit('tv-control-error', { message: 'Durée invalide (entre 5 secondes et 24 heures).', field: 'durationSeconds' })
          return
        }
        const safeDuration = Math.max(MIN_DOOM_DURATION_SECONDS, Math.min(MAX_DOOM_DURATION_SECONDS, parsedDuration))
        const endAt = new Date(Date.now() + safeDuration * 1000)
        const safeTitle = (title || 'DOOM CLOCK').trim().slice(0, MAX_TITLE_LENGTH) || 'DOOM CLOCK'
        const updateRes = await pool.query(
          `UPDATE sessions
           SET doom_clock_title = $1, doom_clock_end_at = $2, tv_mode = 'doom'
           WHERE id = $3 AND session_editable(id, $4)`,
          [safeTitle, endAt, sessionId, socket.admin.id]
        )
        if (updateRes.rowCount === 0) return
        const payload = { title: safeTitle, endAt: endAt.toISOString() }
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'doom' })
        broadcastToSession(sessionId, 'doom-clock-started', payload)
        await logSessionEvent(sessionId, 'doom_clock_started', `Doom Clock lancée : "${safeTitle}"`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: stop doom clock ───────────────────────────────────────────────
    socket.on('stop-doom-clock', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const stopRes = await pool.query(
          `UPDATE sessions
           SET doom_clock_title = NULL, doom_clock_end_at = NULL, tv_mode = 'lobby'
           WHERE id = $1 AND session_editable(id, $2)`,
          [sessionId, socket.admin.id]
        )
        if (stopRes.rowCount === 0) return
        broadcastToSession(sessionId, 'doom-clock-stopped')
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'lobby' })
        await logSessionEvent(sessionId, 'doom_clock_stopped', 'Doom Clock arrêtée')
      } catch (err) { console.error(err) }
    })

    // ── Admin: create tension scale ──────────────────────────────────────────
    socket.on('create-tension-scale', async ({ sessionId, title, steps, direction, vibrationEnabled }) => {
      if (!socket.admin) return
      try {
        const parsedSteps = parseInt(steps, 10)
        if (Number.isNaN(parsedSteps)) {
          socket.emit('tv-control-error', { message: "Nombre d'étapes invalide (entre 2 et 20).", field: 'steps' })
          return
        }
        const safeSteps = Math.max(MIN_TENSION_STEPS, Math.min(MAX_TENSION_STEPS, parsedSteps))
        const safeTitle = (title || 'Échelle de tension').trim().slice(0, MAX_TITLE_LENGTH) || 'Échelle de tension'
        const safeDirection = TENSION_DIRECTIONS.has(direction) ? direction : 'ascending'
        const startLevel = safeDirection === 'descending' ? safeSteps : 0
        const result = await pool.query(
          `UPDATE sessions
           SET tension_title = $1, tension_steps = $2, tension_level = $3, tension_direction = $4, tension_vibration = $5, tv_mode = 'tension'
           WHERE id = $6 AND session_editable(id, $7)
           RETURNING tension_title, tension_steps, tension_level, tension_direction, tension_vibration`,
          [safeTitle, safeSteps, startLevel, safeDirection, !!vibrationEnabled, sessionId, socket.admin.id]
        )
        const row = result.rows[0]
        if (!row) return
        const payload = {
          title: row.tension_title,
          steps: row.tension_steps,
          level: row.tension_level,
          direction: row.tension_direction,
          vibrationEnabled: row.tension_vibration,
        }
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'tension' })
        broadcastToSession(sessionId, 'tension-scale-updated', payload)
        await logSessionEvent(sessionId, 'tension_started', `Tension lancée : "${safeTitle}" (${safeSteps} étapes)`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: advance tension scale (up/down, arbitrary delta) ────────────
    socket.on('increment-tension-scale', async ({ sessionId, delta }) => {
      if (!socket.admin) return
      try {
        const safeDelta = Math.max(-MAX_TENSION_STEPS, Math.min(MAX_TENSION_STEPS, parseInt(delta, 10) || 1))
        const result = await pool.query(
          `UPDATE sessions
           SET tension_level = GREATEST(0, LEAST(COALESCE(tension_steps, 0), COALESCE(tension_level, 0) + $3))
           WHERE id = $1 AND session_editable(id, $2) AND tension_title IS NOT NULL AND tension_steps IS NOT NULL
           RETURNING tension_title, tension_steps, tension_level, tension_direction, tension_vibration`,
          [sessionId, socket.admin.id, safeDelta]
        )
        const row = result.rows[0]
        if (!row) return
        const payload = {
          title: row.tension_title,
          steps: row.tension_steps,
          level: row.tension_level,
          direction: row.tension_direction,
          vibrationEnabled: row.tension_vibration,
        }
        broadcastToSession(sessionId, 'tension-scale-updated', payload)
        await logSessionEvent(sessionId, 'tension_updated', `Tension : niveau ${row.tension_level}/${row.tension_steps} — "${row.tension_title}"`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: end tension scale ─────────────────────────────────────────────
    socket.on('end-tension-scale', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        // Fetch the current title before clearing it (RETURNING would give NULL after the update)
        const current = await pool.query(
          'SELECT tension_title FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        if (!current.rows[0]) return
        const tensionTitle = current.rows[0].tension_title || 'Échelle de tension'
        await pool.query(
          `UPDATE sessions
           SET tension_title = NULL, tension_steps = NULL, tension_level = 0, tension_direction = 'ascending', tension_vibration = FALSE, tv_mode = 'lobby'
           WHERE id = $1 AND session_editable(id, $2)`,
          [sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'tension-scale-ended')
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'lobby' })
        await logSessionEvent(sessionId, 'tension_ended', `Tension terminée : "${tensionTitle}"`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: create time scale ─────────────────────────────────────────────
    socket.on('create-time-scale', async ({ sessionId, title, totalHours, slotCount, restSlots }) => {
      if (!socket.admin) return
      try {
        const parsedHours = parseInt(totalHours) || 0
        const parsedSlots = parseInt(slotCount) || 0
        const parsedRest = parseInt(restSlots) || 1
        if (parsedHours < MIN_TIMESCALE_HOURS || parsedHours > MAX_TIMESCALE_HOURS) {
          socket.emit('tv-control-error', { message: `Durée invalide (entre ${MIN_TIMESCALE_HOURS} et ${MAX_TIMESCALE_HOURS} heures).`, field: 'totalHours' })
          return
        }
        if (parsedSlots < MIN_TIMESCALE_SLOTS || parsedSlots > MAX_TIMESCALE_SLOTS) {
          socket.emit('tv-control-error', { message: `Nombre de paliers invalide (entre ${MIN_TIMESCALE_SLOTS} et ${MAX_TIMESCALE_SLOTS}).`, field: 'slotCount' })
          return
        }
        const safeTitle = (title || 'Échelle de temps').trim().slice(0, MAX_TITLE_LENGTH) || 'Échelle de temps'
        const safeHours = Math.max(MIN_TIMESCALE_HOURS, Math.min(MAX_TIMESCALE_HOURS, parsedHours))
        const safeSlots = Math.max(MIN_TIMESCALE_SLOTS, Math.min(MAX_TIMESCALE_SLOTS, parsedSlots))
        const safeRest = Math.max(1, Math.min(safeSlots, parsedRest))
        const result = await pool.query(
          `UPDATE sessions
           SET timescale_title = $1, timescale_total_hours = $2, timescale_slot_count = $3,
               timescale_rest_slots = $4, timescale_elapsed_slots = 0, timescale_rest_taken = FALSE, tv_mode = 'timescale'
           WHERE id = $5 AND session_editable(id, $6)
           RETURNING timescale_title, timescale_total_hours, timescale_slot_count, timescale_rest_slots, timescale_elapsed_slots, timescale_rest_taken`,
          [safeTitle, safeHours, safeSlots, safeRest, sessionId, socket.admin.id]
        )
        const row = result.rows[0]
        if (!row) return
        const payload = serializeTimeScale(row)
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'timescale' })
        broadcastToSession(sessionId, 'time-scale-updated', payload)
        const slotHours = safeHours / safeSlots
        await logSessionEvent(sessionId, 'timescale_started', `Échelle de temps : "${safeTitle}" (${safeSlots} paliers de ${slotHours}h)`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: advance time scale by N slots (delta can be negative) ──────────
    socket.on('advance-time-scale', async ({ sessionId, delta }) => {
      if (!socket.admin) return
      try {
        const safeDelta = Math.max(-24, Math.min(24, parseInt(delta, 10) || 1))
        const result = await pool.query(
          `UPDATE sessions
           SET timescale_elapsed_slots = LEAST(timescale_slot_count, GREATEST(0, COALESCE(timescale_elapsed_slots, 0) + $3))
           WHERE id = $1 AND session_editable(id, $2) AND timescale_title IS NOT NULL
           RETURNING timescale_title, timescale_total_hours, timescale_slot_count, timescale_rest_slots, timescale_elapsed_slots, timescale_rest_taken`,
          [sessionId, socket.admin.id, safeDelta]
        )
        const row = result.rows[0]
        if (!row) return
        const payload = serializeTimeScale(row)
        broadcastToSession(sessionId, 'time-scale-updated', payload)
        const elapsed = row.timescale_elapsed_slots
        const total = row.timescale_slot_count
        const slotHours = row.timescale_total_hours / total
        const sign = safeDelta >= 0 ? '+' : ''
        await logSessionEvent(sessionId, 'timescale_advanced', `Temps : palier ${elapsed}/${total} — "${row.timescale_title}" (${sign}${safeDelta * slotHours}h)`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: take long rest ─────────────────────────────────────────────────
    socket.on('long-rest-time-scale', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const current = await pool.query(
          'SELECT timescale_title, timescale_total_hours, timescale_slot_count, timescale_rest_slots, timescale_elapsed_slots, timescale_rest_taken FROM sessions WHERE id = $1 AND session_editable(id, $2) AND timescale_title IS NOT NULL',
          [sessionId, socket.admin.id]
        )
        const row = current.rows[0]
        if (!row) return
        const elapsed = parseInt(row.timescale_elapsed_slots) || 0
        const slotCount = parseInt(row.timescale_slot_count) || 0
        const restSlots = parseInt(row.timescale_rest_slots) || 1
        if (elapsed + restSlots > slotCount) {
          socket.emit('tv-control-error', { message: 'Pas assez de temps restant pour un repos long.' })
          return
        }
        if (row.timescale_rest_taken) {
          socket.emit('tv-control-error', { message: 'Un repos long a déjà été pris.' })
          return
        }
        const newElapsed = elapsed + restSlots
        await pool.query(
          'UPDATE sessions SET timescale_elapsed_slots = $1, timescale_rest_taken = TRUE WHERE id = $2 AND session_editable(id, $3)',
          [newElapsed, sessionId, socket.admin.id]
        )
        const payload = serializeTimeScale({ ...row, timescale_elapsed_slots: newElapsed, timescale_rest_taken: true })
        broadcastToSession(sessionId, 'time-scale-updated', payload)
        const restHours = (row.timescale_total_hours / slotCount) * restSlots
        await logSessionEvent(sessionId, 'timescale_rest', `Repos long pris (${restHours}h) — "${row.timescale_title}" : palier ${newElapsed}/${slotCount}`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: end time scale ─────────────────────────────────────────────────
    socket.on('end-time-scale', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const current = await pool.query(
          'SELECT timescale_title FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        if (!current.rows[0]) return
        const scaleTitle = current.rows[0].timescale_title || 'Échelle de temps'
        await pool.query(
          `UPDATE sessions
           SET timescale_title = NULL, timescale_total_hours = NULL, timescale_slot_count = NULL,
               timescale_rest_slots = NULL, timescale_elapsed_slots = 0, tv_mode = 'lobby'
           WHERE id = $1 AND session_editable(id, $2)`,
          [sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'time-scale-ended')
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'lobby' })
        await logSessionEvent(sessionId, 'timescale_ended', `Échelle de temps terminée : "${scaleTitle}"`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: create vote ──────────────────────────────────────────────────
    socket.on('create-vote', async ({ sessionId, question, options, isAnonymous }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        const voteRes = await pool.query(
          'INSERT INTO votes (session_id, question, options, is_anonymous) VALUES ($1, $2, $3, $4) RETURNING *',
          [sessionId, question, JSON.stringify(options), isAnonymous || false]
        )
        const vote = voteRes.rows[0]
        await pool.query('UPDATE sessions SET tv_mode = $1, current_vote_id = $2 WHERE id = $3', ['vote', vote.id, sessionId])
        const voteData = await getVoteState(sessionId, vote.id, true)
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'vote' })
        broadcastToSession(sessionId, 'vote-started', voteData, ['tv', 'session', 'admin'])
        const safeQuestion = (question || '').slice(0, 200)
        await logSessionEvent(sessionId, 'vote_started', `Vote lancé : "${safeQuestion}"`)
      } catch (err) { console.error(err) }
    })

    // ── Player: submit vote ─────────────────────────────────────────────────
    socket.on('submit-vote', async ({ voteId, optionIndex }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const existing = await pool.query('SELECT id FROM vote_responses WHERE vote_id = $1 AND player_id = $2', [voteId, socket.playerId])
        if (existing.rows[0]) { socket.emit('vote-error', { message: 'Vous avez déjà voté.' }); return }
        // Validate vote exists, is active, and optionIndex is in bounds
        const voteInfo = await pool.query('SELECT options FROM votes WHERE id = $1 AND status = $2', [voteId, 'active'])
        const voteRow = voteInfo.rows[0]
        if (!voteRow) { socket.emit('vote-error', { message: 'Vote inexistant ou terminé.' }); return }
        const voteOptions = typeof voteRow.options === 'string' ? JSON.parse(voteRow.options) : voteRow.options
        const idx = parseInt(optionIndex, 10)
        if (!Number.isFinite(idx) || idx < 0 || idx >= voteOptions.length) {
          socket.emit('vote-error', { message: 'Option de vote invalide.' }); return
        }
        const pname = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pname.rows[0]?.player_name || 'Inconnu'
        await pool.query('INSERT INTO vote_responses (vote_id, player_id, player_name, option_index) VALUES ($1, $2, $3, $4)', [voteId, socket.playerId, playerName, idx])
        socket.emit('vote-submitted', { optionIndex: idx })

        const voteUpdate = await getVoteState(socket.sessionId, voteId, true)
        if (!voteUpdate) return
        broadcastToSession(socket.sessionId, 'vote-updated', voteUpdate)

        if (voteUpdate.totalVotes >= voteUpdate.totalPlayers) {
          const closed = await pool.query('UPDATE votes SET status = $1 WHERE id = $2 AND status = $3 RETURNING id', ['closed', voteId, 'active'])
          if (closed.rows[0]) {
            broadcastToSession(socket.sessionId, 'vote-closed', voteUpdate, ['tv', 'session', 'admin'])
            const closedQuestion = (voteUpdate.question || '').slice(0, 200)
            await logSessionEvent(socket.sessionId, 'vote_closed', `Vote clôturé : "${closedQuestion}"`)
          }
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: close vote ───────────────────────────────────────────────────
    socket.on('close-vote', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const sessionRes = await pool.query(
          'SELECT current_vote_id FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        const voteId = sessionRes.rows[0]?.current_vote_id
        if (!voteId) return
        const voteUpdate = await getVoteState(sessionId, voteId, false)
        if (!voteUpdate) return
        const voteCloseRes = await pool.query('UPDATE votes SET status = $1 WHERE id = $2 AND status = $3', ['closed', voteId, 'active'])
        if (voteCloseRes.rowCount === 0) return
        broadcastToSession(sessionId, 'vote-closed', voteUpdate, ['tv', 'session', 'admin'])
        const closedQuestion = (voteUpdate.question || '').slice(0, 200)
        await logSessionEvent(sessionId, 'vote_closed', `Vote clôturé : "${closedQuestion}"`)
      } catch (err) { console.error(err) }
    })

    // ── Admin: show image on TV ─────────────────────────────────────────────
    socket.on('show-image', async ({ sessionId, imageUrl }) => {
      if (!socket.admin) return
      try {
        const imgRow = await pool.query(
          'SELECT tv_label FROM session_images WHERE url = $1 AND session_id = $2 LIMIT 1',
          [imageUrl, sessionId]
        )
        const imageLabel = imgRow.rows[0]?.tv_label || null
        await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_image_url = $2, current_image_label = $3 WHERE id = $4 AND session_editable(id, $5)',
          ['image', imageUrl, imageLabel, sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'image', imageUrl, imageLabel })
      } catch (err) { console.error(err) }
    })

    // ── Admin: show video on TV ─────────────────────────────────────────────
    socket.on('show-video', async ({ sessionId, videoUrl }) => {
      if (!socket.admin) return
      try {
        if (!videoUrl || typeof videoUrl !== 'string') return
        await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_video_url = $2 WHERE id = $3 AND session_editable(id, $4)',
          ['video', videoUrl, sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'video', videoUrl })
      } catch (err) { console.error(err) }
    })

    // ── Admin: sync video playback to TV (only if that video is projected) ──
    socket.on('video-control', async ({ sessionId, videoUrl, action, time }) => {
      if (!socket.admin) return
      try {
        if (!['play', 'pause', 'seek'].includes(action)) return
        const { rows } = await pool.query(
          'SELECT tv_mode, current_video_url FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        const s = rows[0]
        // Ne rien faire si cet onglet n'est pas celui projeté sur la TV.
        if (!s || s.tv_mode !== 'video' || s.current_video_url !== videoUrl) return
        const t = (typeof time === 'number' && isFinite(time)) ? Math.max(0, time) : null
        io.to(`tv:${sessionId}`).emit('video-control', { action, time: t })
      } catch (err) { console.error(err) }
    })

    // ── Admin: show puzzle on TV and players ──────────────────────────────
    socket.on('show-puzzle', async ({ sessionId, imageId }) => {
      if (!socket.admin) return
      try {
        const sid = parseInt(sessionId, 10)
        const iid = parseInt(imageId, 10)
        if (!Number.isInteger(sid) || !Number.isInteger(iid)) return
        if (!await assertSessionAccess(sid, socket.admin.id)) return
        const imageCheck = await pool.query(
          "SELECT id, url, original_name FROM session_images WHERE id = $1 AND session_id = $2 AND type = 'puzzle'",
          [iid, sid]
        )
        if (!imageCheck.rows[0]) return
        const seed = Math.floor(Math.random() * 2147483646) + 1
        await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_puzzle_image_id = $2, current_puzzle_url = $3, current_puzzle_seed = $4 WHERE id = $5',
          ['puzzle', iid, imageCheck.rows[0].url, String(seed), sid]
        )
        puzzleClicks.set(sid, [])
        clearTimeout(puzzleResyncTimers.get(sid))
        puzzleResyncTimers.delete(sid)
        puzzleLastClickAt.delete(sid)
        const payload = { mode: 'puzzle', puzzleImageId: iid, puzzleSeed: seed }
        broadcastToSession(sid, 'tv-mode-changed', payload)
        io.to(`session:${sid}`).emit('puzzle-started', { puzzleImageId: iid, puzzleSeed: seed, puzzleClicks: [] })
      } catch (err) { console.error(err) }
    })

    // ── Admin: close puzzle ────────────────────────────────────────────────
    socket.on('close-puzzle', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const sid = parseInt(sessionId, 10)
        if (!Number.isInteger(sid)) return
        if (!await assertSessionAccess(sid, socket.admin.id)) return
        await pool.query(
          "UPDATE sessions SET tv_mode = 'lobby', current_puzzle_image_id = NULL, current_puzzle_url = NULL, current_puzzle_seed = NULL WHERE id = $1",
          [sid]
        )
        puzzleClicks.delete(sid)
        clearTimeout(puzzleResyncTimers.get(sid))
        puzzleResyncTimers.delete(sid)
        puzzleLastClickAt.delete(sid)
        broadcastToSession(sid, 'tv-mode-changed', { mode: 'lobby' })
        broadcastToSession(sid, 'puzzle-closed', undefined, ['session', 'admin'])
      } catch (err) { console.error(err) }
    })

    // ── Player: relay puzzle click to other clients ────────────────────────
    socket.on('puzzle-click', ({ path }) => {
      const sid = socket.sessionId
      if (!sid || !puzzleClicks.has(sid)) return
      if (!Array.isArray(path) || path.length > 20) return
      if (!path.every(i => Number.isInteger(i) && i >= 0 && i < 1000)) return
      puzzleClicks.get(sid).push(path)
      socket.to(`session:${sid}`).emit('puzzle-cell-clicked', { path })
      socket.to(`tv:${sid}`).emit('puzzle-cell-clicked', { path })
      socket.to(`admin:${sid}`).emit('puzzle-cell-clicked', { path })
      maybeSchedulePuzzleResync(sid)
    })

    // ── Admin: set lobby background image ─────────────────────────────────
    socket.on('set-lobby-bg', async ({ sessionId, imageUrl }) => {
      if (!socket.admin) return
      try {
        const url = (imageUrl && typeof imageUrl === 'string') ? imageUrl : null
        await pool.query('UPDATE sessions SET lobby_bg_url = $1 WHERE id = $2 AND session_editable(id, $3)', [url, sessionId, socket.admin.id])
        broadcastToSession(sessionId, 'lobby-bg-updated', { url })
      } catch (err) { console.error(err) }
    })

    // ── Admin: show map on TV ───────────────────────────────────────────────
    socket.on('show-map', async ({ sessionId, imageUrl }) => {
      if (!socket.admin) return
      try {
        if (!imageUrl || typeof imageUrl !== 'string') return
        const defaultViewport = JSON.stringify({ xn: 0, yn: 0, scale: 1 })
        await pool.query(
          `UPDATE sessions
           SET tv_mode = 'map', current_map_url = $1, map_fog_enabled = FALSE,
               map_viewport = $2, map_fog_strokes = '[]', map_tokens = '{}', map_fog_cells = '[]'
           WHERE id = $3 AND session_editable(id, $4)`,
          [imageUrl, defaultViewport, sessionId, socket.admin.id]
        )
        const gridConfig = await getMapGridConfig(sessionId, imageUrl)
        const mapState = {
          mapUrl: imageUrl, fogEnabled: false,
          viewport: { xn: 0, yn: 0, scale: 1 }, fogStrokes: [], mapTokens: [],
          gridType: gridConfig?.gridType || 'none',
          gridCols: gridConfig?.gridCols || null,
          gridRows: gridConfig?.gridRows || null,
          gridHexOrientation: gridConfig?.gridHexOrientation || 'flat',
          gridOffsetX: gridConfig?.gridOffsetX ?? 0,
          gridOffsetY: gridConfig?.gridOffsetY ?? 0,
          gridCellW: gridConfig?.gridCellW ?? null,
          gridCellH: gridConfig?.gridCellH ?? null,
          fogCells: [],
        }
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'map' })
        broadcastToSession(sessionId, 'map-state', mapState)
      } catch (err) { console.error(err) }
    })

    // ── Admin: toggle map fog ───────────────────────────────────────────────
    socket.on('map-set-fog', async ({ sessionId, enabled }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'UPDATE sessions SET map_fog_enabled = $1 WHERE id = $2 AND session_editable(id, $3)',
          [!!enabled, sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'map-fog-updated', { enabled: !!enabled })
      } catch (err) { console.error(err) }
    })

    // ── Admin: update map viewport ──────────────────────────────────────────
    socket.on('map-viewport-update', async ({ sessionId, xn, yn, scale }) => {
      if (!socket.admin) return
      try {
        const safeScale = Math.max(MAP_SCALE_MIN, Math.min(MAP_SCALE_MAX, Number(scale) || 1))
        const safeXn = Number(xn) || 0
        const safeYn = Number(yn) || 0
        const viewport = JSON.stringify({ xn: safeXn, yn: safeYn, scale: safeScale })
        await pool.query(
            'UPDATE sessions SET map_viewport = $1 WHERE id = $2 AND session_editable(id, $3)',
            [viewport, sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('map-viewport-changed', { xn: safeXn, yn: safeYn, scale: safeScale })
      } catch (err) { console.error(err) }
    })

    // ── Admin: reveal fog strokes ───────────────────────────────────────────
    socket.on('map-fog-clear', async ({ sessionId, strokes }) => {
      if (!socket.admin) return
      try {
        if (!Array.isArray(strokes) || strokes.length === 0) return
        const sessionRes = await pool.query(
          'SELECT map_fog_strokes FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return
        let existing = []
        try {
          const raw = sessionRes.rows[0].map_fog_strokes
          existing = raw ? JSON.parse(raw) : []
          if (!Array.isArray(existing)) existing = []
        } catch { existing = [] }
        const combined = [...existing, ...strokes].slice(-MAP_FOG_STROKES_MAX)
        await pool.query(
          'UPDATE sessions SET map_fog_strokes = $1 WHERE id = $2 AND session_editable(id, $3)',
          [JSON.stringify(combined), sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'map-fog-patch', { strokes })
      } catch (err) { console.error(err) }
    })

    // ── Admin: reset fog (re-cover entire map) ──────────────────────────────
    socket.on('map-fog-reset', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          "UPDATE sessions SET map_fog_strokes = '[]', map_fog_cells = '[]' WHERE id = $1 AND session_editable(id, $2)",
          [sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'map-fog-reset')
      } catch (err) { console.error(err) }
    })

    // ── Admin: reveal grid cells (cell-based fog) ───────────────────────────
    socket.on('map-fog-cell-reveal', async ({ sessionId, cells }) => {
      if (!socket.admin) return
      try {
        if (!Array.isArray(cells) || cells.length === 0) return
        const sessionRes = await pool.query(
          'SELECT map_fog_cells FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return
        let existing = []
        try {
          const raw = sessionRes.rows[0].map_fog_cells
          existing = raw ? JSON.parse(raw) : []
          if (!Array.isArray(existing)) existing = []
        } catch { existing = [] }
        const validCells = cells.filter(c => Number.isInteger(c) && c >= 0)
        const merged = [...new Set([...existing, ...validCells])]
        await pool.query(
          'UPDATE sessions SET map_fog_cells = $1 WHERE id = $2 AND session_editable(id, $3)',
          [JSON.stringify(merged), sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'map-fog-cells-patch', { cells: validCells })
      } catch (err) { console.error(err) }
    })

    // ── Admin: sync grid config to TV after save ────────────────────────────
    socket.on('map-sync-grid', ({ sessionId, gridType, gridCols, gridRows, gridHexOrientation, gridOffsetX, gridOffsetY, gridCellW, gridCellH }) => {
      if (!socket.admin) return
      const payload = {
        gridType: gridType || 'none',
        gridCols: gridCols || 20,
        gridRows: gridRows || 15,
        gridHexOrientation: gridHexOrientation || 'flat',
        gridOffsetX: gridOffsetX ?? 0,
        gridOffsetY: gridOffsetY ?? 0,
        gridCellW: gridCellW ?? null,
        gridCellH: gridCellH ?? null,
      }
      broadcastToSession(sessionId, 'map-grid-updated', payload)
    })

    // ── Admin: reset cell-based fog ─────────────────────────────────────────
    socket.on('map-fog-cells-reset', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          "UPDATE sessions SET map_fog_cells = '[]' WHERE id = $1 AND session_editable(id, $2)",
          [sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'map-fog-cells-reset')
      } catch (err) { console.error(err) }
    })

    // ── Admin: move player token on map ─────────────────────────────────────
    socket.on('map-token-move', async ({ sessionId, playerId, nx, ny, name }) => {
      if (!socket.admin) return
      try {
        const sessionRes = await pool.query(
          'SELECT map_tokens FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return
        let tokens = {}
        try { tokens = JSON.parse(sessionRes.rows[0].map_tokens || '{}') } catch {}
        const existing = tokens[String(playerId)] || {}
        tokens[String(playerId)] = { ...existing, nx: Number(nx) || 0, ny: Number(ny) || 0, ...(name !== undefined ? { name } : {}) }
        await pool.query(
          'UPDATE sessions SET map_tokens = $1 WHERE id = $2 AND session_editable(id, $3)',
          [JSON.stringify(tokens), sessionId, socket.admin.id]
        )
        const saved = tokens[String(playerId)]
        broadcastToSession(sessionId, 'map-token-moved', { playerId, nx: saved.nx, ny: saved.ny, ...(saved.name ? { name: saved.name } : {}) })
      } catch (err) { console.error(err) }
    })

    // ── Admin: remove player token from map ─────────────────────────────────
    socket.on('map-token-remove', async ({ sessionId, playerId }) => {
      if (!socket.admin) return
      try {
        const sessionRes = await pool.query(
          'SELECT map_tokens FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return
        let tokens = {}
        try { tokens = JSON.parse(sessionRes.rows[0].map_tokens || '{}') } catch {}
        delete tokens[String(playerId)]
        await pool.query(
          'UPDATE sessions SET map_tokens = $1 WHERE id = $2 AND session_editable(id, $3)',
          [JSON.stringify(tokens), sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'map-token-removed', { playerId })
      } catch (err) { console.error(err) }
    })

    // ── Admin: send message ─────────────────────────────────────────────────
    socket.on('send-message', async ({ sessionId, toPlayerId, type, content, voiceStyle, textEffect, authorName, authorColor }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        if (!toPlayerId) {
          const cnt = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
          if ((cnt.rows[0]?.total || 0) === 0) { socket.emit('send-error', { message: 'Aucun joueur connecté.' }); return }
        }
        const fromName = (authorName && authorName.trim()) ? authorName.trim() : socket.admin.username
        const vStyle = voiceStyle || 'normal'
        const tEffect = textEffect || 'none'
        const aColor = authorColor || '#d4af37'
        const inserted = await pool.query('INSERT INTO messages (session_id, from_name, to_player_id, type, content, voice_style, text_effect, author_color) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
          [sessionId, fromName, toPlayerId || null, type, content, vStyle, tEffect, aColor])
        const msg = { id: inserted.rows[0].id, fromName, type, content, voiceStyle: vStyle, textEffect: tEffect, authorColor: aColor, sentAt: new Date() }
        if (toPlayerId) {
          const pr = await pool.query('SELECT socket_id FROM players WHERE id = $1', [toPlayerId])
          if (pr.rows[0]?.socket_id) io.to(pr.rows[0].socket_id).emit('new-message', msg)
        } else {
          io.to(`session:${sessionId}`).emit('new-message', msg)
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: send dice result ─────────────────────────────────────────────
    socket.on('send-dice-result', async ({ sessionId, combatType, rollValue, resultText, toPlayerId }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        if (!toPlayerId) {
          const cnt = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
          if ((cnt.rows[0]?.total || 0) === 0) { socket.emit('send-error', { message: 'Aucun joueur connecté.' }); return }
        }
        await pool.query('INSERT INTO dice_results (session_id, combat_type, roll_value, result_text, sent_to) VALUES ($1, $2, $3, $4, $5)',
          [sessionId, combatType, rollValue, resultText, toPlayerId || null])
        const diceData = { combatType, rollValue, resultText, createdAt: new Date() }
        if (toPlayerId) {
          const pr = await pool.query('SELECT socket_id FROM players WHERE id = $1', [toPlayerId])
          if (pr.rows[0]?.socket_id) io.to(pr.rows[0].socket_id).emit('dice-result', diceData)
        } else {
          io.to(`session:${sessionId}`).emit('dice-result', diceData)
        }
      } catch (err) { console.error(err) }
    })

    // ── Player: roll dice ───────────────────────────────────────────────────
    socket.on('player-roll', async ({ diceType, diceCount, modifier, rollType, hidden, rolls, total }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const pr = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pr.rows[0]?.player_name || 'Inconnu'

        const sides = Math.max(2, parseInt(diceType) || 20)
        const count = Math.max(1, Math.min(20, parseInt(diceCount) || 1))
        const mod = Math.max(-99, Math.min(99, parseInt(modifier) || 0))
        const type = ['normal', 'advantage', 'disadvantage'].includes(rollType) ? rollType : 'normal'

        let finalRolls, finalTotal

        if (hidden) {
          const rollSet = () => Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
          if (type === 'advantage') {
            const s1 = rollSet()
            const s2 = rollSet()
            finalRolls = s1.reduce((a, b) => a + b, 0) >= s2.reduce((a, b) => a + b, 0) ? s1 : s2
          } else if (type === 'disadvantage') {
            const s1 = rollSet()
            const s2 = rollSet()
            finalRolls = s1.reduce((a, b) => a + b, 0) <= s2.reduce((a, b) => a + b, 0) ? s1 : s2
          } else {
            finalRolls = rollSet()
          }
          finalTotal = finalRolls.reduce((a, b) => a + b, 0) + mod
        } else {
          finalRolls = Array.isArray(rolls) ? rolls.slice(0, 20).map(r => parseInt(r) || 0) : []
          // Validate each roll is within expected bounds
          if (!finalRolls.every(r => r >= 1 && r <= sides)) {
            socket.emit('error', { message: 'Valeurs de dés invalides.' })
            return
          }
          const expectedTotal = finalRolls.reduce((a, b) => a + b, 0) + mod
          // Validate the total matches the declared rolls + modifier
          finalTotal = expectedTotal
        }

        const payload = {
          playerName,
          diceType: sides,
          diceCount: count,
          modifier: mod,
          rollType: type,
          hidden,
          rolls: finalRolls,
          total: finalTotal,
        }

        io.to(`admin:${socket.sessionId}`).emit('player-roll-result', payload)

        if (!hidden) {
          socket.emit('player-roll-confirmed', payload)
        } else {
          socket.emit('player-roll-hidden-sent')
        }
      } catch (err) { console.error(err) }
    })

    // ── Player: send secret message to DM ──────────────────────────────────
    socket.on('player-send-message', async ({ content }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const pr = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pr.rows[0]?.player_name || 'Inconnu'
        const trimmed = (content || '').trim().slice(0, 1000)
        if (!trimmed) return
        await pool.query(
          'INSERT INTO messages (session_id, from_name, from_player_id, type, content) VALUES ($1, $2, $3, $4, $5)',
          [socket.sessionId, playerName, socket.playerId, 'player', trimmed]
        )
        io.to(`admin:${socket.sessionId}`).emit('player-message', {
          playerName,
          playerId: socket.playerId,
          content: trimmed,
          sentAt: new Date(),
        })
        socket.emit('player-message-sent')
      } catch (err) { console.error(err) }
    })

    // ── Admin: send gold split to players ───────────────────────────────────
    socket.on('send-gold-split', async ({ sessionId, shares }) => {
      if (!socket.admin) return
      try {
        if (!Array.isArray(shares) || shares.length === 0) return
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return

        for (const share of shares) {
          const { playerId, pp = 0, po = 0, pe = 0, pa = 0, pc = 0 } = share
          if (!playerId) continue
          const parts = []
          if (pp > 0) parts.push(`${pp} PP`)
          if (po > 0) parts.push(`${po} PO`)
          if (pe > 0) parts.push(`${pe} PE`)
          if (pa > 0) parts.push(`${pa} PA`)
          if (pc > 0) parts.push(`${pc} PC`)
          const content = parts.length > 0
            ? parts.join(', ')
            : 'Rien (le trésor ne se divise pas équitablement pour vous)'
          const pr = await pool.query('SELECT socket_id FROM players WHERE id = $1 AND session_id = $2', [playerId, sessionId])
          if (pr.rows[0]?.socket_id) {
            io.to(pr.rows[0].socket_id).emit('new-message', {
              fromName: socket.admin.username,
              type: 'gold',
              content,
              sentAt: new Date(),
            })
          }
        }
      } catch (err) { console.error(err) }
    })

    socket.on('disconnect', async () => { await onPlayerDisconnect(socket) })

    // ── Admin: create merchant ──────────────────────────────────────────────
    socket.on('create-merchant', async ({ sessionId, name, description, items }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        const mr = await pool.query(
          'INSERT INTO merchants (session_id, name, description) VALUES ($1, $2, $3) RETURNING *',
          [sessionId, name, description || '']
        )
        const merchant = mr.rows[0]
        for (const item of (items || [])) {
          await pool.query(
            'INSERT INTO merchant_items (merchant_id, name, description, price, stock, category, is_magic, rarity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [merchant.id, item.name, item.description || '', item.price, item.stock ?? -1, item.category || 'Divers', !!item.isMagic, item.rarity || null]
          )
        }
        const merchantData = await getMerchantData(merchant.id)
        socket.emit('merchant-created', merchantData)
      } catch (err) {
        console.error(err)
        socket.emit('error', { message: 'Erreur lors de la création du marchand' })
      }
    })

    // ── Admin: update merchant (name/description + items upsert) ────────────
    socket.on('update-merchant', async ({ sessionId, merchantId, name, description, items }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        const mr = await pool.query(
          'UPDATE merchants SET name = $1, description = $2 WHERE id = $3 AND session_id = $4 RETURNING *',
          [name, description || '', merchantId, sessionId]
        )
        if (!mr.rows[0]) return

        const existingRes = await pool.query('SELECT id FROM merchant_items WHERE merchant_id = $1', [merchantId])
        const existingIds = new Set(existingRes.rows.map(r => r.id))
        const keptIds = new Set()

        for (const item of (items || [])) {
          if (item.id && existingIds.has(item.id)) {
            keptIds.add(item.id)
            await pool.query(
              'UPDATE merchant_items SET name = $1, description = $2, price = $3, stock = $4, category = $5, is_magic = $6, rarity = $7 WHERE id = $8',
              [item.name, item.description || '', item.price, item.stock ?? -1, item.category || 'Divers', !!item.isMagic, item.rarity || null, item.id]
            )
          } else {
            await pool.query(
              'INSERT INTO merchant_items (merchant_id, name, description, price, stock, category, is_magic, rarity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
              [merchantId, item.name, item.description || '', item.price, item.stock ?? -1, item.category || 'Divers', !!item.isMagic, item.rarity || null]
            )
          }
        }

        // Items retirés du formulaire : suppression directe si jamais achetés, sinon
        // archivage (stock à 0) car purchase_requests.item_id référence merchant_items
        // sans ON DELETE CASCADE — un DELETE échouerait sur une contrainte FK.
        for (const id of existingIds) {
          if (keptIds.has(id)) continue
          const historyRes = await pool.query('SELECT 1 FROM purchase_requests WHERE item_id = $1 LIMIT 1', [id])
          if (historyRes.rows.length > 0) {
            await pool.query('UPDATE merchant_items SET stock = 0 WHERE id = $1', [id])
          } else {
            await pool.query('DELETE FROM merchant_items WHERE id = $1', [id])
          }
        }

        const merchantData = await getMerchantData(merchantId)
        socket.emit('merchant-updated', merchantData)
        broadcastToSession(sessionId, 'merchant-items-updated', merchantData, ['tv', 'session'])
      } catch (err) {
        console.error(err)
        socket.emit('error', { message: 'Erreur lors de la mise à jour du marchand' })
      }
    })

    // ── Admin: show merchant on TV ──────────────────────────────────────────
    socket.on('show-merchant', async ({ sessionId, merchantId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_merchant_id = $2 WHERE id = $3 AND session_editable(id, $4)',
          ['merchant', merchantId, sessionId, socket.admin.id]
        )
        const merchantData = await getMerchantData(merchantId)
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'merchant', merchantData })
        io.to(`session:${sessionId}`).emit('merchant-shown', merchantData)
      } catch (err) { console.error(err) }
    })

    // ── Player: request purchase (single item, legacy) ──────────────────────
    socket.on('request-purchase', async ({ itemId, quantity }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const itemRes = await pool.query('SELECT * FROM merchant_items WHERE id = $1', [itemId])
        const item = itemRes.rows[0]
        if (!item) { socket.emit('purchase-error', { message: 'Objet introuvable.' }); return }
        const qty = Math.max(1, parseInt(quantity) || 1)
        if (item.stock !== -1 && item.stock < qty) {
          socket.emit('purchase-error', { message: 'Stock insuffisant.' }); return
        }
        const pname = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pname.rows[0]?.player_name || 'Inconnu'
        const pr = await pool.query(
          'INSERT INTO purchase_requests (session_id, merchant_id, item_id, player_id, player_name, quantity, base_price, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [socket.sessionId, item.merchant_id, itemId, socket.playerId, playerName, qty, item.price * qty, 'pending']
        )
        const request = pr.rows[0]
        const requestData = {
          id: request.id, item_id: itemId, item_name: item.name, quantity: qty,
          base_price: request.base_price, player_name: playerName, player_id: socket.playerId,
        }
        io.to(`admin:${socket.sessionId}`).emit('purchase-request', requestData)
        socket.emit('purchase-requested', { requestId: request.id, itemId, itemName: item.name })
      } catch (err) { console.error(err) }
    })

    // ── Player: request batch purchase (cart) ───────────────────────────────
    socket.on('request-batch-purchase', async ({ items }) => {
      if (!socket.playerId || !socket.sessionId) return
      if (!Array.isArray(items) || items.length === 0) {
        socket.emit('purchase-error', { message: 'Panier vide.' }); return
      }
      try {
        const pname = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pname.rows[0]?.player_name || 'Inconnu'
        const batchId = crypto.randomUUID()
        const batchItems = []
        let totalPrice = 0
        let merchantId = null
        for (const { itemId, quantity } of items) {
          const itemRes = await pool.query('SELECT * FROM merchant_items WHERE id = $1', [itemId])
          const item = itemRes.rows[0]
          if (!item) continue
          const qty = Math.max(1, parseInt(quantity) || 1)
          if (item.stock !== -1 && item.stock < qty) continue
          const linePrice = item.price * qty
          totalPrice += linePrice
          merchantId = item.merchant_id
          const pr = await pool.query(
            'INSERT INTO purchase_requests (session_id, merchant_id, item_id, player_id, player_name, quantity, base_price, status, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [socket.sessionId, item.merchant_id, itemId, socket.playerId, playerName, qty, linePrice, 'pending', batchId]
          )
          batchItems.push({
            request_id: pr.rows[0].id,
            item_id: itemId,
            item_name: item.name,
            quantity: qty,
            unit_price: item.price,
            total_price: linePrice,
          })
        }
        if (batchItems.length === 0) {
          socket.emit('purchase-error', { message: 'Aucun article disponible dans votre panier.' }); return
        }
        const requestData = {
          batch_id: batchId,
          merchant_id: merchantId,
          player_name: playerName,
          player_id: socket.playerId,
          items: batchItems,
          total_price: totalPrice,
        }
        io.to(`admin:${socket.sessionId}`).emit('purchase-request', requestData)
        socket.emit('purchase-requested', { batchId, items: batchItems })
      } catch (err) { console.error(err); socket.emit('purchase-error', { message: 'Erreur lors de la demande.' }) }
    })

    // ── Admin: respond to purchase (single legacy item) ─────────────────────
    socket.on('respond-purchase', async ({ requestId, action, finalPrice }) => {
      if (!socket.admin) return
      try {
        const reqRes = await pool.query(
          `SELECT pr.*, mi.stock AS item_stock, mi.name AS item_name
           FROM purchase_requests pr JOIN merchant_items mi ON pr.item_id = mi.id
           JOIN sessions s ON s.id = pr.session_id
           WHERE pr.id = $1 AND session_editable(s.id, $2)`,
          [requestId, socket.admin.id]
        )
        const req = reqRes.rows[0]
        if (!req || req.status !== 'pending') return
        const playerSocketRes = await pool.query('SELECT socket_id FROM players WHERE id = $1', [req.player_id])
        const playerSocketId = playerSocketRes.rows[0]?.socket_id

        if (action === 'accept') {
          if (req.item_stock !== -1) {
            await pool.query(
              'UPDATE merchant_items SET stock = GREATEST(0, stock - $1) WHERE id = $2',
              [req.quantity, req.item_id]
            )
          }
          await pool.query('UPDATE purchase_requests SET status = $1, final_price = $2 WHERE id = $3', ['accepted', req.base_price, requestId])
          const items = [{ item_name: req.item_name, quantity: req.quantity, total_price: req.base_price }]
          if (playerSocketId) io.to(playerSocketId).emit('batch-accepted', { items, totalPrice: req.base_price })
          const merchantData = await getMerchantData(req.merchant_id)
          socket.emit('merchant-updated', merchantData)
          broadcastToSession(req.session_id, 'merchant-items-updated', merchantData, ['tv', 'session'])
          const purchaseDesc = `Achat accepté : ${req.quantity}× ${req.item_name} (${req.base_price} po) — ${req.player_name}`.slice(0, 200)
          await logSessionEvent(req.session_id, 'purchase_accepted', purchaseDesc, { playerName: req.player_name, value: req.base_price })
        } else if (action === 'discount' || action === 'increase') {
          const fp = Math.max(0, parseInt(finalPrice) || req.base_price)
          await pool.query('UPDATE purchase_requests SET status = $1, final_price = $2 WHERE id = $3', [action, fp, requestId])
          if (playerSocketId) io.to(playerSocketId).emit('purchase-counter-offer', { requestId, action, finalPrice: fp, itemName: req.item_name })
        } else if (action === 'reject') {
          await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['rejected', requestId])
          const items = [{ item_name: req.item_name, quantity: req.quantity, total_price: req.base_price }]
          if (playerSocketId) io.to(playerSocketId).emit('batch-rejected', { items })
          const rejectDesc = `Achat refusé : ${req.quantity}× ${req.item_name} — ${req.player_name}`.slice(0, 200)
          await logSessionEvent(req.session_id, 'purchase_rejected', rejectDesc, { playerName: req.player_name })
        }
        socket.emit('purchase-responded', { requestId, action })
      } catch (err) { console.error(err) }
    })

    // ── Admin: respond to batch purchase ────────────────────────────────────
    socket.on('respond-batch-purchase', async ({ batchId, action, finalPrice }) => {
      if (!socket.admin) return
      try {
        const reqsRes = await pool.query(
          `SELECT pr.*, mi.stock AS item_stock, mi.name AS item_name
           FROM purchase_requests pr JOIN merchant_items mi ON pr.item_id = mi.id
           JOIN sessions s ON s.id = pr.session_id
           WHERE pr.batch_id = $1 AND pr.status = 'pending' AND session_editable(s.id, $2)`,
          [batchId, socket.admin.id]
        )
        const reqs = reqsRes.rows
        if (reqs.length === 0) return
        const playerSocketRes = await pool.query('SELECT socket_id FROM players WHERE id = $1', [reqs[0].player_id])
        const playerSocketId = playerSocketRes.rows[0]?.socket_id

        if (action === 'accept' || action === 'discount' || action === 'increase') {
          const baseTotal = reqs.reduce((sum, req) => sum + req.base_price, 0)
          const parsedFinalPrice = Number(finalPrice)
          const targetTotal = action === 'accept'
            ? baseTotal
            : (Number.isFinite(parsedFinalPrice) ? Math.max(0, Math.round(parsedFinalPrice)) : baseTotal)

          const finalPrices = reqs.map((req, index) => {
            if (index === reqs.length - 1) return 0
            if (baseTotal <= 0) return 0
            return Math.max(0, Math.round((req.base_price / baseTotal) * targetTotal))
          })
          const distributed = finalPrices.reduce((sum, p) => sum + p, 0)
          // Last line gets the remainder to keep the grand total stable despite rounding.
          finalPrices[reqs.length - 1] = Math.max(0, targetTotal - distributed)
          const finalTotal = finalPrices.reduce((sum, p) => sum + p, 0)

          for (let i = 0; i < reqs.length; i++) {
            const req = reqs[i]
            if (req.item_stock !== -1) {
              await pool.query('UPDATE merchant_items SET stock = GREATEST(0, stock - $1) WHERE id = $2', [req.quantity, req.item_id])
            }
            await pool.query('UPDATE purchase_requests SET status = $1, final_price = $2 WHERE id = $3', ['accepted', finalPrices[i], req.id])
          }
          const items = reqs.map((r, i) => ({ item_name: r.item_name, quantity: r.quantity, total_price: finalPrices[i] }))
          if (playerSocketId) io.to(playerSocketId).emit('batch-accepted', { batchId, items, totalPrice: finalTotal })
          const merchantData = await getMerchantData(reqs[0].merchant_id)
          socket.emit('merchant-updated', merchantData)
          broadcastToSession(reqs[0].session_id, 'merchant-items-updated', merchantData, ['tv', 'session'])
          socket.emit('purchase-responded', { batchId, action, totalPrice: finalTotal })
          const batchDesc = `Achat accepté : ${items.map(i => `${i.quantity}× ${i.item_name}`).join(', ')} (${finalTotal} po) — ${reqs[0].player_name}`.slice(0, 200)
          await logSessionEvent(reqs[0].session_id, 'purchase_accepted', batchDesc, { playerName: reqs[0].player_name, value: finalTotal })
        } else if (action === 'reject') {
          for (const req of reqs) {
            await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['rejected', req.id])
          }
          const items = reqs.map(r => ({ item_name: r.item_name, quantity: r.quantity, total_price: r.base_price }))
          if (playerSocketId) io.to(playerSocketId).emit('batch-rejected', { batchId, items })
          socket.emit('purchase-responded', { batchId, action })
          const batchRejectDesc = `Achat refusé : ${items.map(i => `${i.quantity}× ${i.item_name}`).join(', ')} — ${reqs[0].player_name}`.slice(0, 200)
          await logSessionEvent(reqs[0].session_id, 'purchase_rejected', batchRejectDesc, { playerName: reqs[0].player_name })
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: close merchant ────────────────────────────────────────────────
    socket.on('close-merchant', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          "UPDATE sessions SET tv_mode = 'lobby', current_merchant_id = NULL WHERE id = $1 AND session_editable(id, $2)",
          [sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'lobby' })
        io.to(`session:${sessionId}`).emit('merchant-closed')
      } catch (err) { console.error(err) }
    })

    // ── Admin: delete merchant ───────────────────────────────────────────────
    socket.on('delete-merchant', async ({ sessionId, merchantId }) => {
      if (!socket.admin) return
      try {
        // If this merchant is currently shown on TV, reset TV to lobby first
        const sessionRes = await pool.query(
          'SELECT current_merchant_id FROM sessions WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return
        const isCurrentlyShown = sessionRes.rows[0].current_merchant_id === merchantId
        if (isCurrentlyShown) {
          await pool.query(
            "UPDATE sessions SET tv_mode = 'lobby', current_merchant_id = NULL WHERE id = $1",
            [sessionId]
          )
          io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
          io.to(`session:${sessionId}`).emit('merchant-closed')
        }
        // Delete merchant (merchant_items cascade via FK)
        await pool.query(
          'DELETE FROM merchants WHERE id = $1 AND session_id = $2',
          [merchantId, sessionId]
        )
        io.to(`admin:${sessionId}`).emit('merchant-deleted', { merchantId })
      } catch (err) { console.error(err) }
    })

    // ── Player: respond to counter offer ────────────────────────────────────
    socket.on('respond-counter-offer', async ({ requestId, accept }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const reqRes = await pool.query(
          `SELECT pr.*, mi.stock AS item_stock
           FROM purchase_requests pr JOIN merchant_items mi ON pr.item_id = mi.id
           WHERE pr.id = $1 AND pr.player_id = $2`,
          [requestId, socket.playerId]
        )
        const req = reqRes.rows[0]
        if (!req || !['discount', 'increase'].includes(req.status)) return

        if (accept) {
          if (req.item_stock !== -1) {
            await pool.query(
              'UPDATE merchant_items SET stock = GREATEST(0, stock - $1) WHERE id = $2',
              [req.quantity, req.item_id]
            )
          }
          await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['accepted', requestId])
          socket.emit('counter-offer-result', { requestId, accepted: true, itemName: req.item_name, finalPrice: req.final_price })
          const merchantData = await getMerchantData(req.merchant_id)
          io.to(`admin:${socket.sessionId}`).emit('merchant-updated', merchantData)
          broadcastToSession(socket.sessionId, 'merchant-items-updated', merchantData, ['tv', 'session'])
        } else {
          await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['declined', requestId])
          socket.emit('counter-offer-result', { requestId, accepted: false, itemName: req.item_name })
        }
        io.to(`admin:${socket.sessionId}`).emit('counter-offer-response', { requestId, accepted: accept, playerName: req.player_name })
      } catch (err) { console.error(err) }
    })

    // ── Admin: set combat round ──────────────────────────────────────────────
    socket.on('set-combat-round', async ({ sessionId, round }) => {
      if (!socket.admin) return
      try {
        const safeRound = Math.max(0, Math.min(MAX_COMBAT_ROUND, parseInt(round) || 0))
        const roundUpdateRes = await pool.query(
          'UPDATE sessions SET combat_round = $1 WHERE id = $2 AND session_editable(id, $3)',
          [safeRound, sessionId, socket.admin.id]
        )
        if (roundUpdateRes.rowCount === 0) return
        broadcastToSession(sessionId, 'round-updated', { round: safeRound })
        const roundDesc = safeRound === 0 ? 'Réinitialisation du round de combat' : `Round de combat : ${safeRound}`
        await logSessionEvent(sessionId, 'combat_round', roundDesc, { value: safeRound })
      } catch (err) { console.error(err) }
    })

    // ── Admin: start free timer ──────────────────────────────────────────────
    socket.on('start-timer', async ({ sessionId, label, durationSeconds }) => {
      if (!socket.admin) return
      try {
        const parsedDuration = parseInt(durationSeconds, 10)
        if (Number.isNaN(parsedDuration)) return
        const safeDuration = Math.max(MIN_TIMER_DURATION_SECONDS, Math.min(MAX_TIMER_DURATION_SECONDS, parsedDuration))
        const endAt = new Date(Date.now() + safeDuration * 1000)
        const safeLabel = (label || 'Minuteur').trim().slice(0, MAX_TITLE_LENGTH) || 'Minuteur'
        await pool.query(
          'UPDATE sessions SET timer_label = $1, timer_end_at = $2 WHERE id = $3 AND session_editable(id, $4)',
          [safeLabel, endAt, sessionId, socket.admin.id]
        )
        const payload = { label: safeLabel, endAt: endAt.toISOString() }
        broadcastToSession(sessionId, 'timer-updated', payload)
      } catch (err) { console.error(err) }
    })

    // ── Admin: stop free timer ───────────────────────────────────────────────
    socket.on('stop-timer', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'UPDATE sessions SET timer_label = NULL, timer_end_at = NULL WHERE id = $1 AND session_editable(id, $2)',
          [sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'timer-stopped')
      } catch (err) { console.error(err) }
    })

    // ── Admin: Obsidian sync — bulk initiative update by player name ─────────
    socket.on('obsidian-sync-initiatives', async ({ sessionId, updates }) => {
      if (!socket.admin) return
      if (!Array.isArray(updates) || updates.length === 0) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return

        const client = await pool.connect()
        const updatedPlayers = []
        try {
          await client.query('BEGIN')
          for (const { playerName, initiative } of updates) {
            if (typeof playerName !== 'string' || playerName.trim() === '') continue
            const parsed = parseInt(initiative, 10)
            const value = Number.isFinite(parsed)
              ? Math.max(INITIATIVE_MIN, Math.min(INITIATIVE_MAX, parsed))
              : null
            const res = await client.query(
              `UPDATE players SET initiative = $1
               WHERE session_id = $2 AND LOWER(player_name) = LOWER($3)
               RETURNING id, initiative`,
              [value, sessionId, playerName.trim()]
            )
            if (res.rows[0]) updatedPlayers.push(res.rows[0])
          }
          await client.query('COMMIT')
        } catch (dbErr) {
          await client.query('ROLLBACK')
          throw dbErr
        } finally {
          client.release()
        }
        for (const p of updatedPlayers) {
          const event = { playerId: p.id, initiative: p.initiative }
          broadcastToSession(sessionId, 'initiative-updated', event)
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: update HP by player name (for Obsidian sync) ─────────────────
    socket.on('admin-update-hp', async ({ sessionId, playerName, currentHp }) => {
      if (!socket.admin) return
      if (typeof playerName !== 'string' || playerName.trim() === '') return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return

        const parsed = parseInt(currentHp, 10)
        if (!Number.isFinite(parsed)) return

        const res = await pool.query(
          `UPDATE players SET current_hp = GREATEST(0, LEAST($1, max_hp))
           WHERE session_id = $2 AND LOWER(player_name) = LOWER($3)
           RETURNING id, current_hp, max_hp, temp_hp, player_name`,
          [parsed, sessionId, playerName.trim()]
        )
        const player = res.rows[0]
        if (!player) return

        const event = { playerId: player.id, newHp: player.current_hp, tempHp: player.temp_hp }
        broadcastToSession(sessionId, 'hp-updated', event)

        if (player.current_hp === 0) {
          await logSessionEvent(sessionId, 'death', `${player.player_name} est tombé à 0 PV`, { playerName: player.player_name })
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: audio control from Obsidian ──────────────────────────────────
    socket.on('obsidian-play-audio', ({ sessionId, trackId }) => {
      if (!socket.admin) return
      if (!Number.isInteger(trackId) || trackId <= 0) return
      const adminRoom = io.sockets.adapter.rooms.get(`admin:${sessionId}`)
      const otherAdmins = adminRoom ? [...adminRoom].filter(id => id !== socket.id) : []
      if (otherAdmins.length === 0) {
        socket.emit('obsidian-audio-error', { message: 'Aucun client DM Toolkit connecté pour relayer la commande audio.' })
        return
      }
      io.to(`admin:${sessionId}`).emit('audio-play-requested', { trackId })
    })

    socket.on('obsidian-stop-audio', ({ sessionId, trackId }) => {
      if (!socket.admin) return
      if (!Number.isInteger(trackId) || trackId <= 0) return
      const adminRoom = io.sockets.adapter.rooms.get(`admin:${sessionId}`)
      const otherAdmins = adminRoom ? [...adminRoom].filter(id => id !== socket.id) : []
      if (otherAdmins.length === 0) {
        socket.emit('obsidian-audio-error', { message: 'Aucun client DM Toolkit connecté pour relayer la commande audio.' })
        return
      }
      io.to(`admin:${sessionId}`).emit('audio-stop-requested', { trackId })
    })

    socket.on('obsidian-loop-audio', ({ sessionId, trackId, loop }) => {
      if (!socket.admin) return
      if (!Number.isInteger(trackId) || trackId <= 0) return
      const adminRoom = io.sockets.adapter.rooms.get(`admin:${sessionId}`)
      const otherAdmins = adminRoom ? [...adminRoom].filter(id => id !== socket.id) : []
      if (otherAdmins.length === 0) {
        socket.emit('obsidian-audio-error', { message: 'Aucun client DM Toolkit connecté pour relayer la commande audio.' })
        return
      }
      io.to(`admin:${sessionId}`).emit('audio-loop-requested', { trackId, loop: !!loop })
    })

    socket.on('obsidian-volume-audio', ({ sessionId, trackId, volume }) => {
      if (!socket.admin) return
      if (!Number.isInteger(trackId) || trackId <= 0) return
      const adminRoom = io.sockets.adapter.rooms.get(`admin:${sessionId}`)
      const otherAdmins = adminRoom ? [...adminRoom].filter(id => id !== socket.id) : []
      if (otherAdmins.length === 0) {
        socket.emit('obsidian-audio-error', { message: 'Aucun client DM Toolkit connecté pour relayer la commande audio.' })
        return
      }
      const vol = Math.max(0, Math.min(1, Number(volume))) || 0
      io.to(`admin:${sessionId}`).emit('audio-volume-requested', { trackId, volume: vol })
    })

    // ── Admin: Obsidian → show image on TV by name ───────────────────────────
    socket.on('obsidian-show-image', async ({ sessionId, imageName }) => {
      if (!socket.admin) return
      if (!imageName || typeof imageName !== 'string' || !Number.isInteger(sessionId)) return
      try {
        const { rows } = await pool.query(
          `SELECT url, tv_label FROM session_images
           WHERE session_id = $1 AND type IN ('image', 'map')
             AND LOWER(original_name) = LOWER($2)`,
          [sessionId, imageName.trim()]
        )
        if (!rows.length) {
          socket.emit('obsidian-image-error', { message: `Image "${imageName}" introuvable dans la session.` })
          return
        }
        const imageUrl = rows[0].url
        const imageLabel = rows[0].tv_label || null
        await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_image_url = $2, current_image_label = $3 WHERE id = $4 AND session_editable(id, $5)',
          ['image', imageUrl, imageLabel, sessionId, socket.admin.id]
        )
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'image', imageUrl, imageLabel })
        socket.emit('obsidian-image-shown', { imageName: imageName.trim() })
      } catch (err) { console.error(err) }
    })

    // ── Admin: kick player ───────────────────────────────────────────────────
    socket.on('kick-player', async ({ playerId }) => {
      if (!socket.admin) return
      try {
        const pr = await pool.query(
          `SELECT p.socket_id, p.player_name, p.session_id
           FROM players p
           JOIN sessions s ON s.id = p.session_id
           WHERE p.id = $1 AND session_editable(s.id, $2)`,
          [playerId, socket.admin.id]
        )
        const player = pr.rows[0]
        if (!player) return
        // Notify and clear real-time session state for the kicked player
        if (player.socket_id) {
          const playerSocket = io.sockets.sockets.get(player.socket_id)
          if (playerSocket) {
            playerSocket.leave(`session:${player.session_id}`)
            playerSocket.playerId = null
            playerSocket.sessionId = null
            playerSocket.emit('kicked')
          } else {
            io.to(player.socket_id).emit('kicked')
          }
        }
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query('DELETE FROM vote_responses WHERE player_id = $1', [playerId])
          await client.query('DELETE FROM purchase_requests WHERE player_id = $1', [playerId])
          await client.query('UPDATE messages SET to_player_id = NULL WHERE to_player_id = $1', [playerId])
          await client.query('UPDATE dice_results SET sent_to = NULL WHERE sent_to = $1', [playerId])
          await client.query('DELETE FROM players WHERE id = $1', [playerId])
          await client.query('COMMIT')
        } catch (dbErr) {
          await client.query('ROLLBACK')
          throw dbErr
        } finally {
          client.release()
        }
        // Notify admin and TV
        broadcastToSession(player.session_id, 'player-left', { playerId })
        await refreshVoteForSession(player.session_id)
        // Log event
        await logSessionEvent(player.session_id, 'leave', `${player.player_name} a été expulsé de la session`, { playerName: player.player_name })
      } catch (err) { console.error(err) }
    })

    // ── Admin: create faction ────────────────────────────────────────────────
    socket.on('create-faction', async ({ sessionId, name, minValue, maxValue, initialValue }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        const safeName = String(name || '').trim().slice(0, MAX_TITLE_LENGTH)
        if (!safeName) return
        const safeMin = Math.max(MIN_FACTION_VALUE, Math.min(-1, parseInt(minValue) || -5))
        const safeMax = Math.min(MAX_FACTION_VALUE, Math.max(1, parseInt(maxValue) || 5))
        const safeInit = Math.max(safeMin, Math.min(safeMax, parseInt(initialValue) || 0))
        const r = await pool.query(
          'INSERT INTO factions (session_id, name, min_value, max_value, current_value) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [sessionId, safeName, safeMin, safeMax, safeInit]
        )
        io.to(`admin:${sessionId}`).emit('faction-created', { faction: r.rows[0] })
      } catch (err) { console.error(err) }
    })

    // ── Admin: update faction reputation value ──────────────────────────────
    socket.on('update-faction-value', async ({ sessionId, factionId, delta }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        const safeDelta = Math.max(-100, Math.min(100, parseInt(delta) || 0))
        if (safeDelta === 0) return
        const r = await pool.query(
          `WITH prev AS (SELECT current_value AS old_val FROM factions WHERE id = $2 AND session_id = $3)
           UPDATE factions
           SET current_value = GREATEST(min_value, LEAST(max_value, current_value + $1))
           WHERE id = $2 AND session_id = $3
           RETURNING *, (SELECT old_val FROM prev) AS old_value`,
          [safeDelta, factionId, sessionId]
        )
        if (!r.rows[0]) return
        const faction = r.rows[0]
        const oldValue = parseInt(faction.old_value)
        const newValue = faction.current_value
        if (oldValue === newValue) return
        const factions = await getFactionsBySession(sessionId)
        broadcastToSession(sessionId, 'factions-updated', factions)
        const sessionRow = await pool.query('SELECT tv_mode FROM sessions WHERE id = $1', [sessionId])
        if (sessionRow.rows[0]?.tv_mode !== 'reputation') {
          io.to(`tv:${sessionId}`).emit('reputation-toast', {
            factionName: faction.name,
            oldValue,
            newValue,
            delta: newValue - oldValue,
            minValue: faction.min_value,
            maxValue: faction.max_value,
          })
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: delete faction ────────────────────────────────────────────────
    socket.on('delete-faction', async ({ sessionId, factionId }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        await pool.query('DELETE FROM factions WHERE id = $1 AND session_id = $2', [factionId, sessionId])
        io.to(`admin:${sessionId}`).emit('faction-deleted', { factionId })
      } catch (err) { console.error(err) }
    })

    // ── Admin: project faction reputations on TV ────────────────────────────
    socket.on('show-reputation', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        if (!await assertSessionAccess(sessionId, socket.admin.id)) return
        await pool.query('UPDATE sessions SET tv_mode = $1 WHERE id = $2', ['reputation', sessionId])
        const factions = await getFactionsBySession(sessionId)
        broadcastToSession(sessionId, 'tv-mode-changed', { mode: 'reputation' })
        broadcastToSession(sessionId, 'factions-updated', factions)
      } catch (err) { console.error(err) }
    })
  })
}

module.exports = setupSocket
