<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '../stores/auth.js'
import { sessionStore } from '../stores/session.js'
import { getSocket, resetSocket } from '../socket.js'
import SessionManager from '../components/admin/SessionManager.vue'
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
import { applyTheme, getThemePreference, setThemePreference } from '../utils/themePreferences.js'
import AppIcon from '../components/AppIcon.vue'
import DemoBanner from '../components/DemoBanner.vue'
import ReleaseNotesBell from '../components/ReleaseNotesBell.vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import {
  PLAYER_JOINED, PLAYER_LEFT, PLAYERS_SNAPSHOT, HP_UPDATED,
  CONDITIONS_UPDATED, CONCENTRATION_UPDATED, INITIATIVE_UPDATED,
  ADMIN_STATE, TV_MODE_CHANGED, VOTE_STARTED, VOTE_CLOSED,
  MAP_STATE, MERCHANT_ITEMS_UPDATED, DOOM_CLOCK_STARTED, DOOM_CLOCK_STOPPED,
  TENSION_SCALE_UPDATED, TENSION_SCALE_ENDED, TIME_SCALE_UPDATED, TIME_SCALE_ENDED,
  PLAYER_ROLL_RESULT, DEMO_RESET,
  ADMIN_JOIN, SET_TV_MODE, FACTIONS_UPDATED,
} from '../socket-events.js'

const router = useRouter()
import { BACKEND_URL } from '@/config.js'
// __APP_VERSION__ is injected at build time by Vite from frontend/package.json
const appVersion = __APP_VERSION__
const activeTab = ref('players')
const generatorEnabled = ref(true) // optimistic default — updated by loadConfig()

// Tooltip fixe pour l'onglet Générateur grisé (échappe à overflow:hidden de la sidebar)
const lockedTooltipVisible = ref(false)
const lockedTooltipPos = ref({ top: 0, left: 0 })

function showLockedTooltip(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  lockedTooltipPos.value = {
    top: rect.top + rect.height / 2,
    left: rect.right + 10,
  }
  lockedTooltipVisible.value = true
}

function hideLockedTooltip() {
  lockedTooltipVisible.value = false
}
const isSessionPanelCollapsed = ref(false)
const tvMode = ref('lobby')
const theme = ref(getThemePreference('admin', 'dark'))
const isLightTheme = computed(() => theme.value === 'light')

// Mapping clÃ© d'onglet â†’ composant (pour <KeepAlive> + <Transition>)
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
const activePuzzle = ref(null) // { puzzleImageId, puzzleSeed, puzzleClicks }
const hasActiveReputation = ref(false)

// Badge d'activitÃ© par onglet (point de couleur dans la nav)
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

const playerRollToasts = ref([])
let playerRollToastId = 0
const toastTimers = new Map() // id -> timerId

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


const tabs = [
  { key: 'players',   label: 'Joueurs',       icon: 'game-icons:wizard-staff' },
  { key: 'message',   label: 'Messages',       icon: 'lucide:mail' },
  { key: 'dice',      label: 'Critical Fail',  icon: 'game-icons:dice-six-faces-five' },
  { key: 'journal',   label: 'Journal',        icon: 'game-icons:scroll-unfurled' },
  { key: 'tension',   label: 'Rythme',         icon: 'lucide:timer' },
  { key: 'vote',      label: 'Vote',           icon: 'lucide:check-square' },
  { key: 'images',    label: 'Images',         icon: 'lucide:image' },
  { key: 'audio',     label: 'Audio',          icon: 'lucide:music-2' },
  { key: 'map',       label: 'Carte',          icon: 'lucide:map' },
  { key: 'merchants',   label: 'Marchands',     icon: 'game-icons:shop' },
  { key: 'puzzle',      label: 'Puzzles',       icon: 'lucide:puzzle' },
  { key: 'reputation',  label: 'Réputations',   icon: 'lucide:shield' },
  { key: 'tresor',      label: 'Trésor',        icon: 'game-icons:coins' },
  { key: 'search',    label: 'Recherche',      icon: 'lucide:search' },
  { key: 'generator', label: 'Générateur',     icon: 'lucide:wand-2' },
]

// Groupes de navigation pour la sidebar
const navGroups = [
  {
    label: 'En jeu',
    items: ['players', 'message', 'dice', 'journal'],
  },
  {
    label: 'Scène',
    items: ['tension', 'vote', 'images', 'audio', 'map', 'merchants', 'puzzle', 'reputation'],
  },
  {
    label: 'Outils',
    items: ['tresor', 'search', 'generator'],
  },
]

// Sidebar rÃ©duite (icon-only) ou complÃ¨te
const isNavCollapsed = ref(false)

const tvModes = computed(() => ([
  { key: 'lobby', label: 'Lobby', hint: 'Code et QR de session', ready: true },
  { key: 'combat', label: 'Combat', hint: 'Liste des joueurs / HP / AC', ready: true },
  { key: 'vote', label: 'Vote', hint: 'Affiche le vote actif', ready: hasActiveVote.value },
  { key: 'image', label: 'Image', hint: 'Affiche l image active', ready: hasActiveImage.value },
  { key: 'map', label: 'Carte', hint: 'Depuis l onglet Carte', ready: hasActiveMap.value },
  { key: 'merchant', label: 'Marchand', hint: 'Affiche le marchand actif', ready: hasActiveMerchant.value },
  { key: 'doom', label: 'Doom Clock', hint: 'Depuis l onglet Rythme', ready: hasActiveDoom.value },
  { key: 'tension', label: 'Echelle tension', hint: 'Depuis l onglet Rythme', ready: hasActiveTension.value },
  { key: 'timescale', label: 'Echelle de temps', hint: 'Depuis l onglet Rythme', ready: hasActiveTimeScale.value },
  { key: 'reputation', label: 'Réputations', hint: 'Depuis l onglet Réputations', ready: hasActiveReputation.value },
]))

const activeTvModeLabel = computed(() => {
  const mode = tvModes.value.find(item => item.key === tvMode.value)
  return mode?.label || tvMode.value
})

const activeSessionLabel = computed(() => {
  if (!sessionStore.activeSession) return ''
  return `${sessionStore.activeSession.name} - ${sessionStore.activeSession.code}`
})

function toggleSessionPanel() {
  isSessionPanelCollapsed.value = !isSessionPanelCollapsed.value
}

function modeReady(modeKey) {
  const mode = tvModes.value.find(item => item.key === modeKey)
  return !!mode?.ready
}

function setTvMode(mode) {
  if (!sessionStore.activeSession?.id) return
  if (!modeReady(mode)) return

  const socket = getSocket(authStore.token)
  socket.emit(SET_TV_MODE, {
    sessionId: sessionStore.activeSession.id,
    mode,
  })
}

function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  tvMode.value = data.tvMode || 'lobby'

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

onMounted(() => {
  loadSessions()
  loadConfig()
  releaseNotesStore.load()
  _socket = getSocket(authStore.token)

  // Re-join admin room after socket reconnects so we don't miss events
  _socket.on('connect', () => {
    if (sessionStore.activeSession?.id) {
      _socket.emit(ADMIN_JOIN, sessionStore.activeSession.id)
    }
  })

  _socket.on(PLAYER_JOINED, (player) => {
    sessionStore.addPlayer(player)
  })

  _socket.on(PLAYER_LEFT, (data) => {
    sessionStore.removePlayer(data.playerId)
  })

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

  _socket.on(MAP_STATE, (data) => {
    hasActiveMap.value = !!(data?.mapUrl)
  })

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
      if (payload && typeof payload === 'object') {
        pushPlayerRollToast(payload)
      }
    } catch (err) {
      console.error('player-roll-result handler error:', err)
    }
  })

  _socket.on(DEMO_RESET, () => {
    window.location.reload()
  })

  _socket.on(FACTIONS_UPDATED, (factions) => {
    hasActiveReputation.value = Array.isArray(factions) && factions.length > 0
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
    _socket = null
  }
})
</script>

<template>
  <div class="admin-wrapper">
    <DemoBanner v-if="authStore.admin?.is_demo" />

    <!-- â”€â”€ Topbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
    <header class="admin-header">
      <div class="header-top">
        <h1 class="page-title">
          <AppIcon icon="game-icons:dice-six-faces-five" size="1em" />
          Tableau de Bord <span class="title-accent">MJ</span>
        </h1>
        <div class="header-actions">
          <p class="admin-name" v-if="authStore.admin">
            {{ authStore.admin.username }}
            <span class="app-version">v{{ appVersion }}</span>
          </p>
          <ReleaseNotesBell role="admin" />
          <button class="theme-toggle-btn" @click="toggleTheme" data-testid="theme-toggle">
            <AppIcon :icon="isLightTheme ? 'lucide:moon' : 'lucide:sun'" size="0.9em" />
            {{ isLightTheme ? 'Sombre' : 'Clair' }}
          </button>
          <button class="logout-btn" @click="logout" data-testid="logout-button">
            <AppIcon icon="lucide:log-out" size="0.9em" /> Déconnexion
          </button>
        </div>
      </div>

      <section class="session-header-panel">
        <div class="session-header-top">
          <h2 class="session-header-title"><AppIcon icon="lucide:clipboard-list" size="1em" /> Sessions</h2>
          <button class="session-collapse-btn" @click="toggleSessionPanel">
            <AppIcon :icon="isSessionPanelCollapsed ? 'lucide:chevron-down' : 'lucide:chevron-up'" size="0.9em" />
            {{ isSessionPanelCollapsed ? 'Afficher' : 'Réduire' }}
          </button>
        </div>
        <p v-if="isSessionPanelCollapsed && sessionStore.activeSession" class="session-header-active">
          Session active : {{ activeSessionLabel }}
        </p>
        <div v-show="!isSessionPanelCollapsed" class="session-header-content">
          <SessionManager />
        </div>
      </section>
    </header>

    <!-- â”€â”€ Corps : sidebar + contenu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
    <div class="admin-body">

      <!-- Sidebar de navigation (desktop) -->
      <nav
        v-if="sessionStore.activeSession"
        class="admin-sidebar"
        :class="{ collapsed: isNavCollapsed }"
        role="navigation"
        aria-label="Navigation admin"
      >
        <div class="sidebar-groups">
          <div
            v-for="group in navGroups"
            :key="group.label"
            class="sidebar-group"
          >
            <span class="sidebar-group-label">{{ group.label }}</span>
            <button
              v-for="key in group.items"
              :key="key"
              class="sidebar-item"
              :class="{
                active: activeTab === key,
                'tab-locked': key === 'generator' && !generatorEnabled,
              }"
              :data-testid="`tab-${key}`"
              @click="(key === 'generator' && !generatorEnabled) ? null : (activeTab = key)"
              @mouseenter="(key === 'generator' && !generatorEnabled) ? showLockedTooltip($event) : null"
              @mouseleave="hideLockedTooltip"
            >
              <span class="sidebar-item-icon">
                <AppIcon :icon="tabs.find(t => t.key === key)?.icon" size="1.3rem" />
                <span v-if="tabActivity[key] && activeTab !== key" class="sidebar-dot" />
              </span>
              <span class="sidebar-item-label">
                {{ tabs.find(t => t.key === key)?.label }}
              </span>
            </button>
          </div>
        </div>

        <!-- Bouton de rÃ©duction sidebar -->
        <button
          class="sidebar-collapse-btn"
          @click="isNavCollapsed = !isNavCollapsed"
          :title="isNavCollapsed ? 'Agrandir la navigation' : 'Réduire la navigation'"
        >
          <AppIcon :icon="isNavCollapsed ? 'lucide:chevrons-right' : 'lucide:chevrons-left'" size="1rem" />
          <span class="sidebar-item-label">Réduire</span>
        </button>
      </nav>

      <!-- Contenu principal + sidebar TV -->
      <div class="admin-content-area">
        <!-- Tab bar mobile (< 768px) -->
        <nav
          v-if="sessionStore.activeSession"
          class="admin-nav-mobile"
          role="tablist"
        >
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="mobile-nav-btn"
            :class="{
              active: activeTab === tab.key,
              'tab-locked': tab.key === 'generator' && !generatorEnabled,
            }"
            :title="tab.label"
            @click="(tab.key === 'generator' && !generatorEnabled) ? null : (activeTab = tab.key)"
            @mouseenter="(tab.key === 'generator' && !generatorEnabled) ? showLockedTooltip($event) : null"
            @mouseleave="hideLockedTooltip"
          >
            <span class="mobile-nav-icon-wrap">
              <AppIcon :icon="tab.icon" size="1.3rem" />
              <span v-if="tabActivity[tab.key] && activeTab !== tab.key" class="nav-activity-dot" />
            </span>
            <span class="mobile-nav-label">{{ tab.label }}</span>
          </button>
        </nav>

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

          <aside class="tv-sidebar">
            <h2 class="tv-sidebar-title"><AppIcon icon="lucide:monitor" size="1em" /> Diffusion TV</h2>
            <p class="tv-sidebar-subtitle">
              Mode actuel : <span class="tv-mode-current">{{ activeTvModeLabel }}</span>
            </p>
            <div v-if="sessionStore.activeSession" class="tv-mode-list">
              <button
                v-for="mode in tvModes"
                :key="mode.key"
                class="tv-mode-btn"
                :class="{ active: tvMode === mode.key, disabled: !mode.ready }"
                :disabled="!mode.ready"
                :data-testid="`tv-mode-btn-${mode.key}`"
                @click="setTvMode(mode.key)"
              >
                <span class="tv-mode-top">
                  <span class="tv-mode-label">{{ mode.label }}</span>
                  <span class="tv-ready-badge" :class="mode.ready ? 'ready' : 'not-ready'">
                    {{ mode.ready ? 'prêt' : 'non prêt' }}
                  </span>
                </span>
                <span class="tv-mode-hint">{{ mode.hint }}</span>
              </button>
            </div>
            <p v-else class="no-session-msg">Sélectionnez une session pour piloter l'écran TV.</p>
          </aside>
        </div>
      </div>
    </div>

    <!-- â”€â”€ Player roll toasts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
    <TransitionGroup name="roll-toast" tag="div" class="player-roll-toasts">
      <div
        v-for="toast in playerRollToasts"
        :key="toast.id"
        class="player-roll-toast"
        :class="{ hidden: toast.hidden }"
        data-testid="player-roll-toast"
        @click="dismissPlayerRollToast(toast.id)"
        @mouseenter="pauseToast(toast.id)"
        @mouseleave="resumeToast(toast.id)"
      >
        <span class="prt-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="1.5rem" /></span>
        <div class="prt-body">
          <span class="prt-name">{{ toast.playerName }}</span>
          <span class="prt-label">
            {{ toast.diceCount }}d{{ toast.diceType }}
            <template v-if="toast.modifier !== 0">{{ toast.modifier > 0 ? '+' : '' }}{{ toast.modifier }}</template>
            <span v-if="toast.rollType !== 'normal'" class="prt-type">
              {{ toast.rollType === 'advantage' ? ' (avantage)' : ' (désavantage)' }}
            </span>
          </span>
          <span v-if="toast.hidden" class="prt-result hidden-result">
            <AppIcon icon="lucide:eye-off" size="0.85em" /> Jet caché — {{ toast.total }}
          </span>
          <span v-else class="prt-result">= {{ toast.total }}</span>
        </div>
      </div>
    </TransitionGroup>

    <!-- ── Tooltip fixe pour l'onglet Générateur grisé ──────────────────── -->
    <Teleport to="body">
      <Transition name="locked-tooltip">
        <div
          v-if="lockedTooltipVisible"
          class="generator-locked-tooltip"
          :style="{ top: lockedTooltipPos.top + 'px', left: lockedTooltipPos.left + 'px' }"
        >
          <span class="glt-icon"><AppIcon icon="lucide:key" size="0.9em" /></span>
          <div class="glt-body">
            <span class="glt-title">Générateur IA non activé</span>
            <span class="glt-text">Configurez <code>GITHUB_TOKEN</code> dans le <code>.env</code> backend</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* â”€â”€ Variables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.admin-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin: 0 auto;
  width: 100%;
  color: var(--color-text);
  --admin-panel-bg: var(--gradient-panel);
  --admin-panel-highlight-bg: var(--gradient-panel-soft);
  --admin-header-bg: var(--surface-highlight);
  --admin-control-bg: var(--surface-raised);
  --admin-control-bg-muted: var(--surface-ghost);
  --admin-gold-bg: var(--surface-gold-soft);
  --admin-gold-bg-strong: var(--surface-gold-soft-strong);
  --admin-success-bg: var(--color-success-soft);
  --admin-success-border: var(--color-success-border);
  --admin-success-text: var(--color-success);
  --admin-warning-bg: var(--color-warning-soft);
  --admin-warning-border: var(--color-warning-border);
  --admin-warning-text: var(--color-warning);
  --admin-info-bg: var(--color-info-soft);
  --admin-info-border: var(--color-info-border);
  --admin-info-text: var(--color-info-bright);
  --admin-danger-bg: var(--color-danger-soft);
  --admin-danger-border: var(--color-danger-border);
  --admin-danger-text: var(--color-danger);
  --sidebar-width: 210px;
  --sidebar-collapsed-width: 56px;
}

/* â”€â”€ Topbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.admin-header {
  padding: 0.85rem 1.25rem 0;
  background: linear-gradient(180deg, var(--admin-header-bg) 0%, transparent 100%);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-title { font-size: 1.2rem; color: var(--color-parchment); font-weight: 600; }
.title-accent { color: var(--color-gold-bright); }

.admin-name {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin: 0;
}
.app-version {
  margin-left: 0.4rem;
  opacity: 0.45;
  font-size: 0.65rem;
}

.theme-toggle-btn,
.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: var(--color-text-dim);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.theme-toggle-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.logout-btn:hover { border-color: var(--admin-danger-border); color: var(--admin-danger-text); }

/* â”€â”€ Session panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.session-header-panel {
  margin: 0 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.65rem 0.85rem;
  background: var(--admin-panel-highlight-bg);
}
.session-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.session-header-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.session-collapse-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg);
  color: var(--color-text-dim);
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.18s;
}
.session-collapse-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.session-header-active {
  margin: 0.4rem 0 0;
  color: var(--color-gold);
  font-size: 0.88rem;
}
.session-header-content { margin-top: 0.65rem; }

/* â”€â”€ Corps : sidebar + zone contenu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.admin-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* â”€â”€ Sidebar de navigation (desktop â‰¥ 768px) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.admin-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--admin-panel-highlight-bg);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  scrollbar-width: none;
}
.admin-sidebar::-webkit-scrollbar { display: none; }
.admin-sidebar.collapsed { width: var(--sidebar-collapsed-width); }

.sidebar-groups {
  flex: 1;
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.5rem;
}
.sidebar-group:last-child { margin-bottom: 0; }

.sidebar-group-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  padding: 0.25rem 0.6rem 0.1rem;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  /* MasquÃ©e quand sidebar rÃ©duite */
  transition: opacity 0.15s;
}
.admin-sidebar.collapsed .sidebar-group-label { opacity: 0; }

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.6rem 0.65rem;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
}
.sidebar-item:hover { background: var(--surface-raised); color: var(--color-parchment); }
.sidebar-item.active {
  background: var(--admin-gold-bg);
  color: var(--color-gold-bright);
  font-weight: 600;
}
.sidebar-item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 20%; bottom: 20%;
  width: 3px;
  background: var(--color-gold-bright);
  border-radius: 0 3px 3px 0;
}

.sidebar-item-icon {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
}
.sidebar-dot {
  position: absolute;
  top: -1px; right: -2px;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--color-gold-bright);
  border: 1.5px solid var(--color-bg);
  animation: dotPulse 1.4s ease-in-out infinite;
}
.sidebar-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.15s, max-width 0.22s;
  max-width: 200px;
}
.admin-sidebar.collapsed .sidebar-item-label { opacity: 0; max-width: 0; }

/* Bouton de collapse en bas de sidebar */
.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.65rem;
  border: none;
  border-top: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-dim);
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar-collapse-btn:hover { background: var(--surface-raised); color: var(--color-parchment); }
.admin-sidebar.collapsed .sidebar-collapse-btn .sidebar-item-label { opacity: 0; max-width: 0; }

/* â”€â”€ Contenu + grid TV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.admin-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
}

/* Tab bar mobile â€” masquÃ©e sur desktop */
.admin-nav-mobile { display: none; }

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
  background: var(--admin-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.25rem;
}

/* â”€â”€ Responsive : tablette â‰¤ 1100px â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
@media (max-width: 1100px) {
  .admin-main-grid { grid-template-columns: 1fr; }
  .tv-sidebar { order: -1; position: static; }
}

/* â”€â”€ Responsive : mobile < 768px â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
@media (max-width: 767px) {
  .admin-body { flex-direction: column; }

  /* Cacher la sidebar et afficher la tab bar mobile */
  .admin-sidebar { display: none; }
  .admin-nav-mobile {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--color-border);
    background: var(--admin-panel-highlight-bg);
    padding: 0.35rem 0.5rem;
    gap: 0.2rem;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .admin-nav-mobile::-webkit-scrollbar { display: none; }
  .mobile-nav-btn {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem;
    min-height: 52px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--color-text-dim);
    font-size: 0.55rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    position: relative;
  }
  .mobile-nav-btn:hover { color: var(--color-parchment); background: var(--surface-raised); }
  .mobile-nav-btn.active { color: var(--color-gold-bright); background: var(--admin-gold-bg); }
  .mobile-nav-icon-wrap { position: relative; }
  .mobile-nav-label { white-space: nowrap; }
  .nav-activity-dot {
    position: absolute;
    top: -2px; right: -3px;
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--color-gold-bright);
    border: 1.5px solid var(--color-bg);
    animation: dotPulse 1.4s ease-in-out infinite;
  }
  .admin-main-grid { padding: 0.75rem; }
  .admin-main { padding: 0.85rem; }
  .header-top { flex-wrap: wrap; gap: 0.5rem; }
  .admin-name { display: none; }
}

/* â”€â”€ TV Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.tv-sidebar {
  position: sticky;
  top: 1rem;
  background: var(--admin-panel-highlight-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.tv-sidebar-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}
.tv-sidebar-subtitle {
  margin: 0;
  color: var(--color-text-dim);
  font-size: 0.72rem;
}
.tv-mode-current { color: var(--color-gold-bright); font-weight: 600; }
.tv-mode-list { display: flex; flex-direction: column; gap: 0.35rem; }
.tv-mode-btn {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.18s;
}
.tv-mode-btn:hover { border-color: var(--color-gold-dark); }
.tv-mode-btn.active { border-color: var(--color-gold-bright); background: var(--admin-gold-bg); }
.tv-mode-label { font-size: 0.75rem; font-weight: 600; }
.tv-mode-hint { font-size: 0.72rem; color: var(--color-text-dim); }
.tv-mode-top { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
.tv-ready-badge {
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  border: 1px solid transparent;
}
.tv-ready-badge.ready { color: var(--admin-success-text); background: var(--admin-success-bg); border-color: var(--admin-success-border); }
.tv-ready-badge.not-ready { color: var(--color-text-dim); background: var(--admin-control-bg-muted); border-color: var(--color-border); }
.tv-mode-btn.disabled, .tv-mode-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* â”€â”€ Ã‰tats vides â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.no-session-msg { font-size: 0.88rem; color: var(--color-text-dim); padding: 1rem 0; }

/* ── Tab locked (ex: générateur sans GITHUB_TOKEN) ──────────────────────── */
.sidebar-item.tab-locked {
  opacity: 0.42;
  cursor: not-allowed;
}
.sidebar-item.tab-locked:hover {
  background: none !important;
  color: var(--color-text-dim) !important;
  transform: none !important;
}

/* Mobile nav locked */
.mobile-nav-btn.tab-locked {
  opacity: 0.42;
  cursor: not-allowed;
}
.mobile-nav-btn.tab-locked:hover {
  background: none !important;
  color: var(--color-text-dim) !important;
  transform: none !important;
}

/* Tooltip fixe rendu via Teleport (échappe à overflow:hidden de la sidebar) */
.generator-locked-tooltip {
  position: fixed;
  z-index: 9999;
  transform: translateY(-50%);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-medium);
  pointer-events: none;
  max-width: 240px;
}
.glt-icon {
  color: var(--color-warning);
  flex-shrink: 0;
  margin-top: 0.05rem;
}
.glt-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.glt-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-warning);
  white-space: nowrap;
}
.glt-text {
  font-family: var(--font-body), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  line-height: 1.4;
}
.glt-text code {
  font-family: monospace;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 0.3rem;
  font-size: 0.65rem;
  color: var(--color-gold-bright);
}
/* noinspection CssUnusedSymbol */
.locked-tooltip-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
/* noinspection CssUnusedSymbol */
.locked-tooltip-leave-active { transition: opacity 0.1s ease; }
/* noinspection CssUnusedSymbol */
.locked-tooltip-enter-from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
/* noinspection CssUnusedSymbol */
.locked-tooltip-leave-to { opacity: 0; }

/* â”€â”€ Player roll toasts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
.player-roll-toasts {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 900;
  pointer-events: none;
}
.player-roll-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--color-gold-dark);
  background: var(--admin-panel-highlight-bg);
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  cursor: pointer;
  min-width: 200px;
  max-width: 300px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.player-roll-toast:hover { border-color: var(--color-gold-bright); box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
.player-roll-toast.hidden { border-color: var(--admin-info-border); }
/* noinspection CssUnusedSymbol */
.roll-toast-enter-active, .roll-toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
/* noinspection CssUnusedSymbol */
.roll-toast-enter-from, .roll-toast-leave-to { opacity: 0; transform: translateX(30px); }
.prt-icon { font-size: 1.4rem; flex-shrink: 0; }
.prt-body { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.prt-name { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-gold-dark); }
.prt-label { font-size: 0.72rem; color: var(--color-text-dim); }
.prt-type { font-style: italic; }
.prt-result { font-size: 1.1rem; font-weight: 700; color: var(--color-gold-bright); }
.prt-result.hidden-result { color: var(--admin-info-text); font-size: 0.85rem; }
</style>
