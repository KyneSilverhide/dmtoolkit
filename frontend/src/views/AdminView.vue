<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '../stores/auth.js'
import { sessionStore } from '../stores/session.js'
import { getSocket, resetSocket } from '../socket.js'
import PlayerList from '../components/admin/PlayerList.vue'
import MessageTool from '../components/admin/MessageTool.vue'
import CriticalFailTool from '../components/admin/CriticalFailTool.vue'
import SessionJournal from '../components/admin/SessionJournal.vue'
import TvControls from '../components/admin/TvControls.vue'
import VoteManager from '../components/admin/VoteManager.vue'
import ImageManager from '../components/admin/ImageManager.vue'
import AudioManager from '../components/admin/AudioManager.vue'
import MerchantManager from '../components/admin/MerchantManager.vue'
import PuzzleManager from '../components/admin/PuzzleManager.vue'
import ReputationManager from '../components/admin/ReputationManager.vue'
import SearchTool from '../components/admin/SearchTool.vue'
import MapManager from '../components/admin/MapManager.vue'
import GoldDividerTool from '../components/admin/GoldDividerTool.vue'
import GeneratorTool from '../components/admin/GeneratorTool.vue'
import AdminHeader from '../components/admin/AdminHeader.vue'
import AdminNavSidebar from '../components/admin/AdminNavSidebar.vue'
import AdminTvSidebar from '../components/admin/AdminTvSidebar.vue'
import PlayerRollToasts from '../components/admin/PlayerRollToasts.vue'
import { applyTheme, getThemePreference, setThemePreference } from '../utils/themePreferences.js'
import DemoBanner from '../components/DemoBanner.vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import {
  PLAYER_JOINED, PLAYER_LEFT, PLAYERS_SNAPSHOT, HP_UPDATED,
  CONDITIONS_UPDATED, CONCENTRATION_UPDATED, INITIATIVE_UPDATED,
  ADMIN_STATE, TV_MODE_CHANGED, VOTE_STARTED, VOTE_CLOSED,
  MAP_STATE, MERCHANT_ITEMS_UPDATED, DOOM_CLOCK_STARTED, DOOM_CLOCK_STOPPED,
  TENSION_SCALE_UPDATED, TENSION_SCALE_ENDED, TIME_SCALE_UPDATED, TIME_SCALE_ENDED,
  PLAYER_ROLL_RESULT, DEMO_RESET, ROUND_UPDATED,
  ADMIN_JOIN, SET_TV_MODE, FACTIONS_UPDATED,
} from '../socket-events.js'

const router = useRouter()
import { BACKEND_URL } from '@/config.js'
// __APP_VERSION__ is injected at build time by Vite from frontend/package.json
const appVersion = __APP_VERSION__
const activeTab = ref('players')
const generatorEnabled = ref(true) // optimistic default — updated by loadConfig()

const isSessionPanelCollapsed = ref(false)
const tvMode = ref('lobby')
const theme = ref(getThemePreference('admin', 'dark'))
const isLightTheme = computed(() => theme.value === 'light')
const isNavCollapsed = ref(false)

// ── Tab → component mapping (for <KeepAlive>) ───────────────────────────
const tabComponents = {
  players: PlayerList,
  message: MessageTool,
  dice: CriticalFailTool,
  journal: SessionJournal,
  tension: TvControls,
  vote: VoteManager,
  images: ImageManager,
  audio: AudioManager,
  map: MapManager,
  merchants: MerchantManager,
  puzzle: PuzzleManager,
  reputation: ReputationManager,
  tresor: GoldDividerTool,
  search: SearchTool,
  generator: GeneratorTool,
}
const currentTabComponent = computed(() => tabComponents[activeTab.value] || null)

const hasActiveVote = ref(false)
const hasActiveImage = ref(false)
const hasActiveMerchant = ref(false)
const hasActiveDoom = ref(false)
const hasActiveTension = ref(false)
const hasActiveTimeScale = ref(false)
const hasActiveMap = ref(false)
const activePuzzle = ref(null)
const hasActiveReputation = ref(false)
const combatRound = ref(0)

const tabActivity = computed(() => ({
  vote: hasActiveVote.value,
  images: hasActiveImage.value,
  merchants: hasActiveMerchant.value,
  tension: hasActiveDoom.value || hasActiveTension.value || hasActiveTimeScale.value,
  map: hasActiveMap.value,
  puzzle: !!activePuzzle.value,
  reputation: hasActiveReputation.value,
}))

// Keeps the socket instance used in onMounted so onUnmounted can clean up
// safely even after resetSocket() was called (e.g. on logout before unmount).
let _socket = null

// ── Player roll toasts ───────────────────────────────────────────────────
const playerRollToasts = ref([])
let playerRollToastId = 0
const toastTimers = new Map()

function scheduleToastDismiss(id, delay) {
  const timerId = setTimeout(() => {
    dismissPlayerRollToast(id)
    toastTimers.delete(id)
  }, delay)
  toastTimers.set(id, timerId)
}

function pushPlayerRollToast(payload) {
  const id = ++playerRollToastId
  playerRollToasts.value = [...playerRollToasts.value, { id, ...payload }]
  scheduleToastDismiss(id, 6000)
}

function dismissPlayerRollToast(id) {
  const timerId = toastTimers.get(id)
  if (timerId) clearTimeout(timerId)
  playerRollToasts.value = playerRollToasts.value.filter(t => t.id !== id)
  toastTimers.delete(id)
}

function pauseToast(id) {
  const timerId = toastTimers.get(id)
  if (timerId) {
    clearTimeout(timerId)
    toastTimers.delete(id)
  }
}

function resumeToast(id) {
  if (!playerRollToasts.value.find(t => t.id === id)) return
  scheduleToastDismiss(id, 3000)
}

// ── Tab / nav definitions ────────────────────────────────────────────────
const tabs = [
  { key: 'players',    label: 'Joueurs',      icon: 'game-icons:wizard-staff' },
  { key: 'message',   label: 'Messages',      icon: 'lucide:mail' },
  { key: 'dice',      label: 'Critical Fail', icon: 'game-icons:dice-six-faces-five' },
  { key: 'journal',   label: 'Journal',       icon: 'game-icons:scroll-unfurled' },
  { key: 'tension',   label: 'Rythme',        icon: 'lucide:timer' },
  { key: 'vote',      label: 'Vote',          icon: 'lucide:check-square' },
  { key: 'images',    label: 'Images',        icon: 'lucide:image' },
  { key: 'audio',     label: 'Audio',         icon: 'lucide:music-2' },
  { key: 'map',       label: 'Carte',         icon: 'lucide:map' },
  { key: 'merchants', label: 'Marchands',     icon: 'game-icons:shop' },
  { key: 'puzzle',    label: 'Puzzles',       icon: 'lucide:puzzle' },
  { key: 'reputation',label: 'Réputations',   icon: 'lucide:shield' },
  { key: 'tresor',    label: 'Trésor',        icon: 'game-icons:coins' },
  { key: 'search',    label: 'Recherche',     icon: 'lucide:search' },
  { key: 'generator', label: 'Générateur',    icon: 'lucide:wand-2' },
]

const navGroups = [
  { label: 'En jeu',  items: ['players', 'message', 'dice', 'journal'] },
  { label: 'Scène',   items: ['tension', 'vote', 'images', 'audio', 'map', 'merchants', 'puzzle', 'reputation'] },
  { label: 'Outils',  items: ['tresor', 'search', 'generator'] },
]

// ── TV modes ─────────────────────────────────────────────────────────────
const tvModes = computed(() => ([
  { key: 'lobby',      label: 'Lobby',            hint: 'Code et QR de session',        ready: true },
  { key: 'combat',     label: 'Combat',           hint: 'Liste des joueurs / HP / AC',  ready: true },
  { key: 'vote',       label: 'Vote',             hint: 'Affiche le vote actif',         ready: hasActiveVote.value },
  { key: 'image',      label: 'Image',            hint: 'Affiche l image active',        ready: hasActiveImage.value },
  { key: 'map',        label: 'Carte',            hint: 'Depuis l onglet Carte',         ready: hasActiveMap.value },
  { key: 'merchant',   label: 'Marchand',         hint: 'Affiche le marchand actif',     ready: hasActiveMerchant.value },
  { key: 'doom',       label: 'Doom Clock',       hint: 'Depuis l onglet Rythme',        ready: hasActiveDoom.value },
  { key: 'tension',    label: 'Echelle tension',  hint: 'Depuis l onglet Rythme',        ready: hasActiveTension.value },
  { key: 'timescale',  label: 'Echelle de temps', hint: 'Depuis l onglet Rythme',        ready: hasActiveTimeScale.value },
  { key: 'reputation', label: 'Réputations',      hint: 'Depuis l onglet Réputations',   ready: hasActiveReputation.value },
]))

const activeTvModeLabel = computed(() => {
  const mode = tvModes.value.find(item => item.key === tvMode.value)
  return mode?.label || tvMode.value
})

const activeSessionLabel = computed(() => {
  if (!sessionStore.activeSession) return ''
  return `${sessionStore.activeSession.name} - ${sessionStore.activeSession.code}`
})

// ── Actions ──────────────────────────────────────────────────────────────
function setTvMode(mode) {
  if (!sessionStore.activeSession?.id) return
  const modeObj = tvModes.value.find(item => item.key === mode)
  if (!modeObj?.ready) return
  const socket = getSocket(authStore.token)
  socket.emit(SET_TV_MODE, { sessionId: sessionStore.activeSession.id, mode })
}

function logout() {
  resetSocket()
  authStore.logout()
  router.push('/')
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  setThemePreference('admin', theme.value)
  applyTheme(theme.value)
}

function adjustRound(delta) {
  if (!sessionStore.activeSession?.id) return
  const socket = getSocket(authStore.token)
  const newRound = Math.max(0, combatRound.value + delta)
  socket.emit('set-combat-round', { sessionId: sessionStore.activeSession.id, round: newRound })
}

function resetRound() {
  if (!sessionStore.activeSession?.id) return
  const socket = getSocket(authStore.token)
  socket.emit('set-combat-round', { sessionId: sessionStore.activeSession.id, round: 0 })
}

// ── Socket handlers ───────────────────────────────────────────────────────
function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  tvMode.value = data.tvMode || 'lobby'
  combatRound.value = data.combatRound || 0

  hasActiveVote.value = !!data.activeVote
  hasActiveImage.value = !!data.currentImageUrl
  hasActiveMerchant.value = !!data.activeMerchant
  hasActiveDoom.value = !!data.doomClock
  hasActiveTension.value = !!data.tensionScale
  hasActiveTimeScale.value = !!data.timeScale
  hasActiveMap.value = !!(data.mapState?.mapUrl)
  activePuzzle.value = data.activePuzzle || null
  hasActiveReputation.value = Array.isArray(data.factions) && data.factions.length > 0
  if (data.isDemo !== undefined && authStore.admin) {
    authStore.admin = { ...authStore.admin, is_demo: data.isDemo }
  }
}

function handleTvModeChanged(payload) {
  if (payload?.mode) tvMode.value = payload.mode
  if (payload?.imageUrl !== undefined) hasActiveImage.value = !!payload.imageUrl
  if (payload?.merchantData !== undefined) hasActiveMerchant.value = !!payload.merchantData
  if (payload?.mode === 'puzzle' && payload?.puzzleImageId) {
    activePuzzle.value = { puzzleImageId: payload.puzzleImageId, puzzleSeed: payload.puzzleSeed, puzzleClicks: activePuzzle.value?.puzzleClicks || [] }
  } else if (payload?.mode && payload.mode !== 'puzzle') {
    activePuzzle.value = null
  }
}

// ── Data loading ─────────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json()
    if (res.ok) sessionStore.setSessions(data)
  } catch {
    // SessionManager garde son propre chargement en secours.
  }
}

async function loadConfig() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`)
    if (res.ok) {
      const cfg = await res.json()
      generatorEnabled.value = cfg.generatorEnabled !== false
    }
  } catch { /* silently ignore */ }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  document.body.classList.add('page-admin')
  loadSessions()
  loadConfig()
  releaseNotesStore.load()
  _socket = getSocket(authStore.token)

  _socket.on('connect', () => {
    if (sessionStore.activeSession?.id) {
      _socket.emit(ADMIN_JOIN, sessionStore.activeSession.id)
    }
  })

  _socket.on(PLAYER_JOINED, (player) => { sessionStore.addPlayer(player) })
  _socket.on(PLAYER_LEFT, (data) => { sessionStore.removePlayer(data.playerId) })
  _socket.on(PLAYERS_SNAPSHOT, ({ sessionId, players }) => {
    if (sessionStore.activeSession?.id !== sessionId) return
    sessionStore.setPlayers(players)
  })
  _socket.on(HP_UPDATED, ({ playerId, newHp, newMaxHp }) => {
    sessionStore.updatePlayerHp(playerId, newHp, newMaxHp)
  })
  _socket.on(CONDITIONS_UPDATED, ({ playerId, conditions }) => {
    sessionStore.updatePlayerConditions(playerId, conditions)
  })
  _socket.on(CONCENTRATION_UPDATED, ({ playerId, isConcentrating }) => {
    sessionStore.updatePlayerConcentration(playerId, isConcentrating)
  })
  _socket.on(INITIATIVE_UPDATED, ({ playerId, initiative }) => {
    sessionStore.updatePlayerInitiative(playerId, initiative)
  })
  _socket.on(ADMIN_STATE, handleAdminState)
  _socket.on(TV_MODE_CHANGED, handleTvModeChanged)
  _socket.on(VOTE_STARTED, () => { hasActiveVote.value = true })
  _socket.on(VOTE_CLOSED, () => { hasActiveVote.value = false })
  _socket.on(MAP_STATE, (data) => { hasActiveMap.value = !!(data?.mapUrl) })
  _socket.on(MERCHANT_ITEMS_UPDATED, () => { hasActiveMerchant.value = true })
  _socket.on(DOOM_CLOCK_STARTED, () => { hasActiveDoom.value = true })
  _socket.on(DOOM_CLOCK_STOPPED, () => {
    hasActiveDoom.value = false
    if (tvMode.value === 'doom') tvMode.value = 'lobby'
  })
  _socket.on(TENSION_SCALE_UPDATED, () => { hasActiveTension.value = true })
  _socket.on(TENSION_SCALE_ENDED, () => {
    hasActiveTension.value = false
    if (tvMode.value === 'tension') tvMode.value = 'lobby'
  })
  _socket.on(TIME_SCALE_UPDATED, () => { hasActiveTimeScale.value = true })
  _socket.on(TIME_SCALE_ENDED, () => {
    hasActiveTimeScale.value = false
    if (tvMode.value === 'timescale') tvMode.value = 'lobby'
  })
  _socket.on(PLAYER_ROLL_RESULT, (payload) => {
    try {
      if (payload && typeof payload === 'object') pushPlayerRollToast(payload)
    } catch (err) {
      console.error('player-roll-result handler error:', err)
    }
  })
  _socket.on(DEMO_RESET, () => { window.location.reload() })
  _socket.on(FACTIONS_UPDATED, (factions) => {
    hasActiveReputation.value = Array.isArray(factions) && factions.length > 0
  })

  _socket.on(ROUND_UPDATED, ({ round }) => {
    combatRound.value = round
  })
})

watch(
  () => sessionStore.activeSession?.id,
  (sessionId) => {
    if (!sessionId) return
    isSessionPanelCollapsed.value = true
    const socket = getSocket(authStore.token)
    socket.emit(ADMIN_JOIN, sessionId)
  },
  { immediate: true }
)

onUnmounted(() => {
  document.body.classList.remove('page-admin')
  if (_socket) {
    _socket.off('connect')
    _socket.off(PLAYER_JOINED)
    _socket.off(PLAYER_LEFT)
    _socket.off(PLAYERS_SNAPSHOT)
    _socket.off(HP_UPDATED)
    _socket.off(CONDITIONS_UPDATED)
    _socket.off(CONCENTRATION_UPDATED)
    _socket.off(INITIATIVE_UPDATED)
    _socket.off(ADMIN_STATE, handleAdminState)
    _socket.off(TV_MODE_CHANGED, handleTvModeChanged)
    _socket.off(VOTE_STARTED)
    _socket.off(VOTE_CLOSED)
    _socket.off(MERCHANT_ITEMS_UPDATED)
    _socket.off(DOOM_CLOCK_STARTED)
    _socket.off(DOOM_CLOCK_STOPPED)
    _socket.off(TENSION_SCALE_UPDATED)
    _socket.off(TENSION_SCALE_ENDED)
    _socket.off(TIME_SCALE_UPDATED)
    _socket.off(TIME_SCALE_ENDED)
    _socket.off(MAP_STATE)
    _socket.off(PLAYER_ROLL_RESULT)
    _socket.off(DEMO_RESET)
    _socket.off(FACTIONS_UPDATED)
    _socket.off(ROUND_UPDATED)
    _socket = null
  }
})
</script>

<template>
  <div class="admin-wrapper">
    <DemoBanner v-if="authStore.admin?.is_demo" />

    <AdminHeader
      :admin="authStore.admin"
      :app-version="appVersion"
      :is-light-theme="isLightTheme"
      :is-session-panel-collapsed="isSessionPanelCollapsed"
      :active-session-label="activeSessionLabel"
      :has-active-session="!!sessionStore.activeSession"
      @logout="logout"
      @toggle-theme="toggleTheme"
      @toggle-session-panel="isSessionPanelCollapsed = !isSessionPanelCollapsed"
    />

    <div class="admin-body">
      <AdminNavSidebar
        v-if="sessionStore.activeSession"
        :tabs="tabs"
        :nav-groups="navGroups"
        :active-tab="activeTab"
        :tab-activity="tabActivity"
        :generator-enabled="generatorEnabled"
        :is-collapsed="isNavCollapsed"
        @update:active-tab="activeTab = $event"
        @update:is-collapsed="isNavCollapsed = $event"
      />

      <div class="admin-content-area">
        <div class="admin-main-grid">
          <section class="admin-main">
            <template v-if="sessionStore.activeSession">
              <Transition name="tab-fade" mode="out-in">
                <KeepAlive>
                  <component
                    :is="currentTabComponent"
                    v-bind="activeTab === 'puzzle' ? { activePuzzle } : {}"
                  />
                </KeepAlive>
              </Transition>
            </template>
            <p v-else class="no-session-msg">Sélectionnez ou créez une session pour accéder aux outils.</p>
          </section>

          <AdminTvSidebar
            :tv-modes="tvModes"
            :tv-mode="tvMode"
            :has-active-session="!!sessionStore.activeSession"
            :active-tv-mode-label="activeTvModeLabel"
            @set-mode="setTvMode"
          />
        </div>
      </div>
    </div>

    <PlayerRollToasts
      :toasts="playerRollToasts"
      @dismiss="dismissPlayerRollToast"
      @pause="pauseToast"
      @resume="resumeToast"
    />
  </div>
</template>

<style scoped>
.admin-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin: 0 auto;
  width: 100%;
  color: var(--color-text);
}

.admin-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.admin-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
}

.admin-main-grid {
  flex: 1;
  padding: 1.25rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 1rem;
  align-items: start;
}

.admin-main {
  min-width: 0;
  background: var(--gradient-panel);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.25rem;
}

.no-session-msg { font-size: 0.88rem; color: var(--color-text-dim); padding: 1rem 0; }

/* noinspection CssUnusedSymbol */
.tab-fade-enter-active, .tab-fade-leave-active { transition: opacity 0.15s ease; }
/* noinspection CssUnusedSymbol */
.tab-fade-enter-from, .tab-fade-leave-to { opacity: 0; }

@media (max-width: 1100px) {
  .admin-main-grid { grid-template-columns: 1fr; }
}

@media (max-width: 767px) {
  .admin-body { flex-direction: column; }
  .admin-main-grid { padding: 0.75rem; }
  .admin-main { padding: 0.85rem; }
}
</style>
