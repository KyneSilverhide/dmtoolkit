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
  // Boîte de réception joueur→MJ (messages + jets cachés) — vit ici plutôt que dans
  // MessageTool.vue : ce composant n'est instancié qu'à la première visite de l'onglet
  // Messages (KeepAlive ne pré-monte rien), donc un event reçu avant ce premier montage était
  // perdu pour de bon. AdminView.vue (toujours monté) écrit ici, MessageTool.vue ne fait que
  // lire — voir CLAUDE.md.
  playerInbox: [],
  unreadPlayerInbox: 0,

  setActiveSession(session) {
    this.activeSession = session
    this.players = []
    this.messages = []
    this.activeMerchant = null
    this.activeVote = null
    this.recentMessages = []
    this.playerInbox = []
    this.unreadPlayerInbox = 0
  },

  addPlayerInboxEntry(entry) {
    this.playerInbox.push(entry)
    this.unreadPlayerInbox++
  },

  markPlayerInboxRead() {
    this.unreadPlayerInbox = 0
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
