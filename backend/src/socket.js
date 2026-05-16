const jwt = require('jsonwebtoken')
const QRCode = require('qrcode')
const crypto = require('crypto')
const pool = require('./db')
const INITIATIVE_MIN = -10
const INITIATIVE_MAX = 99

const MIN_DOOM_DURATION_SECONDS = 5
const MAX_DOOM_DURATION_SECONDS = 24 * 60 * 60
const MIN_TIMER_DURATION_SECONDS = 5
const MAX_TIMER_DURATION_SECONDS = 24 * 60 * 60
const MAX_COMBAT_ROUND = 9999
const MIN_TENSION_STEPS = 2
const MAX_TENSION_STEPS = 20
const MAX_TITLE_LENGTH = 200
const TENSION_DIRECTIONS = new Set(['ascending', 'descending'])
const MAP_SCALE_MIN = 0.1
const MAP_SCALE_MAX = 10
const MAP_FOG_STROKES_MAX = 500

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

/**
 * Serializes the battlemap state from a session row.
 * Safely parses JSON columns (map_viewport, map_fog_strokes, map_tokens) with fallbacks.
 * Returns null if there is no active map URL.
 * @param {object} session - A row from the sessions table
 * @returns {{mapUrl, fogEnabled, viewport: {xn, yn, scale}, fogStrokes: Array, mapTokens: object}|null}
 */
function serializeMapState(session) {
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
  return {
    mapUrl: session.current_map_url,
    fogEnabled: !!session.map_fog_enabled,
    viewport,
    fogStrokes,
    mapTokens,
  }
}

/**
 * Returns the currently active vote for a session with live result counts.
 * Returns null if there is no active vote or if the vote cannot be found.
 * Used to send vote state to TV and admin on snapshot events.
 * @param {number} sessionId
 * @param {number|null} voteId
 * @returns {Promise<{id, question, options, isAnonymous, results, totalPlayers, totalVotes, voterNames}|null>}
 */
async function getActiveVote(sessionId, voteId) {
  if (!voteId) return null
  const voteInfo = await pool.query('SELECT * FROM votes WHERE id = $1 AND status = $2', [voteId, 'active'])
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
        socket.admin = jwt.verify(token, process.env.JWT_SECRET)
      } catch { /* not an admin */ }
    }
    next()
  })

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
    io.to(`tv:${sessionId}`).emit('vote-updated', voteUpdate)
    io.to(`admin:${sessionId}`).emit('vote-updated', voteUpdate)
    if (voteUpdate.totalVotes >= voteUpdate.totalPlayers) {
      const closed = await pool.query('UPDATE votes SET status = $1 WHERE id = $2 AND status = $3 RETURNING id', ['closed', voteId, 'active'])
      if (closed.rows[0]) {
        io.to(`tv:${sessionId}`).emit('vote-closed', voteUpdate)
        io.to(`session:${sessionId}`).emit('vote-closed', voteUpdate)
        io.to(`admin:${sessionId}`).emit('vote-closed', voteUpdate)
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
      await pool.query('UPDATE players SET socket_id = NULL WHERE id = $1', [socket.playerId])
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
      io.to(`admin:${socket.sessionId}`).emit('player-left', event)
      io.to(`tv:${socket.sessionId}`).emit('player-left', event)
      await refreshVoteForSession(socket.sessionId)

      // Log session event
      await pool.query(
        'INSERT INTO session_events (session_id, event_type, description, player_name) VALUES ($1, $2, $3, $4)',
        [socket.sessionId, 'leave', `${playerName} a quitté la session`, playerName]
      )
      const leaveEvent = { eventType: 'leave', description: `${playerName} a quitté la session`, playerName, createdAt: new Date() }
      io.to(`admin:${socket.sessionId}`).emit('session-event', leaveEvent)

      socket.playerId = null
      socket.sessionId = null
    } catch (err) { console.error(err) }
  }

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    // ── Player: join ────────────────────────────────────────────────────────
    socket.on('join-session', async ({ code, playerName, ac, hp, maxHp, dndClass, avatarUrl }) => {
      try {
        const cleanName = sanitizePlayerName(playerName)
        if (!cleanName) {
          socket.emit('error', { message: 'Le nom du personnage ne peut pas être vide.' })
          return
        }
        const sessionResult = await pool.query(
          "SELECT * FROM sessions WHERE code = $1 AND status = 'active'", [code])
        const session = sessionResult.rows[0]
        if (!session) { socket.emit('error', { message: 'Session introuvable ou fermée.' }); return }
        const acVal = Math.max(1, parseInt(ac) || 10)
        const hpVal = Math.max(1, parseInt(hp) || 20)
        // maxHp is optional: if provided, use it as max_hp for new players.
        // This prevents the bug where refreshing with 35/50 HP creates a player with max_hp=35.
        const maxHpVal = maxHp ? Math.max(1, parseInt(maxHp) || hpVal) : hpVal
        const classVal = dndClass || null
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
          if (existingPlayer.socket_id && existingPlayer.socket_id !== socket.id) {
            const existingSocket = io.sockets.sockets.get(existingPlayer.socket_id)
            if (existingSocket) {
              socket.emit('error', { message: 'Ce nom est déjà pris dans cette session.' })
              return
            }
          }
          const updated = await pool.query(
            `UPDATE players
             SET socket_id = $1
             WHERE id = $2
             RETURNING *`,
            [socket.id, existingPlayer.id]
          )
          player = updated.rows[0]
        } else {
          const playerResult = await pool.query(
            `INSERT INTO players (session_id, player_name, socket_id, ac, max_hp, current_hp, dnd_class, avatar_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [session.id, cleanName, socket.id, acVal, maxHpVal, hpVal, classVal, avatarVal]
          )
          player = playerResult.rows[0]
        }
        socket.join(`session:${session.id}`)
        socket.playerId = player.id
        socket.sessionId = session.id

        socket.emit('session-joined', {
          session: { id: session.id, name: session.name, code: session.code },
          player: { id: player.id, player_name: player.player_name, ac: player.ac, max_hp: player.max_hp, current_hp: player.current_hp, dnd_class: player.dnd_class, avatar_url: player.avatar_url, initiative: player.initiative, conditions: player.conditions, is_concentrating: player.is_concentrating },
          activeMerchant: (session.current_merchant_id && session.tv_mode === 'merchant')
            ? await getMerchantData(session.current_merchant_id)
            : null,
        })
        io.to(`admin:${session.id}`).emit('player-joined', player)
        io.to(`tv:${session.id}`).emit('player-joined', player)

        // Log session event
        if (!existingPlayer) {
          await pool.query(
            'INSERT INTO session_events (session_id, event_type, description, player_name) VALUES ($1, $2, $3, $4)',
            [session.id, 'join', `${cleanName} a rejoint la session`, cleanName]
          )
          const joinEvent = { eventType: 'join', description: `${cleanName} a rejoint la session`, playerName: cleanName, createdAt: new Date() }
          io.to(`admin:${session.id}`).emit('session-event', joinEvent)
        }
      } catch (err) { console.error(err); socket.emit('error', { message: 'Impossible de rejoindre la session.' }) }
    })

    socket.on('leave-session', async () => { await removePlayer(socket) })

    // ── Player: update HP ───────────────────────────────────────────────────
    socket.on('update-hp', async ({ newHp }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const hp = Math.max(0, parseInt(newHp) || 0)
        const prev = await pool.query('SELECT current_hp, player_name, is_concentrating FROM players WHERE id = $1', [socket.playerId])
        const oldHp = prev.rows[0]?.current_hp ?? 0
        const playerName = prev.rows[0]?.player_name ?? 'Inconnu'
        const wasConcentrating = prev.rows[0]?.is_concentrating ?? false
        await pool.query('UPDATE players SET current_hp = $1 WHERE id = $2', [hp, socket.playerId])
        const event = { playerId: socket.playerId, newHp: hp }
        io.to(`admin:${socket.sessionId}`).emit('hp-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('hp-updated', event)
        socket.emit('hp-update-confirmed', { newHp: hp })

        // Log session event
        const delta = hp - oldHp
        if (delta !== 0) {
          let eventType, description
          if (hp === 0) {
            eventType = 'death'
            description = `${playerName} est tombé à 0 PV !`
            if (wasConcentrating) {
              await pool.query('UPDATE players SET is_concentrating = FALSE WHERE id = $1', [socket.playerId])
              const concEvent = { playerId: socket.playerId, isConcentrating: false }
              io.to(`admin:${socket.sessionId}`).emit('concentration-updated', concEvent)
              io.to(`tv:${socket.sessionId}`).emit('concentration-updated', concEvent)
            }
          } else if (delta < 0) {
            eventType = 'damage'
            description = `${playerName} subit ${Math.abs(delta)} dégâts (${oldHp} → ${hp} PV)`
            if (wasConcentrating) {
              const dc = Math.max(10, Math.ceil(Math.abs(delta) / 2))
              socket.emit('concentration-warning', { damage: Math.abs(delta), dc })
            }
          } else {
            eventType = 'heal'
            description = `${playerName} récupère ${delta} PV (${oldHp} → ${hp} PV)`
          }
          await pool.query(
            'INSERT INTO session_events (session_id, event_type, description, player_name, value) VALUES ($1, $2, $3, $4, $5)',
            [socket.sessionId, eventType, description, playerName, delta]
          )
          const sessionEvent = { eventType, description, playerName, value: delta, createdAt: new Date() }
          io.to(`admin:${socket.sessionId}`).emit('session-event', sessionEvent)
        }
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
        const event = { playerId: socket.playerId, newHp: player.current_hp, newMaxHp: player.max_hp }
        io.to(`admin:${socket.sessionId}`).emit('hp-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('hp-updated', event)
      } catch (err) { console.error(err) }
    })

    // ── Player: update conditions ───────────────────────────────────────────
    socket.on('update-conditions', async ({ conditions }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const conditionsJson = JSON.stringify(Array.isArray(conditions) ? conditions : [])
        await pool.query('UPDATE players SET conditions = $1 WHERE id = $2', [conditionsJson, socket.playerId])
        const event = { playerId: socket.playerId, conditions }
        io.to(`admin:${socket.sessionId}`).emit('conditions-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('conditions-updated', event)
      } catch (err) { console.error(err) }
    })

    // ── Player: update concentration ────────────────────────────────────────
    socket.on('update-concentration', async ({ isConcentrating }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        await pool.query('UPDATE players SET is_concentrating = $1 WHERE id = $2', [isConcentrating, socket.playerId])
        const event = { playerId: socket.playerId, isConcentrating }
        io.to(`admin:${socket.sessionId}`).emit('concentration-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('concentration-updated', event)
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
        io.to(`admin:${socket.sessionId}`).emit('initiative-updated', event)
        io.to(`tv:${socket.sessionId}`).emit('initiative-updated', event)
        socket.emit('initiative-confirmed', { initiative: value })
      } catch (err) { console.error(err) }
    })

    // ── Admin: join room + snapshot ─────────────────────────────────────────
    socket.on('admin-join', async (sessionId) => {
      if (!socket.admin) return
      try {
        const sessionResult = await pool.query(
          'SELECT * FROM sessions WHERE id = $1 AND created_by = $2', [sessionId, socket.admin.id])
        const session = sessionResult.rows[0]
        if (!session) return
        socket.join(`admin:${sessionId}`)
        const playersResult = await pool.query(
          `SELECT id, session_id, player_name, socket_id, joined_at, ac, max_hp, current_hp, conditions, is_concentrating, initiative
           FROM players WHERE session_id = $1 ORDER BY joined_at ASC`, [sessionId])
        socket.emit('players-snapshot', { sessionId, players: playersResult.rows })
        socket.emit('admin-state', {
          sessionId,
          tvMode: session.tv_mode || 'lobby',
          doomClock: serializeDoomClock(session),
          tensionScale: serializeTensionScale(session),
          activeVote: await getActiveVote(session.id, session.current_vote_id),
          activeMerchant: (session.current_merchant_id && session.tv_mode === 'merchant')
            ? await getMerchantData(session.current_merchant_id)
            : null,
          mapState: serializeMapState(session),
          combatRound: session.combat_round || 0,
          timer: serializeTimer(session),
        })
      } catch (err) { console.error(err) }
    })

    // ── TV: join as observer ────────────────────────────────────────────────
    socket.on('tv-join', async ({ sessionCode }) => {
      try {
        const sessionResult = await pool.query(
          "SELECT * FROM sessions WHERE code = $1 AND status = 'active'", [sessionCode])
        const session = sessionResult.rows[0]
        if (!session) { socket.emit('error', { message: 'Session not found or closed.' }); return }
        socket.join(`tv:${session.id}`)
        socket.tvSessionId = session.id
        const playersResult = await pool.query(
          `SELECT id, player_name, joined_at, ac, max_hp, current_hp, dnd_class, avatar_url, conditions, is_concentrating, initiative
           FROM players WHERE session_id = $1 ORDER BY joined_at ASC`, [session.id])

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
        const joinUrl = `${frontendUrl}/join/${session.code}`
        const qrCodeDataUrl = await QRCode.toDataURL(joinUrl)

        const activeVote = await getActiveVote(session.id, session.current_vote_id)
        const doomClock = serializeDoomClock(session)

        socket.emit('tv-snapshot', {
          session: { id: session.id, name: session.name },
          players: playersResult.rows,
          tvMode: session.tv_mode || 'lobby',
          sessionCode: session.code,
          qrCodeDataUrl,
          currentImageUrl: session.current_image_url,
          activeVote,
          doomClock,
          tensionScale: serializeTensionScale(session),
          activeMerchant: (session.current_merchant_id && session.tv_mode === 'merchant')
            ? await getMerchantData(session.current_merchant_id)
            : null,
          mapState: serializeMapState(session),
          combatRound: session.combat_round || 0,
          timer: serializeTimer(session),
        })
      } catch (err) { console.error(err) }
    })

    // ── Admin: set TV mode ──────────────────────────────────────────────────
    socket.on('set-tv-mode', async ({ sessionId, mode }) => {
      if (!socket.admin) return
      try {
        await pool.query('UPDATE sessions SET tv_mode = $1 WHERE id = $2 AND created_by = $3', [mode, sessionId, socket.admin.id])
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode })
      } catch (err) { console.error(err) }
    })

    // ── Admin: start doom clock ──────────────────────────────────────────────
    socket.on('start-doom-clock', async ({ sessionId, title, durationSeconds }) => {
      if (!socket.admin) return
      try {
        const parsedDuration = parseInt(durationSeconds, 10)
        if (Number.isNaN(parsedDuration)) {
          socket.emit('tv-control-error', { message: 'Durée invalide (entre 5 secondes et 24 heures).' })
          return
        }
        const safeDuration = Math.max(MIN_DOOM_DURATION_SECONDS, Math.min(MAX_DOOM_DURATION_SECONDS, parsedDuration))
        const endAt = new Date(Date.now() + safeDuration * 1000)
        const safeTitle = (title || 'DOOM CLOCK').trim().slice(0, MAX_TITLE_LENGTH) || 'DOOM CLOCK'
        await pool.query(
          `UPDATE sessions
           SET doom_clock_title = $1, doom_clock_end_at = $2, tv_mode = 'doom'
           WHERE id = $3 AND created_by = $4`,
          [safeTitle, endAt, sessionId, socket.admin.id]
        )
        const payload = { title: safeTitle, endAt: endAt.toISOString() }
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'doom' })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'doom' })
        io.to(`tv:${sessionId}`).emit('doom-clock-started', payload)
        io.to(`admin:${sessionId}`).emit('doom-clock-started', payload)
      } catch (err) { console.error(err) }
    })

    // ── Admin: stop doom clock ───────────────────────────────────────────────
    socket.on('stop-doom-clock', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          `UPDATE sessions
           SET doom_clock_title = NULL, doom_clock_end_at = NULL, tv_mode = 'lobby'
           WHERE id = $1 AND created_by = $2`,
          [sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('doom-clock-stopped')
        io.to(`admin:${sessionId}`).emit('doom-clock-stopped')
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
      } catch (err) { console.error(err) }
    })

    // ── Admin: create tension scale ──────────────────────────────────────────
    socket.on('create-tension-scale', async ({ sessionId, title, steps, direction, vibrationEnabled }) => {
      if (!socket.admin) return
      try {
        const parsedSteps = parseInt(steps, 10)
        if (Number.isNaN(parsedSteps)) {
          socket.emit('tv-control-error', { message: "Nombre d'étapes invalide (entre 2 et 20)." })
          return
        }
        const safeSteps = Math.max(MIN_TENSION_STEPS, Math.min(MAX_TENSION_STEPS, parsedSteps))
        const safeTitle = (title || 'Échelle de tension').trim().slice(0, MAX_TITLE_LENGTH) || 'Échelle de tension'
        const safeDirection = TENSION_DIRECTIONS.has(direction) ? direction : 'ascending'
        const startLevel = safeDirection === 'descending' ? safeSteps : 0
        const result = await pool.query(
          `UPDATE sessions
           SET tension_title = $1, tension_steps = $2, tension_level = $3, tension_direction = $4, tension_vibration = $5, tv_mode = 'tension'
           WHERE id = $6 AND created_by = $7
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
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'tension' })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'tension' })
        io.to(`tv:${sessionId}`).emit('tension-scale-updated', payload)
        io.to(`admin:${sessionId}`).emit('tension-scale-updated', payload)
      } catch (err) { console.error(err) }
    })

    // ── Admin: advance tension scale (up/down) ──────────────────────────────
    socket.on('increment-tension-scale', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const result = await pool.query(
          `UPDATE sessions
           SET tension_level = CASE
             WHEN tension_direction = 'descending' THEN GREATEST(0, COALESCE(tension_level, 0) - 1)
             ELSE LEAST(COALESCE(tension_steps, 0), COALESCE(tension_level, 0) + 1)
           END
           WHERE id = $1 AND created_by = $2 AND tension_title IS NOT NULL AND tension_steps IS NOT NULL
           RETURNING tension_title, tension_steps, tension_level, tension_direction, tension_vibration`,
          [sessionId, socket.admin.id]
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
        io.to(`tv:${sessionId}`).emit('tension-scale-updated', payload)
        io.to(`admin:${sessionId}`).emit('tension-scale-updated', payload)
      } catch (err) { console.error(err) }
    })

    // ── Admin: end tension scale ─────────────────────────────────────────────
    socket.on('end-tension-scale', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          `UPDATE sessions
           SET tension_title = NULL, tension_steps = NULL, tension_level = 0, tension_direction = 'ascending', tension_vibration = FALSE, tv_mode = 'lobby'
           WHERE id = $1 AND created_by = $2`,
          [sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('tension-scale-ended')
        io.to(`admin:${sessionId}`).emit('tension-scale-ended')
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
      } catch (err) { console.error(err) }
    })

    // ── Admin: create vote ──────────────────────────────────────────────────
    socket.on('create-vote', async ({ sessionId, question, options, isAnonymous }) => {
      if (!socket.admin) return
      try {
        const voteRes = await pool.query(
          'INSERT INTO votes (session_id, question, options, is_anonymous) VALUES ($1, $2, $3, $4) RETURNING *',
          [sessionId, question, JSON.stringify(options), isAnonymous || false]
        )
        const vote = voteRes.rows[0]
        await pool.query('UPDATE sessions SET tv_mode = $1, current_vote_id = $2 WHERE id = $3', ['vote', vote.id, sessionId])
        const voteData = await getVoteState(sessionId, vote.id, true)
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'vote' })
        io.to(`tv:${sessionId}`).emit('vote-started', voteData)
        io.to(`session:${sessionId}`).emit('vote-started', voteData)
        io.to(`admin:${sessionId}`).emit('vote-started', voteData)
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'vote' })
      } catch (err) { console.error(err) }
    })

    // ── Player: submit vote ─────────────────────────────────────────────────
    socket.on('submit-vote', async ({ voteId, optionIndex }) => {
      if (!socket.playerId || !socket.sessionId) return
      try {
        const existing = await pool.query('SELECT id FROM vote_responses WHERE vote_id = $1 AND player_id = $2', [voteId, socket.playerId])
        if (existing.rows[0]) { socket.emit('vote-error', { message: 'Vous avez déjà voté.' }); return }
        const pname = await pool.query('SELECT player_name FROM players WHERE id = $1', [socket.playerId])
        const playerName = pname.rows[0]?.player_name || 'Inconnu'
        await pool.query('INSERT INTO vote_responses (vote_id, player_id, player_name, option_index) VALUES ($1, $2, $3, $4)', [voteId, socket.playerId, playerName, optionIndex])
        socket.emit('vote-submitted', { optionIndex })

        const voteUpdate = await getVoteState(socket.sessionId, voteId, true)
        if (!voteUpdate) return
        io.to(`tv:${socket.sessionId}`).emit('vote-updated', voteUpdate)
        io.to(`admin:${socket.sessionId}`).emit('vote-updated', voteUpdate)

        if (voteUpdate.totalVotes >= voteUpdate.totalPlayers) {
          const closed = await pool.query('UPDATE votes SET status = $1 WHERE id = $2 AND status = $3 RETURNING id', ['closed', voteId, 'active'])
          if (closed.rows[0]) {
            io.to(`tv:${socket.sessionId}`).emit('vote-closed', voteUpdate)
            io.to(`session:${socket.sessionId}`).emit('vote-closed', voteUpdate)
            io.to(`admin:${socket.sessionId}`).emit('vote-closed', voteUpdate)
          }
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: close vote ───────────────────────────────────────────────────
    socket.on('close-vote', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        const sessionRes = await pool.query('SELECT current_vote_id FROM sessions WHERE id = $1', [sessionId])
        const voteId = sessionRes.rows[0]?.current_vote_id
        if (!voteId) return
        const voteUpdate = await getVoteState(sessionId, voteId, false)
        if (!voteUpdate) return
        await pool.query('UPDATE votes SET status = $1 WHERE id = $2', ['closed', voteId])
        io.to(`tv:${sessionId}`).emit('vote-closed', voteUpdate)
        io.to(`session:${sessionId}`).emit('vote-closed', voteUpdate)
        io.to(`admin:${sessionId}`).emit('vote-closed', voteUpdate)
      } catch (err) { console.error(err) }
    })

    // ── Admin: show image on TV ─────────────────────────────────────────────
    socket.on('show-image', async ({ sessionId, imageUrl }) => {
      if (!socket.admin) return
      try {
        await pool.query('UPDATE sessions SET tv_mode = $1, current_image_url = $2 WHERE id = $3 AND created_by = $4', ['image', imageUrl, sessionId, socket.admin.id])
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'image', imageUrl })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'image', imageUrl })
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
               map_viewport = $2, map_fog_strokes = '[]', map_tokens = '{}'
           WHERE id = $3 AND created_by = $4`,
          [imageUrl, defaultViewport, sessionId, socket.admin.id]
        )
        const mapState = { mapUrl: imageUrl, fogEnabled: false, viewport: { xn: 0, yn: 0, scale: 1 }, fogStrokes: [], mapTokens: {} }
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'map' })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'map' })
        io.to(`tv:${sessionId}`).emit('map-state', mapState)
        io.to(`admin:${sessionId}`).emit('map-state', mapState)
      } catch (err) { console.error(err) }
    })

    // ── Admin: toggle map fog ───────────────────────────────────────────────
    socket.on('map-set-fog', async ({ sessionId, enabled }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'UPDATE sessions SET map_fog_enabled = $1 WHERE id = $2 AND created_by = $3',
          [!!enabled, sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('map-fog-updated', { enabled: !!enabled })
        io.to(`admin:${sessionId}`).emit('map-fog-updated', { enabled: !!enabled })
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
            'UPDATE sessions SET map_viewport = $1 WHERE id = $2 AND created_by = $3',
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
          'SELECT map_fog_strokes FROM sessions WHERE id = $1 AND created_by = $2',
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
          'UPDATE sessions SET map_fog_strokes = $1 WHERE id = $2 AND created_by = $3',
          [JSON.stringify(combined), sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('map-fog-patch', { strokes })
        io.to(`admin:${sessionId}`).emit('map-fog-patch', { strokes })
      } catch (err) { console.error(err) }
    })

    // ── Admin: reset fog (re-cover entire map) ──────────────────────────────
    socket.on('map-fog-reset', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          "UPDATE sessions SET map_fog_strokes = '[]' WHERE id = $1 AND created_by = $2",
          [sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('map-fog-reset')
        io.to(`admin:${sessionId}`).emit('map-fog-reset')
      } catch (err) { console.error(err) }
    })

    // ── Admin: move player token on map ─────────────────────────────────────
    socket.on('map-token-move', async ({ sessionId, playerId, nx, ny, name }) => {
      if (!socket.admin) return
      try {
        const sessionRes = await pool.query(
          'SELECT map_tokens FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return
        let tokens = {}
        try { tokens = JSON.parse(sessionRes.rows[0].map_tokens || '{}') } catch {}
        const existing = tokens[String(playerId)] || {}
        tokens[String(playerId)] = { ...existing, nx: Number(nx) || 0, ny: Number(ny) || 0, ...(name !== undefined ? { name } : {}) }
        await pool.query(
          'UPDATE sessions SET map_tokens = $1 WHERE id = $2 AND created_by = $3',
          [JSON.stringify(tokens), sessionId, socket.admin.id]
        )
        const saved = tokens[String(playerId)]
        io.to(`tv:${sessionId}`).emit('map-token-moved', { playerId, nx: saved.nx, ny: saved.ny, ...(saved.name ? { name: saved.name } : {}) })
        io.to(`admin:${sessionId}`).emit('map-token-moved', { playerId, nx: saved.nx, ny: saved.ny, ...(saved.name ? { name: saved.name } : {}) })
      } catch (err) { console.error(err) }
    })

    // ── Admin: remove player token from map ─────────────────────────────────
    socket.on('map-token-remove', async ({ sessionId, playerId }) => {
      if (!socket.admin) return
      try {
        const sessionRes = await pool.query(
          'SELECT map_tokens FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return
        let tokens = {}
        try { tokens = JSON.parse(sessionRes.rows[0].map_tokens || '{}') } catch {}
        delete tokens[String(playerId)]
        await pool.query(
          'UPDATE sessions SET map_tokens = $1 WHERE id = $2 AND created_by = $3',
          [JSON.stringify(tokens), sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('map-token-removed', { playerId })
        io.to(`admin:${sessionId}`).emit('map-token-removed', { playerId })
      } catch (err) { console.error(err) }
    })

    // ── Admin: send message ─────────────────────────────────────────────────
    socket.on('send-message', async ({ sessionId, toPlayerId, type, content, voiceStyle, textEffect, authorName }) => {
      if (!socket.admin) return
      try {
        if (!toPlayerId) {
          const cnt = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE session_id = $1', [sessionId])
          if ((cnt.rows[0]?.total || 0) === 0) { socket.emit('send-error', { message: 'Aucun joueur connecté.' }); return }
        }
        const fromName = (authorName && authorName.trim()) ? authorName.trim() : socket.admin.username
        const vStyle = voiceStyle || 'normal'
        const tEffect = textEffect || 'none'
        await pool.query('INSERT INTO messages (session_id, from_name, to_player_id, type, content, voice_style, text_effect) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [sessionId, fromName, toPlayerId || null, type, content, vStyle, tEffect])
        const msg = { fromName, type, content, voiceStyle: vStyle, textEffect: tEffect, sentAt: new Date() }
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

    // ── Admin: send gold split to players ───────────────────────────────────
    socket.on('send-gold-split', async ({ sessionId, shares }) => {
      if (!socket.admin) return
      try {
        if (!Array.isArray(shares) || shares.length === 0) return
        const sessionRes = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, socket.admin.id]
        )
        if (!sessionRes.rows[0]) return

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
        const mr = await pool.query(
          'INSERT INTO merchants (session_id, name, description) VALUES ($1, $2, $3) RETURNING *',
          [sessionId, name, description || '']
        )
        const merchant = mr.rows[0]
        for (const item of (items || [])) {
          await pool.query(
            'INSERT INTO merchant_items (merchant_id, name, description, price, stock, category) VALUES ($1, $2, $3, $4, $5, $6)',
            [merchant.id, item.name, item.description || '', item.price, item.stock ?? -1, item.category || 'Divers']
          )
        }
        const merchantData = await getMerchantData(merchant.id)
        socket.emit('merchant-created', merchantData)
      } catch (err) { console.error(err) }
    })

    // ── Admin: show merchant on TV ──────────────────────────────────────────
    socket.on('show-merchant', async ({ sessionId, merchantId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'UPDATE sessions SET tv_mode = $1, current_merchant_id = $2 WHERE id = $3 AND created_by = $4',
          ['merchant', merchantId, sessionId, socket.admin.id]
        )
        const merchantData = await getMerchantData(merchantId)
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'merchant', merchantData })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'merchant', merchantData })
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
           WHERE pr.id = $1`,
          [requestId]
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
          io.to(`tv:${req.session_id}`).emit('merchant-items-updated', merchantData)
          io.to(`session:${req.session_id}`).emit('merchant-items-updated', merchantData)
        } else if (action === 'discount' || action === 'increase') {
          const fp = Math.max(0, parseInt(finalPrice) || req.base_price)
          await pool.query('UPDATE purchase_requests SET status = $1, final_price = $2 WHERE id = $3', [action, fp, requestId])
          if (playerSocketId) io.to(playerSocketId).emit('purchase-counter-offer', { requestId, action, finalPrice: fp, itemName: req.item_name })
        } else if (action === 'reject') {
          await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['rejected', requestId])
          const items = [{ item_name: req.item_name, quantity: req.quantity, total_price: req.base_price }]
          if (playerSocketId) io.to(playerSocketId).emit('batch-rejected', { items })
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
           WHERE pr.batch_id = $1 AND pr.status = 'pending'`,
          [batchId]
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
          io.to(`tv:${reqs[0].session_id}`).emit('merchant-items-updated', merchantData)
          io.to(`session:${reqs[0].session_id}`).emit('merchant-items-updated', merchantData)
          socket.emit('purchase-responded', { batchId, action, totalPrice: finalTotal })
        } else if (action === 'reject') {
          for (const req of reqs) {
            await pool.query('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['rejected', req.id])
          }
          const items = reqs.map(r => ({ item_name: r.item_name, quantity: r.quantity, total_price: r.base_price }))
          if (playerSocketId) io.to(playerSocketId).emit('batch-rejected', { batchId, items })
          socket.emit('purchase-responded', { batchId, action })
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: close merchant ────────────────────────────────────────────────
    socket.on('close-merchant', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          "UPDATE sessions SET tv_mode = 'lobby', current_merchant_id = NULL WHERE id = $1 AND created_by = $2",
          [sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
        io.to(`admin:${sessionId}`).emit('tv-mode-changed', { mode: 'lobby' })
        io.to(`session:${sessionId}`).emit('merchant-closed')
      } catch (err) { console.error(err) }
    })

    // ── Admin: delete merchant ───────────────────────────────────────────────
    socket.on('delete-merchant', async ({ sessionId, merchantId }) => {
      if (!socket.admin) return
      try {
        // If this merchant is currently shown on TV, reset TV to lobby first
        const sessionRes = await pool.query(
          'SELECT current_merchant_id FROM sessions WHERE id = $1 AND created_by = $2',
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
          io.to(`tv:${socket.sessionId}`).emit('merchant-items-updated', merchantData)
          io.to(`session:${socket.sessionId}`).emit('merchant-items-updated', merchantData)
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
        await pool.query(
          'UPDATE sessions SET combat_round = $1 WHERE id = $2 AND created_by = $3',
          [safeRound, sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('round-updated', { round: safeRound })
        io.to(`admin:${sessionId}`).emit('round-updated', { round: safeRound })
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
          'UPDATE sessions SET timer_label = $1, timer_end_at = $2 WHERE id = $3 AND created_by = $4',
          [safeLabel, endAt, sessionId, socket.admin.id]
        )
        const payload = { label: safeLabel, endAt: endAt.toISOString() }
        io.to(`tv:${sessionId}`).emit('timer-updated', payload)
        io.to(`admin:${sessionId}`).emit('timer-updated', payload)
      } catch (err) { console.error(err) }
    })

    // ── Admin: stop free timer ───────────────────────────────────────────────
    socket.on('stop-timer', async ({ sessionId }) => {
      if (!socket.admin) return
      try {
        await pool.query(
          'UPDATE sessions SET timer_label = NULL, timer_end_at = NULL WHERE id = $1 AND created_by = $2',
          [sessionId, socket.admin.id]
        )
        io.to(`tv:${sessionId}`).emit('timer-stopped')
        io.to(`admin:${sessionId}`).emit('timer-stopped')
      } catch (err) { console.error(err) }
    })

    // ── Admin: Obsidian sync — bulk initiative update by player name ─────────
    socket.on('obsidian-sync-initiatives', async ({ sessionId, updates }) => {
      if (!socket.admin) return
      if (!Array.isArray(updates) || updates.length === 0) return
      try {
        const sessionCheck = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, socket.admin.id]
        )
        if (!sessionCheck.rows[0]) return

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
          io.to(`admin:${sessionId}`).emit('initiative-updated', event)
          io.to(`tv:${sessionId}`).emit('initiative-updated', event)
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: update HP by player name (for Obsidian sync) ─────────────────
    socket.on('admin-update-hp', async ({ sessionId, playerName, currentHp }) => {
      if (!socket.admin) return
      if (typeof playerName !== 'string' || playerName.trim() === '') return
      try {
        const sessionCheck = await pool.query(
          'SELECT id FROM sessions WHERE id = $1 AND created_by = $2',
          [sessionId, socket.admin.id]
        )
        if (!sessionCheck.rows[0]) return

        const parsed = parseInt(currentHp, 10)
        if (!Number.isFinite(parsed)) return

        const res = await pool.query(
          `UPDATE players SET current_hp = GREATEST(0, LEAST($1, max_hp))
           WHERE session_id = $2 AND LOWER(player_name) = LOWER($3)
           RETURNING id, current_hp, max_hp, player_name`,
          [parsed, sessionId, playerName.trim()]
        )
        const player = res.rows[0]
        if (!player) return

        const event = { playerId: player.id, newHp: player.current_hp }
        io.to(`admin:${sessionId}`).emit('hp-updated', event)
        io.to(`tv:${sessionId}`).emit('hp-updated', event)

        if (player.current_hp === 0) {
          await pool.query(
            'INSERT INTO session_events (session_id, event_type, description, player_name) VALUES ($1, $2, $3, $4)',
            [sessionId, 'death', `${player.player_name} est tombé à 0 PV`, player.player_name]
          )
          const deathEvent = { eventType: 'death', description: `${player.player_name} est tombé à 0 PV`, playerName: player.player_name, createdAt: new Date() }
          io.to(`admin:${sessionId}`).emit('session-event', deathEvent)
        }
      } catch (err) { console.error(err) }
    })

    // ── Admin: kick player ───────────────────────────────────────────────────
    socket.on('kick-player', async ({ playerId }) => {
      if (!socket.admin) return
      try {
        const pr = await pool.query(
          'SELECT socket_id, player_name, session_id FROM players WHERE id = $1',
          [playerId]
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
        io.to(`admin:${player.session_id}`).emit('player-left', { playerId })
        io.to(`tv:${player.session_id}`).emit('player-left', { playerId })
        await refreshVoteForSession(player.session_id)
        // Log event
        await pool.query(
          'INSERT INTO session_events (session_id, event_type, description, player_name) VALUES ($1, $2, $3, $4)',
          [player.session_id, 'leave', `${player.player_name} a été expulsé de la session`, player.player_name]
        )
        const leaveEvent = { eventType: 'leave', description: `${player.player_name} a été expulsé de la session`, playerName: player.player_name, createdAt: new Date() }
        io.to(`admin:${player.session_id}`).emit('session-event', leaveEvent)
      } catch (err) { console.error(err) }
    })
  })
}

module.exports = setupSocket
