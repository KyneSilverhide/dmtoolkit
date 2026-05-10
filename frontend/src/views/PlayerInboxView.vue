<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSocket, resetSocket } from '../socket.js'
import { sessionStore } from '../stores/session.js'
import MessageCard from '../components/player/MessageCard.vue'
import SpellSearchTool from '../components/player/SpellSearchTool.vue'
import PlayerNotesTool from '../components/player/PlayerNotesTool.vue'
import { getLastKnownPlayer, saveLastKnownPlayer, removeLastKnownPlayer } from '../utils/playerSessionMemory.js'
import { applyTheme, getThemePreference, setThemePreference } from '../utils/themePreferences.js'

const router = useRouter()
const route = useRoute()
const messages = ref([])
const unreadMessages = ref(0)
const playerInfo = ref(sessionStore.playerInfo || { name: 'Aventurier', hp: 20, maxHp: 20, ac: 10 })
const sessionName = ref(sessionStore.activeSession?.name || 'Session')
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const INITIATIVE_MIN = -10
const INITIATIVE_MAX = 99
const TEMP_HP_COLOR = 'var(--player-info-text)'
const MAX_HP_LIMIT = 9999

// ── Active tab ───────────────────────────────────────────────────────────
// Tabs: 'combat' | 'outils' | 'boutique' | 'vote' | 'messages'
const activeTab = ref('combat')
let hasRequestedNotificationPermission = false
const rejoinError = ref('')
const rejoining = ref(false)
const theme = ref(getThemePreference('player', 'dark'))
const isLightTheme = computed(() => theme.value === 'light')
const notificationPermission = ref(readNotificationPermission())
const attentionToasts = ref([])
let attentionToastId = 0

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

const notificationButtonLabel = computed(() => {
  if (notificationPermission.value === 'granted') return '🔔 OK'
  if (notificationPermission.value === 'denied') return '🔕 Bloquées'
  if (notificationPermission.value === 'unsupported') return '🔕 Indispo'
  return '🔔 Notifs'
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
  playerInfo.value = { ...sessionStore.playerInfo }
  sessionName.value = data.session.name
  currentHp.value = data.player.current_hp
  maxHp.value = data.player.max_hp
  pendingHp.value = data.player.current_hp
  initiativeValue.value = data.player.initiative
  isConcentrating.value = !!data.player.is_concentrating
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
      socket.off('error', onError)
      rejoining.value = false
      applyJoinedState(data)
      resolve(true)
    }

    const onError = (err) => {
      socket.off('session-joined', onJoined)
      rejoining.value = false
      rejoinError.value = err?.message || 'Impossible de reprendre la session automatiquement.'
      resolve(false)
    }

    socket.once('session-joined', onJoined)
    socket.once('error', onError)
    socket.emit('join-session', {
      code: sessionCode,
      playerName: knownPlayer.name,
      ac: knownPlayer.ac,
      hp: knownPlayer.hp,
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
    pushAttentionToast('Notifications refusées', 'Vous continuerez de voir les alertes directement dans l’interface.', 'warning')
  }

  return notificationPermission.value
}

async function handleNotificationButton() {
  const permission = await requestNotificationPermissionOnce({ interactive: true })
  if (permission === 'granted') {
    pushAttentionToast('Notifications prêtes', 'Vous verrez désormais des alertes locales quand le MJ vous contacte.', 'success')
  }
}

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'messages') unreadMessages.value = 0
  requestNotificationPermissionOnce({ interactive: true }).catch(() => {})
}

// ── HP tracking ──────────────────────────────────────────────────────────
const currentHp = ref(playerInfo.value?.hp ?? 20)
const maxHp = ref(playerInfo.value?.maxHp ?? 20)
const pendingHp = ref(currentHp.value)
const hpSending = ref(false)
const hpSent = ref(false)

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
const concentrationModal = ref(null) // { damage, dc }

function toggleConcentration() {
  isConcentrating.value = !isConcentrating.value
  const socket = getSocket()
  socket.emit('update-concentration', { isConcentrating: isConcentrating.value })
}

function dismissConcentrationModal() {
  concentrationModal.value = null
}

// ── Conditions D&D 5e ────────────────────────────────────────────────────
const DND_CONDITIONS = [
  { id: 'blinded', label: 'Aveuglé', icon: '👁️' },
  { id: 'charmed', label: 'Charmé', icon: '💕' },
  { id: 'deafened', label: 'Assourdi', icon: '🔇' },
  { id: 'exhaustion', label: 'Épuisé', icon: '😴' },
  { id: 'frightened', label: 'Effrayé', icon: '😱' },
  { id: 'grappled', label: 'Agrippé', icon: '🤝' },
  { id: 'incapacitated', label: 'Incapacité', icon: '🚫' },
  { id: 'invisible', label: 'Invisible', icon: '👻' },
  { id: 'paralyzed', label: 'Paralysé', icon: '⚡' },
  { id: 'petrified', label: 'Pétrifié', icon: '🪨' },
  { id: 'poisoned', label: 'Empoisonné', icon: '☠️' },
  { id: 'prone', label: 'À terre', icon: '⬇️' },
  { id: 'restrained', label: 'Entravé', icon: '⛓️' },
  { id: 'stunned', label: 'Étourdi', icon: '💫' },
  { id: 'unconscious', label: 'Inconscient', icon: '💤' },
]
const activeConditions = ref([])

function toggleCondition(conditionId) {
  const idx = activeConditions.value.indexOf(conditionId)
  if (idx === -1) activeConditions.value.push(conditionId)
  else activeConditions.value.splice(idx, 1)
  const socket = getSocket()
  socket.emit('update-conditions', { conditions: activeConditions.value })
}

function adjustHp(delta) {
  pendingHp.value = Math.max(0, Math.min(MAX_HP_LIMIT, pendingHp.value + delta))
}

function sendHpUpdate() {
  const socket = getSocket()
  hpSending.value = true
  socket.emit('update-hp', { newHp: pendingHp.value })
}

function sendInitiativeUpdate() {
  const socket = getSocket()
  initiativeSending.value = true
  const parsed = parseInt(initiativeValue.value, 10)
  const initiative = Number.isFinite(parsed)
    ? Math.max(INITIATIVE_MIN, Math.min(INITIATIVE_MAX, parsed))
    : null
  socket.emit('update-initiative', { initiative })
}

function leaveSession() {
  const socket = getSocket()
  socket.emit('leave-session')
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
  socket.emit('submit-vote', { voteId: activeVote.value.id, optionIndex })
}

// ── Merchant / Cart ──────────────────────────────────────────────────────
const activeMerchant = ref(sessionStore.activeMerchant || null)
const cart = ref({}) // itemId -> quantity (0 = not in cart)
const cartSending = ref(false)
// Purchase result modal
const purchaseResultModal = ref(null) // { type: 'accepted'|'rejected', items, totalPrice }
// Counter offers (legacy single-item)
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
  socket.emit('request-batch-purchase', { items })
}

function clearCart() {
  cart.value = {}
}

function respondCounterOffer(requestId, accept) {
  const socket = getSocket()
  socket.emit('respond-counter-offer', { requestId, accept })
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
  const socket = getSocket()
  if (socket && sessionStore.activeSession) {
    socket.emit('leave-session')
  }
}

// ── Socket reconnection ──────────────────────────────────────────────────
// Tracks whether the player has successfully joined a session at least once.
// Used to distinguish initial connection from auto-reconnection after mobile sleep.
let hasJoinedSession = false

async function handleSocketReconnect() {
  if (!hasJoinedSession) return
  if (!sessionStore.activeSession || !playerInfo.value) return
  const socket = getSocket()

  const onJoined = (data) => {
    clearTimeout(reconnectTimeout)
    socket.off('error', onError)
    applyJoinedState(data)
  }
  const onError = () => {
    clearTimeout(reconnectTimeout)
    socket.off('session-joined', onJoined)
  }

  socket.once('session-joined', onJoined)
  socket.once('error', onError)

  // Safety timeout: clean up listeners if the server never responds
  const reconnectTimeout = setTimeout(() => {
    socket.off('session-joined', onJoined)
    socket.off('error', onError)
  }, 10000)

  try {
    socket.emit('join-session', {
      code: sessionStore.activeSession.code,
      playerName: playerInfo.value.name,
      ac: playerInfo.value.ac,
      hp: currentHp.value,
      dndClass: playerInfo.value.dndClass || null,
      avatarUrl: playerInfo.value.avatarUrl || null,
    })
  } catch (err) {
    clearTimeout(reconnectTimeout)
    socket.off('session-joined', onJoined)
    socket.off('error', onError)
    console.error('Reconnect emit failed:', err)
  }
}

onMounted(async () => {
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
  socket.on('new-message', handleNewMessage)
  socket.on('dice-result', handleDiceResult)
  socket.on('hp-update-confirmed', handleHpConfirmed)
  socket.on('concentration-confirmed', handleConcentrationConfirmed)
  socket.on('initiative-confirmed', handleInitiativeConfirmed)
  socket.on('concentration-warning', handleConcentrationWarning)
  socket.on('vote-started', handleVoteStarted)
  socket.on('vote-closed', handleVoteClosed)
  socket.on('vote-submitted', handleVoteSubmitted)
  socket.on('merchant-shown', handleMerchantShown)
  socket.on('merchant-closed', handleMerchantClosed)
  socket.on('merchant-items-updated', handleMerchantItemsUpdated)
  socket.on('purchase-requested', handlePurchaseRequested)
  socket.on('batch-accepted', handleBatchAccepted)
  socket.on('batch-rejected', handleBatchRejected)
  socket.on('purchase-counter-offer', handlePurchaseCounterOffer)
  socket.on('counter-offer-result', handleCounterOfferResult)
  socket.on('purchase-error', handlePurchaseError)
  socket.on('kicked', handleKicked)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  hasJoinedSession = false
  const socket = getSocket()
  if (socket) {
    if (sessionStore.activeSession) socket.emit('leave-session')
    socket.off('connect', handleSocketReconnect)
    socket.off('new-message', handleNewMessage)
    socket.off('dice-result', handleDiceResult)
    socket.off('hp-update-confirmed', handleHpConfirmed)
    socket.off('concentration-confirmed', handleConcentrationConfirmed)
    socket.off('initiative-confirmed', handleInitiativeConfirmed)
    socket.off('concentration-warning', handleConcentrationWarning)
    socket.off('vote-started', handleVoteStarted)
    socket.off('vote-closed', handleVoteClosed)
    socket.off('vote-submitted', handleVoteSubmitted)
    socket.off('merchant-shown', handleMerchantShown)
    socket.off('merchant-closed', handleMerchantClosed)
    socket.off('merchant-items-updated', handleMerchantItemsUpdated)
    socket.off('purchase-requested', handlePurchaseRequested)
    socket.off('batch-accepted', handleBatchAccepted)
    socket.off('batch-rejected', handleBatchRejected)
    socket.off('purchase-counter-offer', handlePurchaseCounterOffer)
    socket.off('counter-offer-result', handleCounterOfferResult)
    socket.off('purchase-error', handlePurchaseError)
    socket.off('kicked', handleKicked)
  }
  window.removeEventListener('beforeunload', handleBeforeUnload)
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
          <div class="modal-icon">🎯</div>
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
            {{ purchaseResultModal.type === 'accepted' ? '✅' : purchaseResultModal.type === 'rejected' ? '❌' : '⚠️' }}
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
          <span v-else class="player-icon">⚔️</span>
        </div>
        <div class="header-info">
          <p class="player-name">{{ playerInfo?.name || 'Aventurier' }}</p>
          <p class="session-name">{{ sessionName }}</p>
        </div>
      </div>
      <div class="header-right">
        <span class="ac-chip">🛡️ {{ playerInfo?.ac ?? 10 }}</span>
        <button class="notify-btn" :class="notificationButtonClass" @click="handleNotificationButton">
          {{ notificationButtonLabel }}
        </button>
        <button class="theme-toggle-btn" @click="toggleTheme">
          {{ isLightTheme ? '🌙 Sombre' : '☀️ Clair' }}
        </button>
        <button class="leave-btn" @click="leaveSession">Quitter</button>
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

    <!-- ── Scrollable content ────────────────────────────────────────────── -->
    <main v-else class="inbox-content">

      <!-- ── COMBAT tab (Statut + Conditions) ───────────────────────────── -->
      <div v-show="activeTab === 'combat'" class="tab-panel">
        <!-- HP Panel -->
        <div class="panel hp-panel">
          <div class="panel-header">
            <span class="panel-label">❤️ Points de Vie</span>
            <span class="hp-fraction">{{ confirmedDisplayedHp }} / {{ maxHp }}</span>
            <span v-if="confirmedTemporaryHp > 0" class="hp-temp">+{{ confirmedTemporaryHp }} TEMP</span>
          </div>
          <div class="hp-bar-track">
            <div class="hp-bar-fill" :style="{ width: hpPercent + '%', background: hpBarColor }" />
          </div>
          <div class="hp-controls">
            <button class="hp-btn minus" @click="adjustHp(-5)">−5</button>
            <button class="hp-btn minus" @click="adjustHp(-1)">−1</button>
            <input
              v-model.number="pendingHp"
              type="number"
              class="hp-input"
              :min="0"
              :max="MAX_HP_LIMIT"
            />
            <button class="hp-btn plus" @click="adjustHp(1)">+1</button>
            <button class="hp-btn plus" @click="adjustHp(5)">+5</button>
          </div>
          <button
            class="hp-send-btn"
            :class="{ sent: hpSent }"
            :disabled="hpSending || pendingHp === currentHp"
            @click="sendHpUpdate"
          >
            {{ hpSent ? '✓ Mis à jour' : hpSending ? '…' : '📡 Mettre à jour' }}
          </button>
        </div>

        <!-- Initiative -->
        <div class="panel initiative-panel">
          <div class="panel-header">
            <span class="panel-label">🎲 Initiative</span>
          </div>
          <div class="initiative-controls">
            <input
              v-model.number="initiativeValue"
              type="number"
              class="initiative-input"
              :min="INITIATIVE_MIN"
              :max="INITIATIVE_MAX"
              placeholder="Ex: 14"
            />
            <button
              class="initiative-send-btn"
              :class="{ sent: initiativeSent }"
              :disabled="initiativeSending"
              @click="sendInitiativeUpdate"
            >
              {{ initiativeSent ? '✓ Envoyée' : initiativeSending ? '…' : '📡 Envoyer' }}
            </button>
          </div>
        </div>

        <!-- Concentration -->
        <div class="panel">
          <button
            class="concentration-btn"
            :class="{ active: isConcentrating }"
            @click="toggleConcentration"
          >
            <span class="concentration-icon">🎯</span>
            <div class="concentration-text">
              <span class="conc-label">Concentration</span>
              <span class="conc-state">{{ isConcentrating ? 'Active' : 'Inactive' }}</span>
            </div>
            <span class="conc-toggle">{{ isConcentrating ? 'Arrêter' : 'Activer' }}</span>
          </button>
        </div>

        <!-- Counter offers -->
        <div v-if="counterOffers.length > 0" class="panel counter-offers-panel">
          <p class="panel-label">🔄 Contre-offres</p>
          <div v-for="offer in counterOffers" :key="offer.requestId" class="counter-offer">
            <p class="offer-text">
              <span v-if="offer.action === 'discount'">💚 Ristourne</span>
              <span v-else>📈 Augmentation</span>
              pour <strong>{{ offer.itemName }}</strong> :
              <strong class="offer-price">{{ offer.finalPrice }} po</strong>
            </p>
            <div class="offer-actions">
              <button class="offer-btn accept" @click="respondCounterOffer(offer.requestId, true)">Accepter</button>
              <button class="offer-btn decline" @click="respondCounterOffer(offer.requestId, false)">Décliner</button>
            </div>
          </div>
        </div>

        <!-- Conditions -->
        <div class="panel">
          <p class="panel-label">⚡ États et Conditions</p>
          <div class="conditions-grid">
            <button
              v-for="cond in DND_CONDITIONS"
              :key="cond.id"
              class="condition-btn"
              :class="{ active: activeConditions.includes(cond.id) }"
              @click="toggleCondition(cond.id)"
            >
              <span class="cond-icon">{{ cond.icon }}</span>
              <span class="cond-label">{{ cond.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ── OUTILS tab (Notes + Sorts) ───────────────────────────────── -->
      <div v-show="activeTab === 'outils'" class="tab-panel">
        <div class="panel">
          <p class="panel-label">📝 Notes</p>
          <PlayerNotesTool />
        </div>
        <div class="panel">
          <p class="panel-label">🔍 Recherche de sorts</p>
          <SpellSearchTool />
        </div>
      </div>

      <!-- ── BOUTIQUE tab ─────────────────────────────────────────────── -->
      <div v-show="activeTab === 'boutique'" class="tab-panel">
        <div v-if="!activeMerchant" class="panel empty-panel">
          <p class="empty-icon">🏪</p>
          <p class="empty-text">Aucun marchand ouvert pour l'instant.</p>
        </div>
        <template v-else>
          <div class="panel merchant-header-panel">
            <h2 class="merchant-name">🏪 {{ activeMerchant.name }}</h2>
            <p v-if="activeMerchant.description" class="merchant-desc">{{ activeMerchant.description }}</p>
          </div>

          <!-- Items grouped by category -->
          <div class="panel shop-panel">
            <div
              v-for="item in activeMerchant.items"
              :key="item.id"
              class="shop-item"
              :class="{ 'out-of-stock': item.stock === 0 }"
            >
              <div class="shop-item-info">
                <span class="shop-item-cat">{{ item.category }}</span>
                <span class="shop-item-name">{{ item.name }}</span>
                <p v-if="item.description" class="shop-item-desc">{{ item.description }}</p>
              </div>
              <div class="shop-item-right">
                <span class="shop-item-price">{{ item.price }} po</span>
                <span v-if="item.stock === -1" class="shop-item-stock">∞</span>
                <span v-else-if="item.stock === 0" class="shop-item-stock empty">Épuisé</span>
                <span v-else class="shop-item-stock">×{{ item.stock }}</span>
                <div v-if="item.stock !== 0" class="qty-controls">
                  <button class="qty-btn" @click="setCartQty(item.id, (cart[item.id] || 0) - 1)">−</button>
                  <span class="qty-value">{{ cart[item.id] || 0 }}</span>
                  <button class="qty-btn" @click="setCartQty(item.id, (cart[item.id] || 0) + 1)">+</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Cart summary + submit -->
          <div class="panel cart-panel" :class="{ 'cart-active': cartItemCount > 0 }">
            <div class="cart-summary">
              <span class="cart-label">🛒 Panier : {{ cartItemCount }} article(s)</span>
              <span class="cart-total">{{ cartTotal }} po</span>
            </div>
            <div class="cart-actions">
              <button
                class="cart-submit-btn"
                :disabled="cartItemCount === 0 || cartSending"
                @click="submitCart"
              >
                {{ cartSending ? '…' : '📨 Envoyer la demande' }}
              </button>
              <button
                v-if="cartItemCount > 0"
                class="cart-clear-btn"
                @click="clearCart"
              >Vider</button>
            </div>
          </div>
        </template>
      </div>

      <!-- ── VOTE tab ─────────────────────────────────────────────────── -->
      <div v-show="activeTab === 'vote'" class="tab-panel">
        <div v-if="!activeVote" class="panel empty-panel">
          <p class="empty-icon">🗳️</p>
          <p class="empty-text">Aucun vote en cours.</p>
        </div>
        <div v-else class="panel vote-panel">
          <h3 class="vote-title">🗳️ {{ activeVote.question }}</h3>
          <div v-if="myVote === null && !activeVote.isClosed" class="vote-options">
            <button
              v-for="(opt, i) in activeVote.options"
              :key="i"
              class="vote-option-btn"
              @click="submitVote(i)"
            >{{ opt }}</button>
          </div>
          <div v-else-if="myVote !== null && !activeVote.isClosed" class="vote-done">
            <p>✓ Vous avez voté pour : <strong>{{ activeVote.options[myVote] }}</strong></p>
          </div>
          <div v-if="activeVote.isClosed" class="vote-results-mini">
            <p class="vote-closed-label">Vote clôturé — Résultats :</p>
            <p v-for="(opt, i) in activeVote.options" :key="i" class="vote-result-line">
              {{ opt }}: <strong>{{ activeVote.results[i] }}</strong> vote(s)
            </p>
          </div>
        </div>
      </div>

      <!-- ── MESSAGES tab ─────────────────────────────────────────────── -->
      <div v-show="activeTab === 'messages'" class="tab-panel">
        <div v-if="messages.length === 0" class="panel empty-panel">
          <p class="empty-icon">📜</p>
          <p class="empty-text">En attente de messages…</p>
          <p class="empty-sub">Restez vigilant, aventurier.</p>
        </div>
        <div v-else class="messages-list">
          <MessageCard v-for="(msg, idx) in messages" :key="idx" :message="msg" />
        </div>
      </div>

    </main>

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
    <nav v-if="!rejoining && !rejoinError" class="tab-bar">
      <button
        class="tab-item"
        :class="{ active: activeTab === 'combat' }"
        @click="switchTab('combat')"
      >
        <span class="tab-icon">⚔️</span>
        <span class="tab-label">Combat</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'outils' }"
        @click="switchTab('outils')"
      >
        <span class="tab-icon">🛠️</span>
        <span class="tab-label">Outils</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'boutique', disabled: !activeMerchant }"
        :disabled="!activeMerchant"
        @click="switchTab('boutique')"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': activeMerchant && cartItemCount === 0 }">🏪</span>
        <span class="tab-label">Boutique</span>
        <span v-if="cartItemCount > 0" class="tab-badge tab-badge-urgent">{{ cartItemCount }}</span>
        <span v-else-if="activeMerchant && activeTab !== 'boutique'" class="tab-badge tab-badge-pulse">!</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'vote' }"
        @click="switchTab('vote'); hasNewVote = false"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': hasNewVote && activeTab !== 'vote' }">🗳️</span>
        <span class="tab-label">Vote</span>
        <span v-if="hasNewVote && activeTab !== 'vote'" class="tab-badge tab-badge-pulse">!</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'messages' }"
        @click="switchTab('messages')"
      >
        <span class="tab-icon" :class="{ 'tab-icon-notify': unreadMessages > 0 }">📜</span>
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--player-header-bg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 0.5rem;
}
.header-left { display: flex; align-items: center; gap: 0.6rem; min-width: 0; flex: 1; }
.header-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap; }

@media (max-width: 480px) {
  .inbox-header { padding: 0.5rem 0.75rem; gap: 0.35rem; }
  .header-left { flex: 1 1 100%; }
  .header-right { flex: 1 1 100%; justify-content: flex-end; }
  .notify-btn, .theme-toggle-btn, .leave-btn { font-size: 0.6rem; padding: 0.28rem 0.5rem; }
  .ac-chip { font-size: 0.7rem; }
}

.notify-btn,
.theme-toggle-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  text-transform: uppercase;
  white-space: nowrap;
}
.notify-btn:hover,
.theme-toggle-btn:hover {
  color: var(--color-gold-bright);
  border-color: var(--color-gold-dark);
}

.notify-btn.is-ready {
  color: var(--player-success-text);
  border-color: var(--player-success-border);
  background: var(--player-success-bg);
}

.notify-btn.is-blocked {
  color: var(--player-danger-text);
  border-color: var(--player-danger-border);
  background: var(--player-danger-bg);
}

.notify-btn.is-pending {
  color: var(--player-warning-text);
  border-color: var(--player-warning-border);
  background: var(--player-warning-bg);
}

.player-avatar-wrap {
  width: 38px; height: 38px;
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
  font-family: var(--font-heading);
  font-size: 0.95rem;
  color: var(--color-parchment);
  letter-spacing: 0.03em;
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.session-name {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}

.ac-chip {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--player-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.2rem 0.6rem;
  white-space: nowrap;
}
.leave-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.2s;
  white-space: nowrap;
}
.leave-btn:hover { border-color: var(--player-danger-border); color: var(--player-danger-text); }

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
  font-family: var(--font-heading);
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  color: var(--color-parchment);
}
.resume-sub {
  font-family: var(--font-body);
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
  font-family: var(--font-heading);
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
  padding: 1rem;
  -webkit-overflow-scrolling: touch;
}
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ── Panel cards ─────────────────────────────────────────────────────── */
.panel {
  background: var(--player-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: var(--shadow-soft);
}
.panel-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0 0 0.75rem;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

/* ── HP Panel ────────────────────────────────────────────────────────── */
.hp-panel { display: flex; flex-direction: column; gap: 0.6rem; }
.hp-fraction {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-parchment);
  letter-spacing: 0.05em;
}
.hp-temp {
  font-family: var(--font-heading);
  font-size: 0.72rem;
  color: var(--player-info-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hp-bar-track { height: 8px; background: var(--player-track-bg); border-radius: 4px; overflow: hidden; }
.hp-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease, background 0.4s ease; }
.hp-controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.hp-btn {
  flex: 1;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s;
}
.hp-btn.minus:hover { border-color: var(--player-danger-border); color: var(--player-danger-text); background: var(--player-danger-bg); }
.hp-btn.plus:hover { border-color: var(--player-success-border); color: var(--player-success-text); background: var(--player-success-bg); }
.hp-input {
  flex: 2;
  height: 40px;
  text-align: center;
  background: var(--player-control-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 1.4rem;
  font-weight: 700;
  outline: none;
}
.hp-input:focus { border-color: var(--color-gold-dark); }
.hp-send-btn {
  width: 100%;
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--color-gold-dark);
  background: var(--player-gold-bg);
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.hp-send-btn:hover:not(:disabled) { background: var(--player-gold-bg-strong); }
.hp-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.hp-send-btn.sent { border-color: var(--player-success-border); background: var(--player-success-bg); color: var(--player-success-text); }

/* ── Initiative ──────────────────────────────────────────────────────── */
.initiative-panel { display: flex; flex-direction: column; gap: 0.5rem; }
.initiative-controls { display: flex; align-items: center; gap: 0.5rem; }
.initiative-input {
  flex: 1;
  height: 40px;
  text-align: center;
  background: var(--player-control-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 1.2rem;
  font-weight: 700;
  outline: none;
}
.initiative-input:focus { border-color: var(--player-info-border); }
.initiative-send-btn {
  border: 1px solid var(--player-info-border);
  border-radius: 8px;
  background: var(--player-info-bg);
  color: var(--player-info-text);
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.initiative-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.initiative-send-btn.sent { border-color: var(--player-success-border); color: var(--player-success-text); background: var(--player-success-bg); }

/* ── Concentration ───────────────────────────────────────────────────── */
.concentration-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg-muted);
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.concentration-btn:hover:not(.active) {
  border-color: var(--color-gold-dark);
  color: var(--color-parchment);
}
.concentration-btn.active {
  border-color: var(--player-info-border);
  background: var(--player-info-bg);
  box-shadow: var(--shadow-soft);
}
.concentration-icon { font-size: 1.3rem; flex-shrink: 0; }
.concentration-text { flex: 1; }
.conc-label { display: block; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; }
.conc-state {
  display: block;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  margin-top: 0.1rem;
}
.concentration-btn.active .conc-state { color: var(--player-info-text); }
.conc-toggle {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  flex-shrink: 0;
}
.concentration-btn.active .conc-toggle { color: var(--player-info-text); }

/* ── Counter offers ──────────────────────────────────────────────────── */
.counter-offers-panel { display: flex; flex-direction: column; gap: 0.6rem; }
.counter-offer {
  background: var(--player-success-bg);
  border: 1px solid var(--player-success-border);
  border-radius: 8px;
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.offer-text { font-family: var(--font-body); font-size: 0.85rem; color: var(--color-text-dim); margin: 0; }
.offer-text strong { color: var(--color-parchment); }
.offer-price { color: var(--player-success-text) !important; }
.offer-actions { display: flex; gap: 0.5rem; }
.offer-btn {
  flex: 1; padding: 0.45rem;
  border-radius: 6px; font-family: var(--font-heading); font-size: 0.7rem;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.2s; border: 1px solid;
}
.offer-btn.accept { background: var(--player-success-bg); border-color: var(--player-success-border); color: var(--player-success-text); }
.offer-btn.accept:hover { filter: brightness(1.08); }
.offer-btn.decline { background: var(--player-danger-bg); border-color: var(--player-danger-border); color: var(--player-danger-text); }
.offer-btn.decline:hover { filter: brightness(1.05); }

/* ── Conditions ──────────────────────────────────────────────────────── */
.conditions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
.condition-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.6rem 0.4rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg-muted);
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s;
}
.condition-btn:hover { border-color: var(--player-warning-border); color: var(--player-warning-text); }
.condition-btn.active {
  border-color: var(--player-danger-border);
  background: var(--player-danger-bg);
  color: var(--player-danger-text);
}
.cond-icon { font-size: 1.1rem; }
.cond-label { text-align: center; line-height: 1.2; white-space: nowrap; }

/* ── Shop ────────────────────────────────────────────────────────────── */
.merchant-header-panel { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem 1rem; }
.merchant-name {
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.1em;
  color: var(--color-gold-bright);
  margin: 0;
}
.merchant-desc { font-family: var(--font-body); font-size: 0.8rem; color: var(--color-text-dim); margin: 0; }

.shop-panel { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; }
.shop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.5rem;
  background: var(--player-control-bg-muted);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.shop-item.out-of-stock { opacity: 0.45; }
.shop-item-info { flex: 1; min-width: 0; }
.shop-item-cat {
  display: block;
  font-family: var(--font-heading);
  font-size: 0.52rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.1rem;
}
.shop-item-name { font-family: var(--font-heading); font-size: 0.85rem; color: var(--color-parchment); }
.shop-item-desc { font-family: var(--font-body); font-size: 0.72rem; color: var(--color-text-dim); margin: 0.1rem 0 0; }
.shop-item-right { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.shop-item-price { font-family: var(--font-title); font-size: 0.95rem; color: var(--color-gold-bright); }
.shop-item-stock { font-family: var(--font-heading); font-size: 0.6rem; color: var(--color-text-dim); }
.shop-item-stock.empty { color: var(--player-danger-text); }

.qty-controls { display: flex; align-items: center; gap: 0.3rem; }
.qty-btn {
  width: 28px; height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-parchment);
  font-size: 1rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.qty-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.qty-value {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-parchment);
  min-width: 20px;
  text-align: center;
}

.cart-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-color: var(--color-gold-dark);
}
.cart-panel.cart-active { border-color: var(--color-gold-dark); background: var(--player-panel-highlight-bg); }
.cart-summary { display: flex; align-items: center; justify-content: space-between; }
.cart-label { font-family: var(--font-heading); font-size: 0.75rem; letter-spacing: 0.1em; color: var(--color-text-dim); }
.cart-total { font-family: var(--font-title); font-size: 1.1rem; color: var(--color-gold-bright); }
.cart-actions { display: flex; gap: 0.5rem; }
.cart-submit-btn {
  flex: 1;
  padding: 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-gold-dark);
  background: var(--player-gold-bg);
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.cart-submit-btn:hover:not(:disabled) { background: var(--player-gold-bg-strong); }
.cart-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cart-clear-btn {
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.2s;
}
.cart-clear-btn:hover { border-color: var(--player-danger-border); color: var(--player-danger-text); }

/* ── Vote ────────────────────────────────────────────────────────────── */
.vote-panel { display: flex; flex-direction: column; gap: 0.75rem; }
.vote-title { font-family: var(--font-heading); font-size: 1rem; color: var(--color-gold-bright); letter-spacing: 0.05em; margin: 0; }
.vote-options { display: flex; flex-direction: column; gap: 0.5rem; }
.vote-option-btn {
  padding: 0.7rem 1rem;
  background: var(--player-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.vote-option-btn:hover { background: var(--player-gold-bg-strong); border-color: var(--color-gold); color: var(--color-gold-bright); }
.vote-done { font-family: var(--font-body); font-size: 0.9rem; color: var(--player-success-text); }
.vote-done strong { color: var(--color-parchment); }
.vote-closed-label { font-family: var(--font-heading); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-dim); margin: 0 0 0.25rem; }
.vote-result-line { font-family: var(--font-body); font-size: 0.85rem; color: var(--color-text-dim); margin: 0.1rem 0; }
.vote-result-line strong { color: var(--color-parchment); }

/* ── Messages ────────────────────────────────────────────────────────── */
.messages-list { display: flex; flex-direction: column; gap: 1rem; }

/* ── Empty states ────────────────────────────────────────────────────── */
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
.empty-text { font-family: var(--font-heading); font-size: 0.9rem; letter-spacing: 0.1em; color: var(--color-text-dim); }
.empty-sub { font-family: var(--font-body); color: var(--color-border); font-size: 0.8rem; }

/* ── Tab bar ─────────────────────────────────────────────────────────── */
.tab-bar {
  display: flex;
  background: var(--player-header-bg);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.6rem 0.25rem;
  background: none;
  border: none;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  cursor: pointer;
  transition: color 0.2s;
  position: relative;
  min-width: 0;
}
.tab-item:hover:not(:disabled) { color: var(--color-parchment); }
.tab-item.active { color: var(--color-gold-bright); }
.tab-item.active::before {
  content: '';
  position: absolute;
  top: 0; left: 20%; right: 20%;
  height: 2px;
  background: var(--color-gold-dark);
  border-radius: 0 0 2px 2px;
}
.tab-item:disabled { opacity: 0.3; cursor: not-allowed; }
.tab-icon {
  font-size: 1.3rem;
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
.tab-label { font-size: 0.55rem; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.tab-badge {
  position: absolute;
  top: 4px; right: calc(50% - 18px);
  min-width: 18px; height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  font-family: var(--font-heading);
  font-size: 0.65rem;
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
/* Note: modals use <Teleport to="body"> so CSS custom properties defined on
   .inbox-wrapper are not inherited. All --player-* vars need explicit fallbacks. */
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
  font-family: var(--font-heading);
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  margin: 0;
}
.modal-body {
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.5;
}
.modal-body strong { color: var(--color-parchment); }
.modal-hint {
  font-family: var(--font-heading);
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
  font-family: var(--font-heading);
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
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.5rem;
}
.modal-close-btn:hover { background: var(--player-gold-bg-strong, var(--surface-gold-soft-strong)); }

/* Concentration modal specifics */
.concentration-modal { border-color: var(--player-info-border, var(--color-info-border)); }
.concentration-modal .modal-title { color: var(--player-info-text, var(--color-info-bright)); }

/* Purchase result modal */
.purchase-modal.accepted { border-color: var(--player-success-border, var(--color-success-border)); }
.purchase-modal.accepted .modal-title { color: var(--player-success-text, var(--color-success)); }
.purchase-modal.rejected { border-color: var(--player-danger-border, var(--color-danger-border)); }
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
  font-family: var(--font-heading);
  font-size: 0.8rem;
  text-align: left;
}
.pmi-name { flex: 1; color: var(--color-parchment); }
.pmi-qty { color: var(--color-text-dim); }
.pmi-price { color: var(--color-gold-bright); }
.purchase-modal-total {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin: 0;
}
.purchase-modal-total strong { color: var(--color-gold-bright); font-size: 1.1rem; }

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

.attention-toast.tone-success {
  border-color: var(--player-success-border);
  background: linear-gradient(160deg, var(--player-panel-highlight-bg), var(--player-success-bg));
}

.attention-toast.tone-warning {
  border-color: var(--player-warning-border);
  background: linear-gradient(160deg, var(--player-panel-highlight-bg), var(--player-warning-bg));
}

.attention-toast.tone-danger {
  border-color: var(--player-danger-border);
  background: linear-gradient(160deg, var(--player-panel-highlight-bg), var(--player-danger-bg));
}

.toast-title {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.toast-message {
  font-family: var(--font-body);
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--color-text-dim);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
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
</style>
