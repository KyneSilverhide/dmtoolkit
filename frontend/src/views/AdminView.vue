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
import MerchantManager from '../components/admin/MerchantManager.vue'
import SearchTool from '../components/admin/SearchTool.vue'
import MapManager from '../components/admin/MapManager.vue'
import GoldDividerTool from '../components/admin/GoldDividerTool.vue'
import GeneratorTool from '../components/admin/GeneratorTool.vue'
import { applyTheme, getThemePreference, setThemePreference } from '../utils/themePreferences.js'
import AppIcon from '../components/AppIcon.vue'
import DemoBanner from '../components/DemoBanner.vue'
import {
  PLAYER_JOINED, PLAYER_LEFT, PLAYERS_SNAPSHOT, HP_UPDATED,
  CONDITIONS_UPDATED, CONCENTRATION_UPDATED, INITIATIVE_UPDATED,
  ADMIN_STATE, TV_MODE_CHANGED, VOTE_STARTED, VOTE_CLOSED,
  MAP_STATE, MERCHANT_ITEMS_UPDATED, DOOM_CLOCK_STARTED, DOOM_CLOCK_STOPPED,
  TENSION_SCALE_UPDATED, TENSION_SCALE_ENDED, PLAYER_ROLL_RESULT, DEMO_RESET,
  ADMIN_JOIN, SET_TV_MODE,
} from '../socket-events.js'

const router = useRouter()
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
// __APP_VERSION__ is injected at build time by Vite from frontend/package.json
const appVersion = __APP_VERSION__
const activeTab = ref('players')
const isSessionPanelCollapsed = ref(false)
const tvMode = ref('lobby')
const theme = ref(getThemePreference('admin', 'dark'))
const isLightTheme = computed(() => theme.value === 'light')

const hasActiveVote = ref(false)
const hasActiveImage = ref(false)
const hasActiveMerchant = ref(false)
const hasActiveDoom = ref(false)
const hasActiveTension = ref(false)
const hasActiveMap = ref(false)

const playerRollToasts = ref([])
let playerRollToastId = 0

// Keeps the socket instance used in onMounted so onUnmounted can clean up
// safely even after resetSocket() was called (e.g. on logout before unmount).
let _socket = null

function pushPlayerRollToast(payload) {
  const id = ++playerRollToastId
  playerRollToasts.value = [...playerRollToasts.value, { id, ...payload }]
  setTimeout(() => {
    playerRollToasts.value = playerRollToasts.value.filter(t => t.id !== id)
  }, 6000)
}

function dismissPlayerRollToast(id) {
  playerRollToasts.value = playerRollToasts.value.filter(t => t.id !== id)
}


const tabs = [
  { key: 'players',   label: 'Joueurs',       icon: 'game-icons:wizard-staff' },
  { key: 'message',   label: 'Message',        icon: 'lucide:mail' },
  { key: 'dice',      label: 'Critical Fail',  icon: 'game-icons:dice-six-faces-five' },
  { key: 'journal',   label: 'Journal',        icon: 'game-icons:scroll-unfurled' },
  { key: 'tension',   label: 'Rythme',         icon: 'lucide:timer' },
  { key: 'vote',      label: 'Vote',           icon: 'lucide:check-square' },
  { key: 'images',    label: 'Images',         icon: 'lucide:image' },
  { key: 'map',       label: 'Carte',          icon: 'lucide:map' },
  { key: 'merchants', label: 'Marchands',      icon: 'game-icons:shop' },
  { key: 'tresor',    label: 'Trésor',         icon: 'game-icons:coins' },
  { key: 'search',    label: 'Recherche',      icon: 'lucide:search' },
  { key: 'generator', label: 'Générateur',     icon: 'lucide:wand-2' },
]

const tvModes = computed(() => ([
  { key: 'lobby', label: 'Lobby', hint: 'Code et QR de session', ready: true },
  { key: 'combat', label: 'Combat', hint: 'Liste des joueurs / HP / AC', ready: true },
  { key: 'vote', label: 'Vote', hint: 'Affiche le vote actif', ready: hasActiveVote.value },
  { key: 'image', label: 'Image', hint: 'Affiche l image active', ready: hasActiveImage.value },
  { key: 'map', label: 'Carte', hint: 'Depuis l onglet Carte', ready: hasActiveMap.value },
  { key: 'merchant', label: 'Marchand', hint: 'Affiche le marchand actif', ready: hasActiveMerchant.value },
  { key: 'doom', label: 'Doom Clock', hint: 'Depuis l onglet Rythme', ready: hasActiveDoom.value },
  { key: 'tension', label: 'Echelle tension', hint: 'Depuis l onglet Rythme', ready: hasActiveTension.value },
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
  hasActiveMap.value = !!(data.mapState?.mapUrl)
  if (data.isDemo !== undefined && authStore.admin) {
    authStore.admin = { ...authStore.admin, is_demo: data.isDemo }
  }
}

function handleTvModeChanged(payload) {
  if (payload?.mode) tvMode.value = payload.mode
  if (payload?.imageUrl !== undefined) hasActiveImage.value = !!payload.imageUrl
  if (payload?.merchantData !== undefined) hasActiveMerchant.value = !!payload.merchantData
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
    _socket.off(MAP_STATE)
    _socket.off(PLAYER_ROLL_RESULT)
    _socket.off(DEMO_RESET)
    _socket = null
  }
})
</script>

<template>
  <div class="admin-wrapper">
    <DemoBanner v-if="authStore.admin?.is_demo" />
    <header class="admin-header">
      <div class="header-top">
        <h1 class="page-title"><AppIcon icon="game-icons:dice-six-faces-five" size="1em" /> Tableau de Bord <span class="title-accent">MJ</span></h1>
        <div class="header-actions">
          <button class="theme-toggle-btn" @click="toggleTheme" data-testid="theme-toggle">
            <AppIcon :icon="isLightTheme ? 'lucide:moon' : 'lucide:sun'" size="0.9em" />
            {{ isLightTheme ? 'Sombre' : 'Clair' }}
          </button>
          <button class="logout-btn" @click="logout" data-testid="logout-button">Déconnexion</button>
        </div>
      </div>
      <p class="admin-name" v-if="authStore.admin">
        {{ authStore.admin.username }}
        <span class="app-version">v{{ appVersion }}</span>
      </p>

      <section class="session-header-panel">
        <div class="session-header-top">
          <h2 class="session-header-title"><AppIcon icon="lucide:clipboard-list" size="1em" /> Sessions</h2>
          <button class="session-collapse-btn" @click="toggleSessionPanel">
            {{ isSessionPanelCollapsed ? 'Afficher' : 'Réduire' }}
          </button>
        </div>

        <p v-if="isSessionPanelCollapsed && sessionStore.activeSession" class="session-header-active">
          Session active: {{ activeSessionLabel }}
        </p>

        <div v-show="!isSessionPanelCollapsed" class="session-header-content">
          <SessionManager />
        </div>
      </section>

      <nav v-if="sessionStore.activeSession" class="admin-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="nav-btn"
          :class="{ active: activeTab === tab.key }"
          :data-testid="`tab-${tab.key}`"
          @click="activeTab = tab.key"
        >
          <AppIcon :icon="tab.icon" size="1em" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </header>

    <main class="admin-main-grid">
      <section class="admin-main">
        <template v-if="sessionStore.activeSession">
        <div v-show="activeTab === 'players'">
          <PlayerList />
        </div>
        <div v-show="activeTab === 'message'">
          <MessageTool />
        </div>
        <div v-show="activeTab === 'dice'">
          <CriticalFailTool />
        </div>
        <div v-show="activeTab === 'journal'">
          <SessionJournal />
        </div>
        <div v-show="activeTab === 'tension'">
          <TvControls />
        </div>
        <div v-show="activeTab === 'vote'">
          <VoteManager />
        </div>
        <div v-show="activeTab === 'images'">
          <ImageManager />
        </div>
        <div v-show="activeTab === 'map'">
          <MapManager />
        </div>
        <div v-show="activeTab === 'merchants'">
          <MerchantManager />
        </div>
        <div v-show="activeTab === 'tresor'">
          <GoldDividerTool />
        </div>
        <div v-show="activeTab === 'search'">
          <SearchTool />
        </div>
        <div v-show="activeTab === 'generator'">
          <GeneratorTool />
        </div>
        </template>
        <p v-else class="no-session-msg">Sélectionnez ou créez une session pour accéder aux outils.</p>
      </section>

      <aside class="tv-sidebar">
        <h2 class="tv-sidebar-title"><AppIcon icon="lucide:monitor" size="1em" /> Diffusion TV</h2>
        <p class="tv-sidebar-subtitle">
          Mode actuel: <span class="tv-mode-current">{{ activeTvModeLabel }}</span>
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
            <div class="tv-mode-top">
              <span class="tv-mode-label">{{ mode.label }}</span>
              <span class="tv-ready-badge" :class="mode.ready ? 'ready' : 'not-ready'">
                {{ mode.ready ? 'prêt' : 'non prêt' }}
              </span>
            </div>
            <span class="tv-mode-hint">{{ mode.hint }}</span>
          </button>
        </div>
        <p v-else class="no-session-msg">Sélectionnez une session pour piloter l'écran TV.</p>
      </aside>
    </main>

    <!-- ── Player roll toasts ──────────────────────────────────────────────── -->
    <TransitionGroup name="roll-toast" tag="div" class="player-roll-toasts">
      <div
        v-for="toast in playerRollToasts"
        :key="toast.id"
        class="player-roll-toast"
        :class="{ hidden: toast.hidden }"
        data-testid="player-roll-toast"
        @click="dismissPlayerRollToast(toast.id)"
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
          <span v-if="toast.hidden" class="prt-result hidden-result"><AppIcon icon="lucide:eye-off" size="0.85em" /> Jet caché — {{ toast.total }}</span>
          <span v-else class="prt-result">= {{ toast.total }}</span>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.admin-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 1600px;
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
}

.admin-header {
  padding: 1.5rem 1.5rem 0;
  background: linear-gradient(180deg, var(--admin-header-bg) 0%, transparent 100%);
  border-bottom: 1px solid var(--color-border);
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-toggle-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-transform: uppercase;
}

.theme-toggle-btn:hover {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.page-title {
  font-size: 1.4rem;
  color: var(--color-parchment);
}

.title-accent { color: var(--color-gold-bright); }

.admin-name {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  color: var(--color-text-dim);
  text-transform: uppercase;
  margin-bottom: 1rem;
}

.app-version {
  margin-left: 0.5rem;
  opacity: 0.5;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
}

.logout-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.2s;
}

.logout-btn:hover {
  border-color: var(--admin-danger-border);
  color: var(--admin-danger-text);
}

.admin-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.nav-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 0.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover { color: var(--color-parchment); }

.nav-btn.active {
  color: var(--color-gold-bright);
  border-bottom-color: var(--color-gold-bright);
}

.admin-main {
  min-width: 0;
}

.admin-main-grid {
  flex: 1;
  padding: 1.5rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 1rem;
  align-items: start;
}

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
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

.tv-sidebar-subtitle {
  margin: 0;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tv-mode-current {
  color: var(--color-gold-bright);
}

.tv-mode-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tv-mode-btn {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg);
  color: var(--color-text);
  cursor: pointer;
}

.tv-mode-btn:hover {
  border-color: var(--color-gold-dark);
}

.tv-mode-btn.active {
  border-color: var(--color-gold-bright);
  background: var(--admin-gold-bg);
}

.tv-mode-label {
  font-family: var(--font-heading);
  font-size: 0.72rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tv-mode-hint {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--color-text-dim);
}

.session-header-panel {
  margin: 0.5rem 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
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
  font-family: var(--font-heading);
  font-size: 0.74rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.session-collapse-btn {
  border: 1px solid var(--color-border);
  background: var(--admin-control-bg);
  color: var(--color-text-dim);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.session-collapse-btn:hover {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.session-header-active {
  margin: 0.45rem 0 0;
  color: var(--color-gold);
  font-family: var(--font-body);
  font-size: 0.9rem;
}

.session-header-content {
  margin-top: 0.75rem;
}

@media (max-width: 1220px) {
  .admin-main-grid {
    grid-template-columns: 1fr;
  }

  .tv-sidebar {
    position: static;
    order: -1;
  }
}

@media (max-width: 860px) {
  .header-top {
    flex-wrap: wrap;
    gap: 0.75rem;
  }
}

.admin-main {
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--admin-panel-bg);
}

.app-footer {
  padding: 1.5rem;
  text-align: center;
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-border);
}

.no-session-msg {
  font-family: var(--font-body);
  color: var(--color-text-dim);
  font-size: 0.9rem;
  padding: 1rem 0;
}

.tv-mode-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tv-ready-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 0.12rem 0.45rem;
  border: 1px solid transparent;
}

.tv-ready-badge.ready {
  color: var(--admin-success-text);
  background: var(--admin-success-bg);
  border-color: var(--admin-success-border);
}

.tv-ready-badge.not-ready {
  color: var(--color-text-dim);
  background: var(--admin-control-bg-muted);
  border-color: var(--color-border);
}

.tv-mode-btn.disabled,
.tv-mode-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ── Player roll toasts ─────────────────────────────────────────────── */
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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  min-width: 200px;
  max-width: 300px;
}

.player-roll-toast.hidden {
  border-color: var(--admin-info-border);
}

.roll-toast-enter-active, .roll-toast-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.roll-toast-enter-from, .roll-toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.prt-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}

.prt-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.prt-name {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.prt-label {
  font-family: var(--font-heading);
  font-size: 0.72rem;
  color: var(--color-text-dim);
}

.prt-type {
  font-style: italic;
}

.prt-result {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  color: var(--color-gold-bright);
}

.prt-result.hidden-result {
  color: var(--admin-info-text);
  font-size: 0.85rem;
}
</style>
