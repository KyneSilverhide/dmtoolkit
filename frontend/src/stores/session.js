import { reactive } from 'vue'

export const sessionStore = reactive({
  activeSession: null,
  sessions: [],
  players: [],
  messages: [],
  qrCodes: {},
  playerInfo: null,
  activeMerchant: null,

  setActiveSession(session) {
    this.activeSession = session
    this.players = []
    this.messages = []
    this.activeMerchant = null
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

  updatePlayerHp(playerId, newHp, newMaxHp) {
    const idx = this.players.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      const update = { current_hp: newHp }
      if (newMaxHp !== undefined) update.max_hp = newMaxHp
      this.players[idx] = { ...this.players[idx], ...update }
    }
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
