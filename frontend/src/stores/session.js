import { reactive } from 'vue'

export const sessionStore = reactive({
  activeSession: null,
  sessions: [],
  players: [],
  messages: [],
  qrCodes: {},
  playerInfo: null,
  activeMerchant: null,
  activeVote: null,
  // Backfill du join-session (voir CLAUDE.md) : derniers messages MJ→ce joueur, distinct de
  // `messages` ci-dessus (état admin, non lié à ce mécanisme).
  recentMessages: [],
  // Conversations MJ↔joueurs de la session (source de vérité = table `messages`, hydratée par
  // GET /api/sessions/:id/messages puis tenue à jour par les events socket). Clé = id du joueur
  // (string), ou 'all' pour les diffusions. Vit ici plutôt que dans MessageTool.vue : ce composant
  // n'est instancié qu'à la première visite de l'onglet (KeepAlive ne pré-monte rien) —
  // AdminView.vue (toujours monté) écrit, MessageTool.vue lit. Voir CLAUDE.md.
  messageThreads: {},
  // Jets cachés reçus des joueurs : jamais persistés en base, donc live-only (perdus au reload).
  hiddenRolls: [],
  // Fil ouvert dans MessageTool (pour ne pas notifier un message du fil qu'on regarde) et fil
  // demandé depuis l'extérieur (clic sur la notification) — consommé par MessageTool.
  openThreadKey: null,
  requestedThreadKey: null,

  setActiveSession(session) {
    this.activeSession = session
    this.players = []
    this.messages = []
    this.activeMerchant = null
    this.activeVote = null
    this.recentMessages = []
    this.messageThreads = {}
    this.hiddenRolls = []
    this.openThreadKey = null
    this.requestedThreadKey = null
  },

  threadKeyOf(msg) {
    const pid = msg.fromPlayerId ?? msg.toPlayerId
    return pid != null ? String(pid) : 'all'
  },

  setMessageHistory(rows) {
    const threads = {}
    for (const m of rows) {
      const key = this.threadKeyOf(m)
      ;(threads[key] ||= []).push(m)
    }
    this.messageThreads = threads
  },

  // Ajoute un message à son fil, dédoublonné par id (l'historique REST et les events live
  // peuvent se chevaucher). Retourne true si le message était nouveau.
  addThreadMessage(msg) {
    const key = this.threadKeyOf(msg)
    const list = this.messageThreads[key] || (this.messageThreads[key] = [])
    if (msg.id != null && list.some(m => m.id === msg.id)) return false
    list.push(msg)
    return true
  },

  markThreadRead(playerId) {
    const list = this.messageThreads[String(playerId)]
    if (!list) return
    for (const m of list) if (m.unread) m.unread = false
  },

  threadUnread(key) {
    return (this.messageThreads[key] || []).filter(m => m.unread).length
  },

  get unreadPlayerInbox() {
    return Object.values(this.messageThreads).reduce((n, l) => n + l.filter(m => m.unread).length, 0)
  },

  addHiddenRoll(entry) {
    this.hiddenRolls.push(entry)
  },

  addPlayer(player) {
    const idx = this.players.findIndex(p => String(p.id) === String(player.id))
    if (idx === -1) this.players.push(player)
    else this.players[idx] = { ...this.players[idx], ...player }
  },

  setPlayers(players) {
    this.players = players
  },

  removePlayer(playerId) {
    this.players = this.players.filter(p => String(p.id) !== String(playerId))
  },

  updatePlayerHp(playerId, newHp, newMaxHp, tempHp) {
    const idx = this.players.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      const update = { current_hp: newHp }
      if (newMaxHp !== undefined) update.max_hp = newMaxHp
      if (tempHp !== undefined) update.temp_hp = tempHp
      this.players[idx] = { ...this.players[idx], ...update }
    }
  },

  updatePlayerTempHp(playerId, tempHp) {
    const idx = this.players.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) this.players[idx] = { ...this.players[idx], temp_hp: tempHp }
  },

  updatePlayerConditions(playerId, conditions) {
    const idx = this.players.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) this.players[idx] = { ...this.players[idx], conditions }
  },

  updatePlayerConcentration(playerId, isConcentrating) {
    const idx = this.players.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) this.players[idx] = { ...this.players[idx], is_concentrating: isConcentrating }
  },

  updatePlayerInitiative(playerId, initiative) {
    const idx = this.players.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) this.players[idx] = { ...this.players[idx], initiative }
  },

  updatePlayerAc(playerId, ac) {
    const idx = this.players.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) this.players[idx] = { ...this.players[idx], ac }
  },

  addMessage(msg) {
    this.messages.push(msg)
  },

  setSessions(sessions) {
    this.sessions = sessions
  },

  setQrCode(sessionId, qrCodeDataUrl) {
    this.qrCodes = { ...this.qrCodes, [sessionId]: qrCodeDataUrl }
  },

  getQrCode(sessionId) {
    return this.qrCodes[sessionId] || null
  }
})
