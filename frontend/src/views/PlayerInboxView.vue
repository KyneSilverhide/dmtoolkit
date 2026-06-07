<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSocket, resetSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'
import SpellSearchTool from '../components/player/SpellSearchTool.vue'
import MagicItemSearchTool from '../components/player/MagicItemSearchTool.vue'
import PlayerNotesTool from '../components/player/PlayerNotesTool.vue'
import PlayerDiceTool from '../components/player/PlayerDiceTool.vue'
import PlayerCombatTab from '../components/player/PlayerCombatTab.vue'
import PlayerMerchantTab from '../components/player/PlayerMerchantTab.vue'
import PlayerVoteTab from '../components/player/PlayerVoteTab.vue'
import PlayerMessagesTab from '../components/player/PlayerMessagesTab.vue'
import PlayerPuzzleOverlay from '../components/player/PlayerPuzzleOverlay.vue'
import { getLastKnownPlayer, saveLastKnownPlayer, removeLastKnownPlayer } from '../utils/playerSessionMemory.js'
import { applyTheme, getThemePreference, setThemePreference } from '../utils/themePreferences.js'
import AppIcon from '../components/AppIcon.vue'
import HelpTip from '../components/HelpTip.vue'
import DemoBanner from '../components/DemoBanner.vue'
import ReleaseNotesBell from '../components/ReleaseNotesBell.vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import {
  JOIN_SESSION, LEAVE_SESSION, SESSION_JOINED, ERROR,
  UPDATE_HP, UPDATE_MAX_HP, UPDATE_CONDITIONS, UPDATE_CONCENTRATION, UPDATE_INITIATIVE,
  HP_UPDATE_CONFIRMED, MAX_HP_UPDATE_CONFIRMED,
  CONCENTRATION_CONFIRMED, CONCENTRATION_WARNING,
  INITIATIVE_CONFIRMED,
  SUBMIT_VOTE, VOTE_STARTED, VOTE_CLOSED, VOTE_SUBMITTED,
  REQUEST_BATCH_PURCHASE, RESPOND_COUNTER_OFFER,
  NEW_MESSAGE, DICE_RESULT,
  MERCHANT_SHOWN, MERCHANT_CLOSED, MERCHANT_ITEMS_UPDATED,
  PURCHASE_REQUESTED, BATCH_ACCEPTED, BATCH_REJECTED,
  PURCHASE_COUNTER_OFFER, COUNTER_OFFER_RESULT, PURCHASE_ERROR,
  KICKED, DEMO_RESET,
  PUZZLE_STARTED, PUZZLE_CLOSED, PUZZLE_CELL_CLICKED, PUZZLE_CLICK,
} from '../socket-events.js'
import { BACKEND_URL } from '@/config.js'

const router = useRouter()
const route = useRoute()
const messages = ref([])
const unreadMessages = ref(0)
const playerMessageText = ref('')
const playerMessageSending = ref(false)
const playerMessageSent = ref(false)
const replyContext = ref(null)
const playerInfo = ref(sessionStore.playerInfo || { name: 'Aventurier', hp: 20, maxHp: 20, ac: 10 })
const sessionName = ref(sessionStore.activeSession?.name || 'Session')

const INITIATIVE_MIN = -10
const INITIATIVE_MAX = 99
const TEMP_HP_COLOR = 'var(--player-info-text)'
const MAX_HP_LIMIT = 9999

// ── Active tab ───────────────────────────────────────────────────────────
const activeTab = ref('combat')

// ── Puzzle state ─────────────────────────────────────────────────────────
const activePuzzle = ref(null)
const puzzleIframeRef = ref(null)
const pendingPuzzleClicks = ref([])
const tabAnimKey = ref(0)
let hasRequestedNotificationPermission = false
const rejoinError = ref('')
const rejoining = ref(false)
const theme = ref(getThemePreference('player', 'dark'))
const isLightTheme = computed(() => theme.value === 'light')
const notificationPermission = ref(readNotificationPermission())
const attentionToasts = ref([])
let attentionToastId = 0

// ── Header menu mobile ────────────────────────────────────────────────────
const showHeaderMenu = ref(false)

// ── Leave confirmation ────────────────────────────────────────────────────
const showLeaveConfirm = ref(false)

// ── Demo mode ─────────────────────────────────────────────────────────────
const isDemo = ref(false)

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  setThemePreference('player', theme.value)
  applyTheme(theme.value)
}

function readNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

function canUseSystemNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  return window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

const notificationButtonIcon = computed(() => {
  if (notificationPermission.value === 'denied' || notificationPermission.value === 'unsupported') return 'lucide:bell-off'
  return 'lucide:bell'
})

const notificationButtonText = computed(() => {
  if (notificationPermission.value === 'granted') return 'OK'
  if (notificationPermission.value === 'denied') return 'Bloquées'
  if (notificationPermission.value === 'unsupported') return 'Indispo'
  return 'Notifs'
})

const notificationButtonClass = computed(() => {
  if (notificationPermission.value === 'granted') return 'is-ready'
  if (notificationPermission.value === 'denied' || notificationPermission.value === 'unsupported') return 'is-blocked'
  return 'is-pending'
})

function pushAttentionToast(title, message, tone = 'info', duration = 3600) {
  const id = ++attentionToastId
  attentionToasts.value = [...attentionToasts.value, { id, title, message, tone }]
  window.setTimeout(() => dismissAttentionToast(id), duration)
}

function dismissAttentionToast(id) {
  attentionToasts.value = attentionToasts.value.filter(toast => toast.id !== id)
}

function currentSessionCode() {
  return sessionStore.activeSession?.code || String(route.params.code || '').trim()
}

function rememberCurrentPlayer(sessionCode = currentSessionCode()) {
  if (!sessionCode || !playerInfo.value?.name) return
  saveLastKnownPlayer(sessionCode, {
    name: playerInfo.value.name,
    ac: playerInfo.value.ac,
    hp: currentHp.value,
    maxHp: maxHp.value,
    dndClass: playerInfo.value.dndClass,
    avatarUrl: playerInfo.value.avatarUrl,
  })
}

function applyJoinedState(data) {
  sessionStore.setActiveSession(data.session)
  sessionStore.playerInfo = {
    id: data.player.id,
    name: data.player.player_name,
    ac: data.player.ac,
    hp: data.player.current_hp,
    maxHp: data.player.max_hp,
    initiative: data.player.initiative,
    dndClass: data.player.dnd_class,
    avatarUrl: data.player.avatar_url,
  }
  sessionStore.activeMerchant = data.activeMerchant || null
  if (data.activePuzzle) {
    pendingPuzzleClicks.value = Array.isArray(data.activePuzzle.puzzleClicks) ? data.activePuzzle.puzzleClicks.slice() : []
    activePuzzle.value = { puzzleImageId: data.activePuzzle.puzzleImageId, puzzleSeed: data.activePuzzle.puzzleSeed }
  } else {
    activePuzzle.value = null
    pendingPuzzleClicks.value = []
  }
  playerInfo.value = { ...sessionStore.playerInfo }
  sessionName.value = data.session.name
  currentHp.value = data.player.current_hp
  maxHp.value = data.player.max_hp
  pendingHp.value = data.player.current_hp
  initiativeValue.value = data.player.initiative
  isConcentrating.value = !!data.player.is_concentrating
  isDemo.value = !!data.isDemo
  try {
    const rawConds = data.player.conditions
    const parsed = typeof rawConds === 'string' ? JSON.parse(rawConds) : rawConds
    activeConditions.value = Array.isArray(parsed) ? parsed : []
  } catch {
    activeConditions.value = []
  }
  rememberCurrentPlayer(data.session.code)
}

async function rejoinFromKnownPlayer(sessionCode) {
  const knownPlayer = getLastKnownPlayer(sessionCode)
  if (!knownPlayer) {
    rejoinError.value = 'Aucun joueur mémorisé sur cet appareil pour cette session.'
    return false
  }

  rejoining.value = true
  rejoinError.value = ''
  const socket = getSocket()

  return await new Promise((resolve) => {
    const onJoined = (data) => {
      socket.off(ERROR, onError)
      rejoining.value = false
      applyJoinedState(data)
      resolve(true)
    }

    const onError = (err) => {
      socket.off(SESSION_JOINED, onJoined)
      rejoining.value = false
      rejoinError.value = err?.message || 'Impossible de reprendre la session automatiquement.'
      resolve(false)
    }

    socket.once(SESSION_JOINED, onJoined)
    socket.once(ERROR, onError)
    socket.emit(JOIN_SESSION, {
      code: sessionCode,
      playerName: knownPlayer.name,
      ac: knownPlayer.ac,
      hp: knownPlayer.hp,
      maxHp: knownPlayer.maxHp,
      dndClass: knownPlayer.dndClass || null,
      avatarUrl: knownPlayer.avatarUrl || null,
    })
  })
}

async function requestNotificationPermissionOnce({ interactive = false } = {}) {
  if (notificationPermission.value === 'granted') return notificationPermission.value

  if (notificationPermission.value === 'unsupported') {
    if (interactive) {
      pushAttentionToast('Notifications indisponibles', 'Ce navigateur ne prend pas en charge les notifications locales.', 'warning')
    }
    return notificationPermission.value
  }

  if (!canUseSystemNotifications()) {
    if (interactive) {
      pushAttentionToast('Notifications limitées', 'Les notifications système nécessitent un accès HTTPS ou localhost.', 'warning')
    }
    return notificationPermission.value
  }

  if (Notification.permission !== 'default') {
    notificationPermission.value = Notification.permission
    if (interactive && notificationPermission.value === 'denied') {
      pushAttentionToast('Notifications bloquées', 'Autorisez-les dans les réglages du navigateur si vous voulez des alertes en arrière-plan.', 'danger')
    }
    return notificationPermission.value
  }

  if (hasRequestedNotificationPermission) return notificationPermission.value

  hasRequestedNotificationPermission = true
  try {
    notificationPermission.value = await Notification.requestPermission()
  } catch {
    notificationPermission.value = 'denied'
  }

  if (interactive && notificationPermission.value === 'denied') {
    pushAttentionToast('Notifications refusées', "Vous continuerez de voir les alertes directement dans l'interface.", 'warning')
  }

  return notificationPermission.value
}

async function handleNotificationButton() {
  const permission = await requestNotificationPermissionOnce({ interactive: true })
  if (permission === 'granted') {
    pushAttentionToast('Notifications prêtes', 'Vous verrez désormais des alertes locales quand le MJ vous contacte.', 'success')
  }
}

function sendPlayerMessage() {
  const text = playerMessageText.value.trim()
  if (!text || playerMessageSending.value) return
  const socket = getSocket()
  playerMessageSending.value = true
  socket.emit('player-send-message', { content: text })
}

function setReplyContext(msg) {
  replyContext.value = { fromName: msg.fromName || 'MJ', content: msg.content }
}

function switchTab(tab) {
  activeTab.value = tab
  tabAnimKey.value++
  showHeaderMenu.value = false
  if (tab === 'messages') unreadMessages.value = 0
  requestNotificationPermissionOnce({ interactive: true }).catch(() => {})
}

// ── HP tracking ──────────────────────────────────────────────────────────
const currentHp = ref(playerInfo.value?.hp ?? 20)
const maxHp = ref(playerInfo.value?.maxHp ?? 20)
const pendingHp = ref(currentHp.value)
const hpSending = ref(false)
const hpSent = ref(false)
let hpDebounceTimer = null

// ── Max HP editing ────────────────────────────────────────────────────────
const editingMaxHp = ref(false)
const pendingMaxHp = ref(maxHp.value)
const maxHpSending = ref(false)
const maxHpSent = ref(false)

function openMaxHpEdit() {
  pendingMaxHp.value = maxHp.value
  editingMaxHp.value = true
}
function cancelMaxHpEdit() {
  editingMaxHp.value = false
}
function sendMaxHpUpdate() {
  const socket = getSocket()
  const val = Math.max(1, Math.min(9999, parseInt(pendingMaxHp.value) || 1))
  maxHpSending.value = true
  socket.emit(UPDATE_MAX_HP, { newMaxHp: val })
}
const handleMaxHpConfirmed = (data) => {
  maxHp.value = data.newMaxHp
  if (sessionStore.playerInfo) sessionStore.playerInfo.maxHp = data.newMaxHp
  if (pendingHp.value > data.newMaxHp) pendingHp.value = data.newMaxHp
  editingMaxHp.value = false
  maxHpSending.value = false
  maxHpSent.value = true
  setTimeout(() => { maxHpSent.value = false }, 2000)
  rememberCurrentPlayer()
}

// ── Initiative ─────────────────────────────────────────────────────────────
const initialInitiative = parseInt(playerInfo.value?.initiative, 10)
const initiativeValue = ref(
  Number.isFinite(initialInitiative)
    ? Math.max(INITIATIVE_MIN, Math.min(INITIATIVE_MAX, initialInitiative))
    : null
)
const initiativeSending = ref(false)
const initiativeSent = ref(false)

const pendingBaseHp = computed(() => Math.max(0, pendingHp.value))
const hpPercent = computed(() => {
  if (!maxHp.value) return 100
  const displayedBaseHp = Math.min(maxHp.value, pendingBaseHp.value)
  return Math.min(100, Math.max(0, (displayedBaseHp / maxHp.value) * 100))
})
const temporaryHp = computed(() => Math.max(0, pendingHp.value - maxHp.value))
const confirmedTemporaryHp = computed(() => Math.max(0, currentHp.value - maxHp.value))
const confirmedDisplayedHp = computed(() => Math.min(currentHp.value, maxHp.value))
const hpBarColor = computed(() => {
  if (temporaryHp.value > 0) return TEMP_HP_COLOR
  const pct = hpPercent.value
  if (pct > 50) return 'var(--player-success-text)'
  if (pct > 20) return 'var(--player-warning-text)'
  return 'var(--player-danger-text)'
})

// ── Concentration ────────────────────────────────────────────────────────
const isConcentrating = ref(false)
const concentrationModal = ref(null)

function toggleConcentration() {
  isConcentrating.value = !isConcentrating.value
  const socket = getSocket()
  socket.emit(UPDATE_CONCENTRATION, { isConcentrating: isConcentrating.value })
}

function dismissConcentrationModal() {
  concentrationModal.value = null
}

// ── Conditions D&D 5e ────────────────────────────────────────────────────
const activeConditions = ref([])

function toggleCondition(conditionId) {
  const idx = activeConditions.value.indexOf(conditionId)
  if (idx === -1) activeConditions.value.push(conditionId)
  else activeConditions.value.splice(idx, 1)
  const socket = getSocket()
  socket.emit(UPDATE_CONDITIONS, { conditions: activeConditions.value })
}

function adjustHp(delta) {
  pendingHp.value = Math.max(0, Math.min(MAX_HP_LIMIT, pendingHp.value + delta))
}

function setPendingHp(val) {
  pendingHp.value = Math.max(0, Math.min(MAX_HP_LIMIT, val || 0))
}

// Auto-send HP after 800ms of inactivity
watch(pendingHp, (newVal) => {
  if (newVal === currentHp.value) {
    if (hpDebounceTimer) { clearTimeout(hpDebounceTimer); hpDebounceTimer = null }
    return
  }
  if (hpSending.value) return
  if (hpDebounceTimer) clearTimeout(hpDebounceTimer)
  hpDebounceTimer = setTimeout(() => {
    hpDebounceTimer = null
    if (pendingHp.value !== currentHp.value && !hpSending.value) {
      sendHpUpdate()
    }
  }, 800)
})

function sendHpUpdate() {
  const socket = getSocket()
  hpSending.value = true
  if (hpDebounceTimer) { clearTimeout(hpDebounceTimer); hpDebounceTimer = null }
  socket.emit(UPDATE_HP, { newHp: pendingHp.value })
}

function sendInitiativeUpdate() {
  const socket = getSocket()
  initiativeSending.value = true
  const parsed = parseInt(initiativeValue.value, 10)
  const initiative = Number.isFinite(parsed)
    ? Math.max(INITIATIVE_MIN, Math.min(INITIATIVE_MAX, parsed))
    : null
  socket.emit(UPDATE_INITIATIVE, { initiative })
}

function leaveSession() {
  showLeaveConfirm.value = false
  const socket = getSocket()
  socket.emit(LEAVE_SESSION)
  resetSocket()
  sessionStore.setActiveSession(null)
  sessionStore.playerInfo = null
  router.push('/')
}

// ── Vote ─────────────────────────────────────────────────────────────────
const activeVote = ref(null)
const myVote = ref(null)
const hasNewVote = ref(false)

function submitVote(optionIndex) {
  const socket = getSocket()
  socket.emit(SUBMIT_VOTE, { voteId: activeVote.value.id, optionIndex })
}

// ── Merchant / Cart ──────────────────────────────────────────────────────
const activeMerchant = ref(sessionStore.activeMerchant || null)
const cart = ref({})
const cartSending = ref(false)
const purchaseResultModal = ref(null)
const counterOffers = ref([])
let attentionAudioContext = null

const cartItemCount = computed(() =>
  Object.values(cart.value).filter(q => q > 0).length
)
const cartTotal = computed(() => {
  if (!activeMerchant.value) return 0
  let total = 0
  for (const item of activeMerchant.value.items) {
    const qty = cart.value[item.id] || 0
    total += qty * item.price
  }
  return total
})

function setCartQty(itemId, qty) {
  cart.value = { ...cart.value, [itemId]: Math.max(0, qty) }
}

function submitCart() {
  const socket = getSocket()
  const items = []
  for (const item of activeMerchant.value.items) {
    const qty = cart.value[item.id] || 0
    if (qty > 0 && item.stock !== 0) {
      items.push({ itemId: item.id, quantity: qty })
    }
  }
  if (items.length === 0) return
  cartSending.value = true
  socket.emit(REQUEST_BATCH_PURCHASE, { items })
}

function clearCart() {
  cart.value = {}
}

function respondCounterOffer(requestId, accept) {
  const socket = getSocket()
  socket.emit(RESPOND_COUNTER_OFFER, { requestId, accept })
  counterOffers.value = counterOffers.value.filter(c => c.requestId !== requestId)
}

function dismissPurchaseModal() {
  purchaseResultModal.value = null
}

function shouldAlertUser() {
  if (typeof document === 'undefined') return false
  return document.visibilityState !== 'visible' || !document.hasFocus()
}

function playAttentionSound() {
  if (typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  if (!attentionAudioContext) attentionAudioContext = new AudioContextClass()
  if (attentionAudioContext.state === 'suspended') {
    attentionAudioContext.resume().catch(() => {})
  }
  const now = attentionAudioContext.currentTime
  const osc = attentionAudioContext.createOscillator()
  const gain = attentionAudioContext.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  osc.connect(gain)
  gain.connect(attentionAudioContext.destination)
  osc.start(now)
  osc.stop(now + 0.24)
}

function notifyAttention(message) {
  pushAttentionToast('Attention MJ', message, 'info')
  if (!shouldAlertUser()) return
  if (typeof window !== 'undefined' && 'Notification' in window && canUseSystemNotifications() && notificationPermission.value === 'granted') {
    try {
      new Notification('Attention MJ', {
        body: message,
        tag: 'dm-toolkit-attention',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
      })
      return
    } catch {}
  }
  playAttentionSound()
}

// ── Socket handlers ──────────────────────────────────────────────────────
const handleNewMessage = (msg) => {
  messages.value.push({ ...msg, kind: 'message' })
  if (activeTab.value !== 'messages') unreadMessages.value++
  notifyAttention(msg?.fromName ? `Nouveau message de ${msg.fromName}.` : 'Nouveau message du MJ.')
}
const handleDiceResult = (data) => {
  messages.value.push({ ...data, kind: 'dice' })
  if (activeTab.value !== 'messages') unreadMessages.value++
  notifyAttention(`Résultat Critical Fail (${data?.combatType || 'attaque'}).`)
}
const handlePlayerMessageSent = () => {
  playerMessageSending.value = false
  playerMessageSent.value = true
  playerMessageText.value = ''
  replyContext.value = null
  setTimeout(() => { playerMessageSent.value = false }, 2500)
}
const handleHpConfirmed = (data) => {
  currentHp.value = data.newHp
  pendingHp.value = data.newHp
  if (sessionStore.playerInfo) sessionStore.playerInfo.hp = data.newHp
  rememberCurrentPlayer()
  hpSending.value = false
  hpSent.value = true
  setTimeout(() => { hpSent.value = false }, 2000)
}
const handleConcentrationConfirmed = (data) => {
  isConcentrating.value = data.isConcentrating
}
const handleInitiativeConfirmed = (data) => {
  initiativeValue.value = data.initiative
  if (sessionStore.playerInfo) sessionStore.playerInfo.initiative = data.initiative
  rememberCurrentPlayer()
  initiativeSending.value = false
  initiativeSent.value = true
  setTimeout(() => { initiativeSent.value = false }, 2000)
}
const handleConcentrationWarning = (data) => {
  concentrationModal.value = data
  pushAttentionToast('Jet de concentration', `Subissez ${data.damage} dégâts — DD ${data.dc}.`, 'warning')
}
const handleVoteStarted = (voteData) => {
  activeVote.value = { ...voteData, isClosed: false }
  myVote.value = null
  hasNewVote.value = true
  notifyAttention(voteData?.question ? `Un vote attend votre réponse : ${voteData.question}` : 'Un vote attend votre réponse.')
}
const handleVoteClosed = (voteData) => {
  activeVote.value = { ...voteData, isClosed: true }
  setTimeout(() => {
    if (activeTab.value === 'vote') activeTab.value = 'combat'
    activeVote.value = null
    hasNewVote.value = false
  }, 5000)
}
const handleVoteSubmitted = (data) => {
  myVote.value = data.optionIndex
}

const handleMerchantShown = (data) => {
  activeMerchant.value = data
  cart.value = {}
  cartSending.value = false
  notifyAttention(data?.name ? `La boutique « ${data.name} » est ouverte.` : 'La boutique est ouverte.')
}
const handleMerchantClosed = () => {
  activeMerchant.value = null
  cart.value = {}
  cartSending.value = false
  if (activeTab.value === 'boutique') activeTab.value = 'combat'
}

const handlePuzzleStarted = (data) => {
  pendingPuzzleClicks.value = Array.isArray(data.puzzleClicks) ? data.puzzleClicks.slice() : []
  activePuzzle.value = { puzzleImageId: data.puzzleImageId, puzzleSeed: data.puzzleSeed }
  switchTab('puzzle')
  notifyAttention('Un puzzle est disponible !')
}

const handlePuzzleClosed = () => {
  activePuzzle.value = null
  if (activeTab.value === 'puzzle') activeTab.value = 'combat'
}

const handlePuzzleCellClicked = ({ path }) => {
  puzzleIframeRef.value?.contentWindow?.postMessage({ type: 'puzzle-remote-click', path }, '*')
}

function handlePuzzleIframeMessage(event) {
  if (!event.data || event.data.type !== 'puzzle-click') return
  if (!activePuzzle.value) return
  const socket = getSocket()
  socket.emit(PUZZLE_CLICK, { path: event.data.path })
}

function onPuzzleIframeReady(iframe) {
  puzzleIframeRef.value = iframe
}

function computedPuzzleServeUrl() {
  if (!activePuzzle.value?.puzzleImageId || !activePuzzle.value?.puzzleSeed) return ''
  return `${BACKEND_URL}/api/puzzles/serve/${activePuzzle.value.puzzleImageId}?seed=${activePuzzle.value.puzzleSeed}`
}

const handleMerchantItemsUpdated = (data) => {
  activeMerchant.value = data
}

const handlePurchaseRequested = () => {
  // cart stays until confirmed
}
const handleBatchAccepted = ({ items, totalPrice }) => {
  cartSending.value = false
  cart.value = {}
  purchaseResultModal.value = { type: 'accepted', items, totalPrice }
  pushAttentionToast('Achat accepté', 'Le MJ a validé votre demande.', 'success')
}
const handleBatchRejected = ({ items }) => {
  cartSending.value = false
  cart.value = {}
  purchaseResultModal.value = { type: 'rejected', items }
  pushAttentionToast('Achat refusé', 'Le MJ a refusé votre demande.', 'danger')
}
const handlePurchaseCounterOffer = (data) => {
  cartSending.value = false
  counterOffers.value.push(data)
  notifyAttention(data?.itemName ? `Nouvelle contre-offre pour ${data.itemName}.` : 'Nouvelle contre-offre du MJ.')
}
const handleCounterOfferResult = ({ accepted, itemName, finalPrice }) => {
  if (accepted) {
    purchaseResultModal.value = { type: 'accepted', items: [{ item_name: itemName, quantity: 1, total_price: finalPrice }], totalPrice: finalPrice }
  } else {
    purchaseResultModal.value = { type: 'rejected', items: [{ item_name: itemName, quantity: 1, total_price: 0 }] }
  }
}
const handlePurchaseError = ({ message }) => {
  cartSending.value = false
  purchaseResultModal.value = { type: 'error', message }
  pushAttentionToast('Erreur boutique', message || 'Impossible de traiter la demande.', 'danger')
}

function handleKicked() {
  removeLastKnownPlayer(currentSessionCode())
  resetSocket()
  sessionStore.setActiveSession(null)
  sessionStore.playerInfo = null
  router.push('/?kicked=1')
}

function handleBeforeUnload() {
  isRefreshing = true
}

// ── Socket reconnection ──────────────────────────────────────────────────
let hasJoinedSession = false
let isRefreshing = false

async function handleSocketReconnect() {
  if (!hasJoinedSession) return
  if (!sessionStore.activeSession || !playerInfo.value) return
  const socket = getSocket()

  const onJoined = (data) => {
    clearTimeout(reconnectTimeout)
    socket.off(ERROR, onError)
    applyJoinedState(data)
  }
  const onError = () => {
    clearTimeout(reconnectTimeout)
    socket.off(SESSION_JOINED, onJoined)
  }

  socket.once(SESSION_JOINED, onJoined)
  socket.once(ERROR, onError)

  const reconnectTimeout = setTimeout(() => {
    socket.off(SESSION_JOINED, onJoined)
    socket.off(ERROR, onError)
  }, 10000)

  try {
    socket.emit(JOIN_SESSION, {
      code: sessionStore.activeSession.code,
      playerName: playerInfo.value.name,
      ac: playerInfo.value.ac,
      hp: currentHp.value,
      maxHp: maxHp.value,
      dndClass: playerInfo.value.dndClass || null,
      avatarUrl: playerInfo.value.avatarUrl || null,
    })
  } catch (err) {
    clearTimeout(reconnectTimeout)
    socket.off(SESSION_JOINED, onJoined)
    socket.off(ERROR, onError)
    console.error('Reconnect emit failed:', err)
  }
}

onMounted(async () => {
  releaseNotesStore.load()
  const routeCode = String(route.params.code || '').trim()

  if (!sessionStore.activeSession) {
    if (!routeCode) {
      router.push('/join')
      return
    }
    const joined = await rejoinFromKnownPlayer(routeCode)
    if (!joined) return
  }

  const activeCode = sessionStore.activeSession?.code
  if (activeCode && routeCode !== activeCode) {
    router.replace(`/view/${activeCode}`)
  }

  hasJoinedSession = true
  notificationPermission.value = readNotificationPermission()
  const socket = getSocket()
  socket.on('connect', handleSocketReconnect)
  socket.on(NEW_MESSAGE, handleNewMessage)
  socket.on(DICE_RESULT, handleDiceResult)
  socket.on('player-message-sent', handlePlayerMessageSent)
  socket.on(HP_UPDATE_CONFIRMED, handleHpConfirmed)
  socket.on(MAX_HP_UPDATE_CONFIRMED, handleMaxHpConfirmed)
  socket.on(CONCENTRATION_CONFIRMED, handleConcentrationConfirmed)
  socket.on(INITIATIVE_CONFIRMED, handleInitiativeConfirmed)
  socket.on(CONCENTRATION_WARNING, handleConcentrationWarning)
  socket.on(VOTE_STARTED, handleVoteStarted)
  socket.on(VOTE_CLOSED, handleVoteClosed)
  socket.on(VOTE_SUBMITTED, handleVoteSubmitted)
  socket.on(MERCHANT_SHOWN, handleMerchantShown)
  socket.on(MERCHANT_CLOSED, handleMerchantClosed)
  socket.on(MERCHANT_ITEMS_UPDATED, handleMerchantItemsUpdated)
  socket.on(PURCHASE_REQUESTED, handlePurchaseRequested)
  socket.on(BATCH_ACCEPTED, handleBatchAccepted)
  socket.on(BATCH_REJECTED, handleBatchRejected)
  socket.on(PURCHASE_COUNTER_OFFER, handlePurchaseCounterOffer)
  socket.on(COUNTER_OFFER_RESULT, handleCounterOfferResult)
  socket.on(PURCHASE_ERROR, handlePurchaseError)
  socket.on(KICKED, handleKicked)
  socket.on(DEMO_RESET, () => { window.location.reload() })
  socket.on(PUZZLE_STARTED, handlePuzzleStarted)
  socket.on(PUZZLE_CLOSED, handlePuzzleClosed)
  socket.on(PUZZLE_CELL_CLICKED, handlePuzzleCellClicked)
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('message', handlePuzzleIframeMessage)
})

onUnmounted(() => {
  hasJoinedSession = false
  const socket = getSocket()
  if (socket) {
    if (!isRefreshing && sessionStore.activeSession) socket.emit(LEAVE_SESSION)
    socket.off('connect', handleSocketReconnect)
    socket.off(NEW_MESSAGE, handleNewMessage)
    socket.off(DICE_RESULT, handleDiceResult)
    socket.off('player-message-sent', handlePlayerMessageSent)
    socket.off(HP_UPDATE_CONFIRMED, handleHpConfirmed)
    socket.off(MAX_HP_UPDATE_CONFIRMED, handleMaxHpConfirmed)
    socket.off(CONCENTRATION_CONFIRMED, handleConcentrationConfirmed)
    socket.off(INITIATIVE_CONFIRMED, handleInitiativeConfirmed)
    socket.off(CONCENTRATION_WARNING, handleConcentrationWarning)
    socket.off(VOTE_STARTED, handleVoteStarted)
    socket.off(VOTE_CLOSED, handleVoteClosed)
    socket.off(VOTE_SUBMITTED, handleVoteSubmitted)
    socket.off(MERCHANT_SHOWN, handleMerchantShown)
    socket.off(MERCHANT_CLOSED, handleMerchantClosed)
    socket.off(MERCHANT_ITEMS_UPDATED, handleMerchantItemsUpdated)
    socket.off(PURCHASE_REQUESTED, handlePurchaseRequested)
    socket.off(BATCH_ACCEPTED, handleBatchAccepted)
    socket.off(BATCH_REJECTED, handleBatchRejected)
    socket.off(PURCHASE_COUNTER_OFFER, handlePurchaseCounterOffer)
    socket.off(COUNTER_OFFER_RESULT, handleCounterOfferResult)
    socket.off(PURCHASE_ERROR, handlePurchaseError)
    socket.off(KICKED, handleKicked)
    socket.off(DEMO_RESET)
    socket.off(PUZZLE_STARTED, handlePuzzleStarted)
    socket.off(PUZZLE_CLOSED, handlePuzzleClosed)
    socket.off(PUZZLE_CELL_CLICKED, handlePuzzleCellClicked)
  }
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('message', handlePuzzleIframeMessage)
  if (hpDebounceTimer) { clearTimeout(hpDebounceTimer); hpDebounceTimer = null }
  if (attentionAudioContext) {
    attentionAudioContext.close().catch(() => {})
    attentionAudioContext = null
  }
})
</script>

<template>
  <div class="inbox-wrapper">

    <!-- ── Concentration modal ───────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="concentrationModal" class="modal-overlay" @click.self="dismissConcentrationModal">
        <div class="modal-box concentration-modal">
          <div class="modal-icon"><AppIcon icon="game-icons:bullseye" size="3rem" color="var(--color-info-bright)" /></div>
          <h2 class="modal-title">Jet de Concentration !</h2>
          <p class="modal-body">
            Vous avez subi <strong>{{ concentrationModal.damage }} dégâts</strong>.
          </p>
          <p class="modal-body">
            Effectuez un jet de <strong>Constitution</strong> de difficulté
            <span class="dc-badge">DD {{ concentrationModal.dc }}</span>
          </p>
          <p class="modal-hint">Si vous échouez, votre concentration est brisée.</p>
          <button class="modal-close-btn" @click="dismissConcentrationModal">J'ai compris</button>
        </div>
      </div>
    </Teleport>

    <!-- ── Purchase result modal ─────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="purchaseResultModal" class="modal-overlay" @click.self="dismissPurchaseModal">
        <div class="modal-box purchase-modal" :class="purchaseResultModal.type">
          <div class="modal-icon">
            <AppIcon
              :icon="purchaseResultModal.type === 'accepted' ? 'lucide:check-circle' : purchaseResultModal.type === 'rejected' ? 'lucide:x-circle' : 'lucide:alert-triangle'"
              size="3rem"
              :color="purchaseResultModal.type === 'accepted' ? 'var(--color-success)' : purchaseResultModal.type === 'rejected' ? 'var(--color-danger)' : 'var(--color-warning)'"
            />
          </div>
          <h2 class="modal-title">
            {{ purchaseResultModal.type === 'accepted' ? 'Achat accepté !' : purchaseResultModal.type === 'rejected' ? 'Achat refusé' : 'Erreur' }}
          </h2>
          <div v-if="purchaseResultModal.items" class="purchase-modal-items">
            <div v-for="(item, i) in purchaseResultModal.items" :key="i" class="purchase-modal-item">
              <span class="pmi-name">{{ item.item_name }}</span>
              <span class="pmi-qty">× {{ item.quantity }}</span>
              <span v-if="purchaseResultModal.type === 'accepted'" class="pmi-price">{{ item.total_price }} po</span>
            </div>
          </div>
          <p v-if="purchaseResultModal.type === 'accepted' && purchaseResultModal.totalPrice" class="purchase-modal-total">
            Total : <strong>{{ purchaseResultModal.totalPrice }} po</strong>
          </p>
          <p v-if="purchaseResultModal.message" class="modal-body">{{ purchaseResultModal.message }}</p>
          <button class="modal-close-btn" @click="dismissPurchaseModal">Fermer</button>
        </div>
      </div>
    </Teleport>

    <DemoBanner v-if="isDemo" />

    <!-- ── Leave confirmation modal ─────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showLeaveConfirm" class="modal-overlay" @click.self="showLeaveConfirm = false">
        <div class="modal-box leave-confirm-modal">
          <div class="modal-icon"><AppIcon icon="lucide:log-out" size="3rem" color="var(--player-danger-text, var(--color-danger))" /></div>
          <h2 class="modal-title">Quitter la session ?</h2>
          <p class="modal-body">Votre personnage sera retiré de la session. Vous pouvez rejoindre à nouveau avec le même code.</p>
          <div class="leave-confirm-actions">
            <button class="modal-close-btn leave-confirm-cancel" @click="showLeaveConfirm = false">Rester</button>
            <button class="modal-close-btn leave-confirm-leave" @click="leaveSession" data-testid="confirm-leave-button">Quitter</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Fixed header ─────────────────────────────────────────────────── -->
    <header class="inbox-header">
      <div class="header-left">
        <div class="player-avatar-wrap">
          <img
            v-if="playerInfo?.avatarUrl"
            :src="playerInfo.avatarUrl.startsWith('/uploads/') ? BACKEND_URL + playerInfo.avatarUrl : playerInfo.avatarUrl"
            :alt="playerInfo?.name"
            class="player-avatar"
          />
          <span v-else class="player-icon"><AppIcon icon="game-icons:crossed-swords" size="1.2rem" color="var(--color-gold-bright)" /></span>
        </div>
        <div class="header-info">
          <p class="player-name">{{ playerInfo?.name || 'Aventurier' }}</p>
          <p class="session-name">{{ sessionName }}</p>
        </div>
      </div>
      <div class="header-right">
        <span class="ac-chip"><AppIcon icon="game-icons:shield" size="0.85rem" /> {{ playerInfo?.ac ?? 10 }}</span>
        <span v-if="unreadMessages > 0" class="msg-chip" @click="switchTab('messages')">
          <AppIcon icon="lucide:inbox" size="0.85rem" />{{ unreadMessages }}
        </span>
        <ReleaseNotesBell role="player" />
        <!-- Menu secondaire -->
        <div class="header-menu-wrap">
          <button
            class="header-menu-btn"
            :class="{ active: showHeaderMenu }"
            @click.stop="showHeaderMenu = !showHeaderMenu"
            aria-label="Menu"
            data-testid="header-menu-btn"
          >
            <AppIcon icon="lucide:more-vertical" size="1rem" />
          </button>
          <Teleport to="body">
            <div v-if="showHeaderMenu" class="header-menu-backdrop" @click="showHeaderMenu = false" />
            <Transition name="menu-drop">
              <div v-if="showHeaderMenu" class="header-menu-dropdown" @click.stop>
                <button class="menu-item" :class="notificationButtonClass" @click="handleNotificationButton; showHeaderMenu = false">
                  <AppIcon :icon="notificationButtonIcon" size="0.95em" />
                  <span>Notifications — {{ notificationButtonText }}</span>
                </button>
                <button class="menu-item" @click="toggleTheme(); showHeaderMenu = false" data-testid="player-theme-toggle">
                  <AppIcon :icon="isLightTheme ? 'lucide:moon' : 'lucide:sun'" size="0.95em" />
                  <span>{{ isLightTheme ? 'Thème sombre' : 'Thème clair' }}</span>
                </button>
                <div class="menu-divider" />
                <button class="menu-item menu-item-danger" @click="showLeaveConfirm = true; showHeaderMenu = false" data-testid="leave-button">
                  <AppIcon icon="lucide:log-out" size="0.95em" />
                  <span>Quitter la session</span>
                </button>
              </div>
            </Transition>
          </Teleport>
        </div>
      </div>
    </header>

    <section v-if="rejoining" class="resume-state">
      <p class="resume-title">Reconnexion à la session…</p>
      <p class="resume-sub">Chargement du dernier joueur connu sur cet appareil.</p>
    </section>

    <section v-else-if="rejoinError" class="resume-state error">
      <p class="resume-title">Session non récupérable automatiquement</p>
      <p class="resume-sub">{{ rejoinError }}</p>
      <button class="resume-action-btn" @click="router.push(`/join/${route.params.code || ''}`)">Rejoindre manuellement</button>
    </section>

    <!-- ── Main layout : sidebar (desktop) + contenu ───────────────────── -->
    <div v-else class="inbox-lower">

      <!-- Sidebar navigation (desktop uniquement) -->
      <nav class="sidebar-nav" aria-label="Navigation principale">
        <button class="sidebar-item" :class="{ active: activeTab === 'combat' }" @click="switchTab('combat')" aria-label="Combat" data-testid="player-tab-combat">
          <span class="sidebar-icon"><AppIcon icon="game-icons:crossed-swords" size="1.2rem" /></span>
          <span class="sidebar-label">Combat</span>
        </button>
        <button class="sidebar-item" :class="{ active: activeTab === 'dés' }" @click="switchTab('dés')" aria-label="Dés" data-testid="player-tab-des">
          <span class="sidebar-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="1.2rem" /></span>
          <span class="sidebar-label">Dés</span>
        </button>
        <button class="sidebar-item" :class="{ active: activeTab === 'notes' }" @click="switchTab('notes')" aria-label="Notes" data-testid="player-tab-notes">
          <span class="sidebar-icon"><AppIcon icon="lucide:notebook-pen" size="1.2rem" /></span>
          <span class="sidebar-label">Notes</span>
        </button>
        <button class="sidebar-item" :class="{ active: activeTab === 'sorts' }" @click="switchTab('sorts')" aria-label="Sorts" data-testid="player-tab-sorts">
          <span class="sidebar-icon"><AppIcon icon="lucide:sparkles" size="1.2rem" /></span>
          <span class="sidebar-label">Sorts</span>
        </button>
        <button class="sidebar-item" :class="{ active: activeTab === 'objets' }" @click="switchTab('objets')" aria-label="Objets" data-testid="player-tab-objets">
          <span class="sidebar-icon"><AppIcon icon="lucide:gem" size="1.2rem" /></span>
          <span class="sidebar-label">Objets</span>
        </button>
        <button
          v-if="activeMerchant"
          class="sidebar-item"
          :class="{ active: activeTab === 'boutique' }"
          @click="switchTab('boutique')"
          aria-label="Boutique"
          data-testid="player-tab-boutique"
        >
          <span class="sidebar-icon" :class="{ 'tab-icon-notify': cartItemCount === 0 && activeTab !== 'boutique' }">
            <AppIcon icon="game-icons:shop" size="1.2rem" />
          </span>
          <span class="sidebar-label">Boutique</span>
          <span v-if="cartItemCount > 0" class="tab-badge tab-badge-urgent">{{ cartItemCount }}</span>
          <span v-else-if="activeTab !== 'boutique'" class="tab-badge tab-badge-pulse">!</span>
        </button>
        <button
          v-if="activeVote"
          class="sidebar-item"
          :class="{ active: activeTab === 'vote' }"
          @click="switchTab('vote'); hasNewVote = false"
          aria-label="Vote"
          data-testid="player-tab-vote"
        >
          <span class="sidebar-icon" :class="{ 'tab-icon-notify': hasNewVote && activeTab !== 'vote' }">
            <AppIcon icon="lucide:check-square" size="1.2rem" />
          </span>
          <span class="sidebar-label">Vote</span>
          <span v-if="hasNewVote && activeTab !== 'vote'" class="tab-badge tab-badge-pulse">!</span>
        </button>
        <button
          v-if="activePuzzle"
          class="sidebar-item"
          :class="{ active: activeTab === 'puzzle' }"
          @click="switchTab('puzzle')"
          aria-label="Puzzle"
          data-testid="player-tab-puzzle"
        >
          <span class="sidebar-icon" :class="{ 'tab-icon-notify': activeTab !== 'puzzle' }">
            <AppIcon icon="lucide:puzzle" size="1.2rem" />
          </span>
          <span class="sidebar-label">Puzzle</span>
          <span v-if="activeTab !== 'puzzle'" class="tab-badge tab-badge-pulse">!</span>
        </button>
        <button class="sidebar-item" :class="{ active: activeTab === 'messages' }" @click="switchTab('messages')" aria-label="Messages" data-testid="player-tab-messages">
          <span class="sidebar-icon" :class="{ 'tab-icon-notify': unreadMessages > 0 }">
            <AppIcon icon="lucide:inbox" size="1.2rem" />
          </span>
          <span class="sidebar-label">Messages</span>
          <span v-if="unreadMessages > 0" class="tab-badge tab-badge-urgent">{{ unreadMessages }}</span>
        </button>
      </nav>

      <!-- Zone de contenu principale -->
      <div class="inbox-main">
        <!-- Puzzle overlay -->
        <div v-show="activeTab === 'puzzle' && activePuzzle" class="puzzle-overlay">
          <PlayerPuzzleOverlay
            :puzzle-serve-url="computedPuzzleServeUrl()"
            :pending-clicks="pendingPuzzleClicks"
            @iframe-ready="onPuzzleIframeReady"
          />
        </div>

        <main v-show="!(activeTab === 'puzzle' && activePuzzle)" class="inbox-content">
          <div :key="tabAnimKey" class="tab-anim-wrapper">

            <!-- ── COMBAT tab ─────────────────────────────────────────────── -->
            <div v-show="activeTab === 'combat'" class="tab-panel">
              <PlayerCombatTab
                :current-hp="currentHp"
                :max-hp="maxHp"
                :pending-hp="pendingHp"
                :hp-sending="hpSending"
                :hp-sent="hpSent"
                :editing-max-hp="editingMaxHp"
                :pending-max-hp="pendingMaxHp"
                :max-hp-sending="maxHpSending"
                :max-hp-sent="maxHpSent"
                :initiative-value="initiativeValue"
                :initiative-sending="initiativeSending"
                :initiative-sent="initiativeSent"
                :is-concentrating="isConcentrating"
                :active-conditions="activeConditions"
                :counter-offers="counterOffers"
                :confirmed-displayed-hp="confirmedDisplayedHp"
                :confirmed-temporary-hp="confirmedTemporaryHp"
                :temporary-hp="temporaryHp"
                :hp-percent="hpPercent"
                :hp-bar-color="hpBarColor"
                @adjust-hp="adjustHp"
                @set-pending-hp="setPendingHp"
                @send-hp="sendHpUpdate"
                @open-max-hp-edit="openMaxHpEdit"
                @cancel-max-hp-edit="cancelMaxHpEdit"
                @update:pending-max-hp="pendingMaxHp = $event"
                @send-max-hp="sendMaxHpUpdate"
                @update:initiative-value="initiativeValue = $event"
                @send-initiative="sendInitiativeUpdate"
                @toggle-concentration="toggleConcentration"
                @toggle-condition="toggleCondition"
                @respond-counter-offer="respondCounterOffer"
              />
            </div>

            <!-- ── DÉS tab ────────────────────────────────────────────────── -->
            <div v-show="activeTab === 'dés'" class="tab-panel">
              <div class="panel">
                <p class="panel-label"><AppIcon icon="game-icons:dice-six-faces-five" size="0.85rem" /> Lancer de Dés</p>
                <PlayerDiceTool />
              </div>
            </div>

            <!-- ── NOTES tab ──────────────────────────────────────────────── -->
            <div v-show="activeTab === 'notes'" class="tab-panel">
              <div class="panel">
                <p class="panel-label"><AppIcon icon="lucide:notebook-pen" size="0.85rem" /> Notes &amp; Dessin</p>
                <PlayerNotesTool />
              </div>
            </div>

            <!-- ── SORTS tab ──────────────────────────────────────────────── -->
            <div v-show="activeTab === 'sorts'" class="tab-panel">
              <div class="panel">
                <p class="panel-label"><AppIcon icon="lucide:search" size="0.85rem" /> Recherche de sorts</p>
                <SpellSearchTool />
              </div>
            </div>

            <!-- ── OBJETS tab ─────────────────────────────────────────────── -->
            <div v-show="activeTab === 'objets'" class="tab-panel">
              <div class="panel">
                <p class="panel-label"><AppIcon icon="lucide:gem" size="0.85rem" color="var(--color-info-bright)" /> Objets & Objets magiques</p>
                <MagicItemSearchTool />
              </div>
            </div>

            <!-- ── BOUTIQUE tab ───────────────────────────────────────────── -->
            <div v-show="activeTab === 'boutique'" class="tab-panel">
              <PlayerMerchantTab
                :active-merchant="activeMerchant"
                :cart="cart"
                :cart-item-count="cartItemCount"
                :cart-total="cartTotal"
                :cart-sending="cartSending"
                @set-cart-qty="setCartQty"
                @submit-cart="submitCart"
                @clear-cart="clearCart"
              />
            </div>

            <!-- ── VOTE tab ───────────────────────────────────────────────── -->
            <div v-show="activeTab === 'vote'" class="tab-panel">
              <PlayerVoteTab
                :active-vote="activeVote"
                :my-vote="myVote"
                @submit-vote="submitVote"
              />
            </div>

            <!-- ── PUZZLE tab (fallback quand pas de puzzle actif) ────────── -->
            <div v-show="activeTab === 'puzzle'" class="tab-panel">
              <div class="panel empty-panel">
                <p class="empty-icon"><AppIcon icon="lucide:puzzle" size="2.5rem" color="var(--color-text-dim)" /></p>
                <p class="empty-text">Aucun puzzle en cours.</p>
              </div>
            </div>

            <!-- ── MESSAGES tab ───────────────────────────────────────────── -->
            <div v-show="activeTab === 'messages'" class="tab-panel">
              <PlayerMessagesTab
                :messages="messages"
                :player-message-text="playerMessageText"
                :player-message-sending="playerMessageSending"
                :player-message-sent="playerMessageSent"
                :reply-context="replyContext"
                @update:player-message-text="playerMessageText = $event"
                @send-message="sendPlayerMessage"
                @set-reply-context="setReplyContext"
                @clear-reply="replyContext = null"
              />
            </div>

          </div><!-- end tab-anim-wrapper -->
        </main>
      </div><!-- end inbox-main -->
    </div><!-- end inbox-lower -->

    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <button
        v-for="toast in attentionToasts"
        :key="toast.id"
        class="attention-toast"
        :class="`tone-${toast.tone}`"
        @click="dismissAttentionToast(toast.id)"
      >
        <span class="toast-title">{{ toast.title }}</span>
        <span class="toast-message">{{ toast.message }}</span>
      </button>
    </TransitionGroup>

    <!-- ── Bottom tab bar ────────────────────────────────────────────────── -->
    <nav v-if="!rejoining && !rejoinError" class="tab-bar" role="tablist">
      <button
        class="tab-item"
        :class="{ active: activeTab === 'combat' }"
        @click="switchTab('combat')"
        aria-label="Combat"
        data-testid="player-tab-combat"
      >
        <span class="tab-icon"><AppIcon icon="game-icons:crossed-swords" size="1.4rem" /></span>
        <span class="tab-label">Combat</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'dés' }"
        @click="switchTab('dés')"
        aria-label="Dés"
        data-testid="player-tab-des"
      >
        <span class="tab-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="1.4rem" /></span>
        <span class="tab-label">Dés</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'notes' }"
        @click="switchTab('notes')"
        aria-label="Notes"
        data-testid="player-tab-notes"
      >
        <span class="tab-icon"><AppIcon icon="lucide:notebook-pen" size="1.4rem" /></span>
        <span class="tab-label">Notes</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'sorts' }"
        @click="switchTab('sorts')"
        aria-label="Sorts"
        data-testid="player-tab-sorts"
      >
        <span class="tab-icon"><AppIcon icon="lucide:sparkles" size="1.4rem" /></span>
        <span class="tab-label">Sorts</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'objets' }"
        @click="switchTab('objets')"
        aria-label="Objets"
        data-testid="player-tab-objets"
      >
        <span class="tab-icon"><AppIcon icon="lucide:gem" size="1.4rem" /></span>
        <span class="tab-label">Objets</span>
      </button>
      <button
        v-if="activeMerchant"
        class="tab-item"
        :class="{ active: activeTab === 'boutique' }"
        @click="switchTab('boutique')"
        aria-label="Boutique"
        data-testid="player-tab-boutique"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': cartItemCount === 0 && activeTab !== 'boutique' }">
          <AppIcon icon="game-icons:shop" size="1.4rem" />
        </span>
        <span class="tab-label">Boutique</span>
        <span v-if="cartItemCount > 0" class="tab-badge tab-badge-urgent">{{ cartItemCount }}</span>
        <span v-else-if="activeTab !== 'boutique'" class="tab-badge tab-badge-pulse">!</span>
      </button>
      <button
        v-if="activeVote"
        class="tab-item"
        :class="{ active: activeTab === 'vote' }"
        @click="switchTab('vote'); hasNewVote = false"
        aria-label="Vote"
        data-testid="player-tab-vote"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': hasNewVote && activeTab !== 'vote' }">
          <AppIcon icon="lucide:check-square" size="1.4rem" />
        </span>
        <span class="tab-label">Vote</span>
        <span v-if="hasNewVote && activeTab !== 'vote'" class="tab-badge tab-badge-pulse">!</span>
      </button>
      <button
        v-if="activePuzzle"
        class="tab-item"
        :class="{ active: activeTab === 'puzzle' }"
        @click="switchTab('puzzle')"
        aria-label="Puzzle"
        data-testid="player-tab-puzzle"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': activeTab !== 'puzzle' }">
          <AppIcon icon="lucide:puzzle" size="1.4rem" />
        </span>
        <span class="tab-label">Puzzle</span>
        <span v-if="activeTab !== 'puzzle'" class="tab-badge tab-badge-pulse">!</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'messages' }"
        @click="switchTab('messages')"
        aria-label="Messages"
        data-testid="player-tab-messages"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': unreadMessages > 0 }">
          <AppIcon icon="lucide:inbox" size="1.4rem" />
        </span>
        <span class="tab-label">Messages</span>
        <span v-if="unreadMessages > 0" class="tab-badge tab-badge-urgent">{{ unreadMessages }}</span>
      </button>
    </nav>

  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────── */
.inbox-wrapper {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
  --player-panel-bg: var(--gradient-panel);
  --player-panel-highlight-bg: var(--gradient-panel-soft);
  --player-header-bg: var(--surface-highlight);
  --player-control-bg: var(--surface-raised);
  --player-control-bg-muted: var(--surface-ghost);
  --player-avatar-bg: var(--surface-highlight);
  --player-track-bg: var(--surface-track);
  --player-gold-bg: var(--surface-gold-soft);
  --player-gold-bg-strong: var(--surface-gold-soft-strong);
  --player-success-bg: var(--color-success-soft);
  --player-success-border: var(--color-success-border);
  --player-success-text: var(--color-success);
  --player-warning-bg: var(--color-warning-soft);
  --player-warning-border: var(--color-warning-border);
  --player-warning-text: var(--color-warning);
  --player-info-bg: var(--color-info-soft);
  --player-info-border: var(--color-info-border);
  --player-info-text: var(--color-info-bright);
  --player-danger-bg: var(--color-danger-soft);
  --player-danger-border: var(--color-danger-border);
  --player-danger-text: var(--color-danger);
  --player-modal-overlay: var(--surface-overlay);
  --player-toast-bg: var(--gradient-panel-soft);
  --player-toast-border: var(--color-border);
  --player-toast-shadow: var(--shadow-medium);
  --notes-canvas-bg: var(--player-control-bg-muted);
  --notes-draw-color: var(--color-parchment);
}

/* ── Header ──────────────────────────────────────────────────────────── */
.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.85rem;
  background: var(--player-header-bg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 0.5rem;
  min-height: 56px;
}
.header-left { display: flex; align-items: center; gap: 0.6rem; min-width: 0; flex: 1; }
.header-right { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }

.player-avatar-wrap {
  width: 40px; height: 40px;
  border-radius: 50%;
  border: 2px solid var(--color-gold-dark);
  overflow: hidden;
  background: var(--player-avatar-bg);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.player-avatar { width: 100%; height: 100%; object-fit: cover; }
.player-icon { font-size: 1.2rem; }

.header-info { min-width: 0; }
.player-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.92rem;
  color: var(--color-parchment);
  letter-spacing: 0.02em;
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.session-name {
  font-family: var(--font-ui, var(--font-heading)), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}

.ac-chip {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--color-gold-bright);
  background: var(--player-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.2rem 0.55rem;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.msg-chip {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  color: var(--player-danger-text);
  background: var(--player-danger-bg);
  border: 1px solid var(--player-danger-border);
  border-radius: 20px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  animation: urgentPulse 1.2s ease-in-out infinite;
  white-space: nowrap;
}

/* ── Header menu ─────────────────────────────────────────────────────── */
.header-menu-wrap { position: relative; }

.header-menu-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  padding: 0.4rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;
  min-width: 36px;
  min-height: 36px;
}
.header-menu-btn:hover, .header-menu-btn.active {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: var(--player-gold-bg);
}

.header-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
}

.header-menu-dropdown {
  position: fixed;
  top: 56px;
  right: 0.75rem;
  z-index: 1200;
  background: var(--player-panel-highlight-bg, var(--gradient-panel-soft));
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  box-shadow: var(--shadow-strong);
  min-width: 210px;
}

/* noinspection CssUnusedSymbol */
.menu-drop-enter-active { animation: fadeUp 0.18s ease both; }
/* noinspection CssUnusedSymbol */
.menu-drop-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
/* noinspection CssUnusedSymbol */
.menu-drop-leave-to { opacity: 0; transform: translateY(-6px); }

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: none;
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui, var(--font-heading)), sans-serif;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  width: 100%;
}
.menu-item:hover { background: var(--surface-raised); color: var(--color-parchment); }
/* noinspection CssUnusedSymbol */
.menu-item.is-ready { color: var(--player-success-text); }
/* noinspection CssUnusedSymbol */
.menu-item.is-blocked { color: var(--player-danger-text); }
/* noinspection CssUnusedSymbol */
.menu-item.is-pending { color: var(--player-warning-text); }
.menu-item-danger:hover { color: var(--player-danger-text); background: var(--player-danger-bg); }
.menu-divider { height: 1px; background: var(--color-border); margin: 0.2rem 0.4rem; }

.resume-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 1.2rem;
  text-align: center;
}
.resume-state.error {
  color: var(--color-red);
}
.resume-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  color: var(--color-parchment);
}
.resume-sub {
  font-family: var(--font-body), sans-serif;
  font-size: 0.9rem;
  color: var(--color-text-dim);
  max-width: 440px;
}
.resume-action-btn {
  margin-top: 0.2rem;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--color-gold-dark);
  background: var(--player-gold-bg);
  color: var(--color-gold);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
.resume-action-btn:hover { background: var(--player-gold-bg-strong); }

/* ── Scrollable content ──────────────────────────────────────────────── */
.inbox-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.85rem;
  -webkit-overflow-scrolling: touch;
  position: relative;
}

.tab-anim-wrapper {
  animation: tabFadeIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 100%;
}

.tab-panel {
  display: contents;
}

.puzzle-overlay {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Panel (for inline simple tabs) ─────────────────────────────────── */
.panel {
  background: var(--player-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: var(--shadow-soft);
}
.panel-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0 0 0.75rem;
}

/* ── Empty state (puzzle fallback) ───────────────────────────────────── */
.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 0.5rem;
  border-style: dashed;
}
.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading), sans-serif; font-size: 0.9rem; letter-spacing: 0.1em; color: var(--color-text-dim); }

/* ── Tab bar ─────────────────────────────────────────────────────────── */
.tab-bar {
  display: flex;
  overflow-x: auto;
  background: var(--player-header-bg);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tab-bar::-webkit-scrollbar { display: none; }

.tab-item {
  flex: 1;
  flex-shrink: 0;
  min-width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  padding: 0.55rem 0.3rem 0.5rem;
  min-height: 56px;
  background: none;
  border: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui, var(--font-heading)), sans-serif;
  cursor: pointer;
  transition: color 0.18s;
  position: relative;
  touch-action: manipulation;
}
.tab-item:hover:not(:disabled) { color: var(--color-parchment); }
.tab-item.active { color: var(--color-gold-bright); }

.tab-item.active::before {
  content: '';
  position: absolute;
  top: 0; left: 15%; right: 15%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-gold-bright), transparent);
  border-radius: 0 0 2px 2px;
}

.tab-item:disabled { opacity: 0.3; cursor: not-allowed; }
.tab-icon {
  font-size: 1.4rem;
  line-height: 1;
  transition: transform 0.2s, filter 0.2s;
}
.tab-icon-notify {
  animation: iconShake 0.6s ease-in-out infinite alternate;
  filter: drop-shadow(0 0 6px var(--player-danger-text));
}
@keyframes iconShake {
  0% { transform: rotate(-8deg) scale(1.1); }
  100% { transform: rotate(8deg) scale(1.2); }
}
.tab-label { font-size: 0.5rem; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }

@media (max-width: 380px) {
  .tab-label { display: none; }
  .tab-item { min-height: 52px; padding: 0.65rem 0.2rem; }
}
.tab-badge {
  position: absolute;
  top: 4px; right: calc(50% - 20px);
  min-width: 18px; height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  font-weight: 700;
  color: white;
  display: flex; align-items: center; justify-content: center;
}
.tab-badge-urgent {
  background: var(--player-danger-text);
  box-shadow: 0 0 8px var(--player-danger-text), 0 0 16px var(--player-danger-bg);
  animation: urgentPulse 1s ease-in-out infinite;
}
.tab-badge-pulse {
  background: var(--player-warning-text);
  box-shadow: 0 0 8px var(--player-warning-text), 0 0 16px var(--player-warning-bg);
  animation: urgentPulse 0.8s ease-in-out infinite;
}
@keyframes urgentPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.85; }
}

/* ── Modals ──────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--player-modal-overlay, var(--surface-overlay));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.modal-box {
  background: var(--player-panel-highlight-bg, var(--gradient-panel-soft));
  border: 1px solid var(--color-gold-dark);
  border-radius: 16px;
  padding: 2rem 1.5rem;
  width: min(400px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}
.modal-icon { font-size: 3rem; line-height: 1; }
.modal-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  margin: 0;
}
.modal-body {
  font-family: var(--font-body), sans-serif;
  font-size: 0.95rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.5;
}
.modal-body strong { color: var(--color-parchment); }
.modal-hint {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}
.dc-badge {
  display: inline-block;
  background: var(--player-info-bg, var(--color-info-soft));
  border: 1px solid var(--player-info-border, var(--color-info-border));
  border-radius: 20px;
  padding: 0.2rem 0.7rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  font-weight: 700;
  color: var(--player-info-text, var(--color-info-bright));
  letter-spacing: 0.05em;
}
.modal-close-btn {
  padding: 0.7rem 2rem;
  border-radius: 10px;
  border: 1px solid var(--color-gold-dark);
  background: var(--player-gold-bg, var(--surface-gold-soft));
  color: var(--color-gold);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.5rem;
}
.modal-close-btn:hover { background: var(--player-gold-bg-strong, var(--surface-gold-soft-strong)); }

.leave-confirm-modal { border-color: var(--player-danger-border, var(--color-danger-border)); }
.leave-confirm-modal .modal-title { color: var(--player-danger-text, var(--color-danger)); }
.leave-confirm-actions {
  display: flex;
  gap: 0.75rem;
  width: 100%;
  justify-content: center;
  margin-top: 0.5rem;
}
.leave-confirm-cancel {
  border-color: var(--color-gold-dark);
  background: var(--player-gold-bg, var(--surface-gold-soft));
  color: var(--color-gold);
}
.leave-confirm-leave {
  border-color: var(--player-danger-border, var(--color-danger-border));
  background: var(--player-danger-bg, var(--color-danger-soft));
  color: var(--player-danger-text, var(--color-danger));
  margin-top: 0;
}
.leave-confirm-leave:hover {
  background: var(--player-danger-border, var(--color-danger-border));
  color: var(--color-bg);
}

.concentration-modal { border-color: var(--player-info-border, var(--color-info-border)); }
.concentration-modal .modal-title { color: var(--player-info-text, var(--color-info-bright)); }

/* noinspection CssUnusedSymbol */
.purchase-modal.accepted { border-color: var(--player-success-border, var(--color-success-border)); }
/* noinspection CssUnusedSymbol */
.purchase-modal.accepted .modal-title { color: var(--player-success-text, var(--color-success)); }
/* noinspection CssUnusedSymbol */
.purchase-modal.rejected { border-color: var(--player-danger-border, var(--color-danger-border)); }
/* noinspection CssUnusedSymbol */
.purchase-modal.rejected .modal-title { color: var(--player-danger-text, var(--color-danger)); }

.purchase-modal-items {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: var(--player-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
}
.purchase-modal-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  text-align: left;
}
.pmi-name { flex: 1; color: var(--color-parchment); }
.pmi-qty { color: var(--color-text-dim); }
.pmi-price { color: var(--color-gold-bright); }
.purchase-modal-total {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin: 0;
}
.purchase-modal-total strong { color: var(--color-gold-bright); font-size: 1.1rem; }

/* ── Toasts ──────────────────────────────────────────────────────────── */
.toast-stack {
  position: fixed;
  right: 1rem;
  bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  z-index: 1200;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: min(340px, calc(100vw - 2rem));
  pointer-events: none;
}

.attention-toast {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: left;
  border-radius: 14px;
  border: 1px solid var(--player-toast-border);
  background: var(--player-toast-bg);
  color: var(--color-text);
  padding: 0.8rem 0.9rem;
  box-shadow: var(--player-toast-shadow);
  cursor: pointer;
}

/* noinspection CssUnusedSymbol */
.attention-toast.tone-success {
  border-color: var(--player-success-border);
  background: linear-gradient(160deg, var(--player-panel-highlight-bg), var(--player-success-bg));
}
/* noinspection CssUnusedSymbol */
.attention-toast.tone-warning {
  border-color: var(--player-warning-border);
  background: linear-gradient(160deg, var(--player-panel-highlight-bg), var(--player-warning-bg));
}
/* noinspection CssUnusedSymbol */
.attention-toast.tone-danger {
  border-color: var(--player-danger-border);
  background: linear-gradient(160deg, var(--player-panel-highlight-bg), var(--player-danger-bg));
}

.toast-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.toast-message {
  font-family: var(--font-body), sans-serif;
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--color-text-dim);
}

/* noinspection CssUnusedSymbol */
.toast-enter-active,
/* noinspection CssUnusedSymbol */
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
/* noinspection CssUnusedSymbol */
.toast-enter-from,
/* noinspection CssUnusedSymbol */
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 640px) {
  .toast-stack {
    left: 1rem;
    right: 1rem;
    width: auto;
  }
}

/* ── Wrappers layout ─────────────────────────────────────────────────── */
.inbox-lower {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.inbox-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar (cachée sur mobile/tablette) ────────────────────────────── */
.sidebar-nav {
  display: none;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 1rem 0.7rem 0.85rem;
  border: none;
  border-left: 3px solid transparent;
  border-radius: 0 8px 8px 0;
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui, var(--font-heading)), sans-serif;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  width: 100%;
  position: relative;
  touch-action: manipulation;
  min-height: 44px;
  white-space: nowrap;
}
.sidebar-item:hover:not(:disabled) {
  color: var(--color-parchment);
  background: var(--surface-raised);
}
.sidebar-item.active {
  border-left-color: var(--color-gold-bright);
  color: var(--color-gold-bright);
  background: var(--player-gold-bg);
}
.sidebar-icon {
  flex-shrink: 0;
  line-height: 1;
  display: flex;
  align-items: center;
  transition: transform 0.2s, filter 0.2s;
}
.sidebar-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Desktop (≥1024px) ───────────────────────────────────────────────── */
@media (min-width: 640px) {
  .inbox-content {
    padding: 1rem 1.5rem;
  }
  .toast-stack {
    left: 1.5rem;
    right: 1.5rem;
    width: auto;
  }
}

@media (min-width: 1024px) {
  .inbox-lower {
    flex-direction: row;
  }
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    width: 160px;
    flex-shrink: 0;
    background: var(--player-header-bg);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    padding: 0.5rem 0.4rem 0.5rem 0;
    gap: 0.1rem;
    scrollbar-width: none;
  }
  .sidebar-nav::-webkit-scrollbar { display: none; }
  .inbox-main {
    flex: 1;
    min-width: 0;
  }
  .tab-bar {
    display: none;
  }
  .inbox-content {
    padding: 1.25rem 2rem;
  }
  .tab-anim-wrapper {
    max-width: 1000px;
    margin: 0 auto;
    width: 100%;
  }
  .toast-stack {
    bottom: 1.5rem;
    right: 1.5rem;
    left: auto;
    width: min(340px, calc(100vw - 3rem));
  }
}
</style>
