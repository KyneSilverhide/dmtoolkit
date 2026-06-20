<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { getSocket, resetSocket } from '@/socket.js'
import { applyTheme } from '../utils/themePreferences.js'
import AppIcon from '../components/AppIcon.vue'
import TvLobby from '../components/tv/TvLobby.vue'
import TvCombat from '../components/tv/TvCombat.vue'
import TvVote from '../components/tv/TvVote.vue'
import TvDoomClock from '../components/tv/TvDoomClock.vue'
import TvTensionScale from '../components/tv/TvTensionScale.vue'
import TvTimescale from '../components/tv/TvTimescale.vue'
import TvImage from '../components/tv/TvImage.vue'
import TvMap from '../components/tv/TvMap.vue'
import TvMerchant from '../components/tv/TvMerchant.vue'
import TvPuzzle from '../components/tv/TvPuzzle.vue'
import TvReputation from '../components/tv/TvReputation.vue'
import { BACKEND_URL } from '@/config.js'

const DOOM_DANGER_THRESHOLD_SECONDS = 10
const TENSION_COLOR_MEDIUM_RATIO = 0.33
const TENSION_COLOR_HIGH_RATIO = 0.66
const TENSION_SHAKE_MEDIUM_RATIO = 0.4
const TENSION_SHAKE_HARD_RATIO = 0.75
const TIMER_DANGER_THRESHOLD_SECONDS = 10

const route = useRoute()

// ── Core state ──────────────────────────────────────────────────────────────
const session = ref(null)
const players = ref([])
const connectionError = ref('')
const tvMode = ref('lobby')
const qrCodeDataUrl = ref(null)
const sessionCode = ref('')
const currentImageUrl = ref(null)
const currentImageLabel = ref(null)
const lobbyBgUrl = ref(null)
const activeVote = ref(null)
const activeMerchant = ref(null)
const activeDoomClock = ref(null)
const activeTensionScale = ref(null)
const activeTimeScale = ref(null)
const activeTimer = ref(null)
const combatRound = ref(0)
const factions = ref([])
const now = ref(Date.now())
let clockTickInterval = null

// ── HP animations ───────────────────────────────────────────────────────────
const hpAnimations = ref({})
const previousHp = ref({})

// ── Reputation toasts ────────────────────────────────────────────────────────
const reputationToasts = ref([])
let reputationToastId = 0

function toastBarColor(toast) {
  const range = toast.maxValue - toast.minValue
  if (!Number.isFinite(range) || range <= 0) return 'hsl(60, 65%, 50%)'
  const normalized = Math.min(1, Math.max(0, (toast.newValue - toast.minValue) / range))
  return `hsl(${Math.round(normalized * 120)}, 65%, 50%)`
}

function formatFactionValue(v) {
  return v >= 0 ? `+${v}` : `${v}`
}

// ── Puzzle state ─────────────────────────────────────────────────────────────
const puzzleImageId = ref(null)
const puzzleSeed = ref(null)
const puzzleIframeRef = ref(null)
const pendingPuzzleClicks = ref([])

const puzzleServeUrl = computed(() => {
  if (!puzzleImageId.value || !puzzleSeed.value) return ''
  return `${BACKEND_URL}/api/puzzles/serve/${puzzleImageId.value}?seed=${puzzleSeed.value}`
})

function onIframeReady(iframe) {
  puzzleIframeRef.value = iframe
  const clicks = pendingPuzzleClicks.value
  if (!clicks.length) return
  clicks.forEach(path => iframe.contentWindow?.postMessage({ type: 'puzzle-remote-click', path: Array.from(path) }, '*'))
  pendingPuzzleClicks.value = []
}

function preventReloadDuringPuzzle(e) {
  e.preventDefault()
  e.returnValue = ''
}

watch(puzzleImageId, (imageId) => {
  if (imageId) window.addEventListener('beforeunload', preventReloadDuringPuzzle)
  else window.removeEventListener('beforeunload', preventReloadDuringPuzzle)
}, { immediate: true })

// ── Map state ─────────────────────────────────────────────────────────────────
const currentMapUrl = ref(null)
const mapFogEnabled = ref(false)
const mapViewport = ref({ xn: 0, yn: 0, scale: 1 })
const mapFogStrokes = ref([])
const mapTokens = ref({})
const mapGridType = ref('none')
const mapGridCols = ref(20)
const mapGridRows = ref(15)
const mapGridHexOrientation = ref('flat')
const mapGridOffsetX = ref(0)
const mapGridOffsetY = ref(0)
const mapGridCellW = ref(null)
const mapGridCellH = ref(null)
const mapFogCells = ref([])
const mapFogCellsSet = new Set()

function applyMapState(data) {
  if (!data) return
  currentMapUrl.value = data.mapUrl || null
  mapFogEnabled.value = !!data.fogEnabled
  mapViewport.value = {
    xn: data.viewport?.xn ?? data.viewport?.x ?? 0,
    yn: data.viewport?.yn ?? data.viewport?.y ?? 0,
    scale: data.viewport?.scale ?? 1,
  }
  mapFogStrokes.value = Array.isArray(data.fogStrokes) ? data.fogStrokes : []
  mapTokens.value = (data.mapTokens && typeof data.mapTokens === 'object') ? data.mapTokens : {}
  mapGridType.value = data.gridType || 'none'
  mapGridCols.value = data.gridCols || 20
  mapGridRows.value = data.gridRows || 15
  mapGridHexOrientation.value = data.gridHexOrientation || 'flat'
  mapGridOffsetX.value = data.gridOffsetX ?? 0
  mapGridOffsetY.value = data.gridOffsetY ?? 0
  mapGridCellW.value = data.gridCellW ?? null
  mapGridCellH.value = data.gridCellH ?? null
  mapFogCellsSet.clear()
  const cells = Array.isArray(data.fogCells) ? data.fogCells : []
  cells.forEach(c => mapFogCellsSet.add(c))
  mapFogCells.value = cells
}

// ── Computed ──────────────────────────────────────────────────────────────────
const sortedPlayers = computed(() =>
  [...players.value].sort((a, b) => {
    const ai = a.initiative, bi = b.initiative
    if (ai == null) return 1
    if (bi == null) return -1
    return bi - ai
  })
)

const doomRemaining = computed(() => {
  if (!activeDoomClock.value?.endAt) return 0
  return Math.max(0, Math.floor((new Date(activeDoomClock.value.endAt).getTime() - now.value) / 1000))
})

const doomRemainingLabel = computed(() => {
  const s = doomRemaining.value
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

const timerRemaining = computed(() => {
  if (!activeTimer.value?.endAt) return 0
  return Math.max(0, Math.floor((new Date(activeTimer.value.endAt).getTime() - now.value) / 1000))
})

const timerRemainingLabel = computed(() => {
  const s = timerRemaining.value
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

const tensionProgress = computed(() => {
  if (!activeTensionScale.value?.steps) return 0
  const dir = activeTensionScale.value.direction || 'ascending'
  const p = dir === 'descending'
    ? (activeTensionScale.value.steps - activeTensionScale.value.level) / activeTensionScale.value.steps
    : activeTensionScale.value.level / activeTensionScale.value.steps
  return Math.min(1, Math.max(0, p))
})

const tensionColor = computed(() => {
  const p = tensionProgress.value
  if (p < TENSION_COLOR_MEDIUM_RATIO) return 'var(--tv-success-text)'
  if (p < TENSION_COLOR_HIGH_RATIO) return 'var(--tv-warning-text)'
  return 'var(--tv-danger-text)'
})

const tensionShakeClass = computed(() => {
  if (!activeTensionScale.value?.vibrationEnabled) return ''
  if (tensionProgress.value < TENSION_SHAKE_MEDIUM_RATIO) return 'shake-soft'
  if (tensionProgress.value < TENSION_SHAKE_HARD_RATIO) return 'shake-medium'
  return 'shake-hard'
})

// ── Socket ────────────────────────────────────────────────────────────────────
let socket = null

onMounted(() => {
  clockTickInterval = window.setInterval(() => { now.value = Date.now() }, 1000)
  socket = getSocket()

  socket.on('connect', () => {
    socket.emit('tv-join', { sessionCode: route.params.code })
  })

  socket.on('tv-snapshot', (data) => {
    session.value = data.session
    players.value = data.players
    tvMode.value = data.tvMode || 'lobby'
    qrCodeDataUrl.value = data.qrCodeDataUrl || null
    sessionCode.value = data.sessionCode || ''
    currentImageUrl.value = data.currentImageUrl || null
    currentImageLabel.value = data.currentImageLabel || null
    lobbyBgUrl.value = data.lobbyBgUrl || null
    activeVote.value = data.activeVote || null
    activeMerchant.value = data.activeMerchant || null
    activeDoomClock.value = data.doomClock || null
    activeTensionScale.value = data.tensionScale || null
    activeTimeScale.value = data.timeScale || null
    combatRound.value = data.combatRound || 0
    activeTimer.value = data.timer || null
    applyTheme(data.tvTheme || 'dark')
    factions.value = Array.isArray(data.factions) ? data.factions : []
    data.players.forEach(pl => { previousHp.value[pl.id] = pl.current_hp })
    if (data.mapState) applyMapState(data.mapState)
    if (data.activePuzzle) {
      pendingPuzzleClicks.value = Array.isArray(data.activePuzzle.puzzleClicks) ? data.activePuzzle.puzzleClicks.slice() : []
      puzzleImageId.value = data.activePuzzle.puzzleImageId
      puzzleSeed.value = data.activePuzzle.puzzleSeed
    } else {
      puzzleImageId.value = null
      puzzleSeed.value = null
      pendingPuzzleClicks.value = []
    }
  })

  socket.on('tv-mode-changed', ({ mode, imageUrl, imageLabel, merchantData, puzzleImageId: pid, puzzleSeed: ps }) => {
    tvMode.value = mode
    if (imageUrl) currentImageUrl.value = imageUrl
    if (mode === 'image') currentImageLabel.value = imageLabel || null
    if (merchantData) activeMerchant.value = merchantData
    else if (mode === 'lobby') activeMerchant.value = null
    if (mode === 'puzzle' && pid) {
      pendingPuzzleClicks.value = []
      puzzleImageId.value = pid
      puzzleSeed.value = ps
    } else if (mode !== 'puzzle') {
      puzzleImageId.value = null
      puzzleSeed.value = null
      pendingPuzzleClicks.value = []
    }
  })

  socket.on('puzzle-cell-clicked', ({ path }) => {
    puzzleIframeRef.value?.contentWindow?.postMessage({ type: 'puzzle-remote-click', path: Array.from(path) }, '*')
  })

  socket.on('vote-started', (v) => { activeVote.value = { ...v, isClosed: false } })
  socket.on('vote-updated', (v) => { activeVote.value = { ...v, isClosed: false } })
  socket.on('vote-closed', (v) => { activeVote.value = { ...v, isClosed: true } })

  socket.on('player-joined', (player) => {
    const idx = players.value.findIndex(p => String(p.id) === String(player.id))
    if (idx === -1) players.value.push(player)
    else players.value[idx] = { ...players.value[idx], ...player }
    previousHp.value[player.id] = player.current_hp
  })

  socket.on('player-left', ({ playerId }) => {
    players.value = players.value.filter(p => String(p.id) !== String(playerId))
    delete previousHp.value[playerId]
    delete hpAnimations.value[playerId]
  })

  socket.on('hp-updated', ({ playerId, newHp, newMaxHp }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      const oldHp = previousHp.value[players.value[idx].id] ?? players.value[idx].current_hp
      const delta = newHp - oldHp
      const update = { current_hp: newHp }
      if (newMaxHp !== undefined) update.max_hp = newMaxHp
      players.value[idx] = { ...players.value[idx], ...update }
      previousHp.value[players.value[idx].id] = newHp
      const id = players.value[idx].id
      hpAnimations.value = { ...hpAnimations.value, [id]: { type: delta < 0 ? 'damage' : 'heal', delta, key: Date.now() } }
      setTimeout(() => {
        const next = { ...hpAnimations.value }
        delete next[id]
        hpAnimations.value = next
      }, 2000)
    }
  })

  socket.on('conditions-updated', ({ playerId, conditions }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) players.value[idx] = { ...players.value[idx], conditions }
  })

  socket.on('concentration-updated', ({ playerId, isConcentrating }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) players.value[idx] = { ...players.value[idx], is_concentrating: isConcentrating }
  })

  socket.on('initiative-updated', ({ playerId, initiative }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) players.value[idx] = { ...players.value[idx], initiative }
  })

  socket.on('error', ({ message }) => { connectionError.value = message })
  socket.on('merchant-items-updated', (data) => { activeMerchant.value = data })
  socket.on('doom-clock-started', (d) => { activeDoomClock.value = d })
  socket.on('doom-clock-stopped', () => { activeDoomClock.value = null })
  socket.on('tension-scale-updated', (d) => { activeTensionScale.value = d })
  socket.on('tension-scale-ended', () => { activeTensionScale.value = null })
  socket.on('time-scale-updated', (d) => { activeTimeScale.value = d })
  socket.on('time-scale-ended', () => { activeTimeScale.value = null })
  socket.on('round-updated', ({ round }) => { combatRound.value = round })
  socket.on('timer-updated', (t) => { activeTimer.value = t })
  socket.on('timer-stopped', () => { activeTimer.value = null })
  socket.on('lobby-bg-updated', ({ url }) => { lobbyBgUrl.value = url || null })
  socket.on('factions-updated', (data) => { factions.value = Array.isArray(data) ? data : [] })

  socket.on('reputation-toast', ({ factionName, oldValue, newValue, delta, minValue, maxValue }) => {
    if (tvMode.value === 'reputation') return
    const id = ++reputationToastId
    const range = maxValue - minValue || 1
    const oldWidth = Math.round(((oldValue - minValue) / range) * 100)
    const newWidth = Math.round(((newValue - minValue) / range) * 100)
    reputationToasts.value = [...reputationToasts.value, { id, factionName, oldValue, newValue, delta, minValue, maxValue, barWidth: oldWidth }]
    nextTick(() => {
      const idx = reputationToasts.value.findIndex(t => t.id === id)
      if (idx !== -1) reputationToasts.value[idx] = { ...reputationToasts.value[idx], barWidth: newWidth }
    })
    setTimeout(() => { reputationToasts.value = reputationToasts.value.filter(t => t.id !== id) }, 6000)
  })

  // ── Map socket events ───────────────────────────────────────────────────────
  socket.on('map-state', applyMapState)

  socket.on('map-viewport-changed', ({ xn, yn, scale }) => {
    mapViewport.value = { xn: xn ?? 0, yn: yn ?? 0, scale: scale ?? 1 }
  })

  socket.on('map-fog-updated', ({ enabled }) => { mapFogEnabled.value = enabled })

  socket.on('map-fog-patch', ({ strokes }) => {
    if (Array.isArray(strokes)) mapFogStrokes.value.push(...strokes)
  })

  socket.on('map-fog-reset', () => {
    mapFogStrokes.value = []
    mapFogCellsSet.clear()
    mapFogCells.value = []
  })

  socket.on('map-fog-cells-patch', ({ cells }) => {
    if (Array.isArray(cells)) {
      cells.forEach(c => mapFogCellsSet.add(c))
      mapFogCells.value = [...mapFogCellsSet]
    }
  })

  socket.on('map-fog-cells-reset', () => {
    mapFogCellsSet.clear()
    mapFogCells.value = []
  })

  socket.on('map-grid-updated', ({ gridType, gridCols, gridRows, gridHexOrientation, gridOffsetX, gridOffsetY, gridCellW, gridCellH }) => {
    mapGridType.value = gridType || 'none'
    mapGridCols.value = gridCols || 20
    mapGridRows.value = gridRows || 15
    mapGridHexOrientation.value = gridHexOrientation || 'flat'
    mapGridOffsetX.value = gridOffsetX ?? 0
    mapGridOffsetY.value = gridOffsetY ?? 0
    mapGridCellW.value = gridCellW ?? null
    mapGridCellH.value = gridCellH ?? null
  })

  socket.on('map-token-moved', ({ playerId, nx, ny, name }) => {
    const existing = mapTokens.value[String(playerId)] || {}
    mapTokens.value = { ...mapTokens.value, [String(playerId)]: { ...existing, nx, ny, ...(name !== undefined ? { name } : {}) } }
  })

  socket.on('map-token-removed', ({ playerId }) => {
    const next = { ...mapTokens.value }
    delete next[String(playerId)]
    mapTokens.value = next
  })

  socket.on('demo-reset', () => { window.location.reload() })

  socket.on('tv-theme-updated', ({ theme }) => { applyTheme(theme || 'dark') })

  // guard beforeunload géré via watch(puzzleImageId)
})

onUnmounted(() => {
  if (clockTickInterval) window.clearInterval(clockTickInterval)
  resetSocket()
  window.removeEventListener('beforeunload', preventReloadDuringPuzzle)
})
</script>

<template>
  <div class="tv-wrapper">
    <div v-if="connectionError" class="tv-error">
      <p class="error-icon"><AppIcon icon="lucide:alert-triangle" size="3rem" color="var(--color-warning)" /></p>
      <p class="error-text">{{ connectionError }}</p>
    </div>

    <div v-else-if="!session" class="tv-loading">
      <div class="loading-orb" />
      <p class="loading-text">Connexion à la session…</p>
    </div>

    <template v-else>
      <!-- Fixed overlays: doom clock + free timer -->
      <div class="overlays-container">
        <div v-if="activeDoomClock && tvMode !== 'doom'" class="doom-overlay" :class="{ danger: doomRemaining <= DOOM_DANGER_THRESHOLD_SECONDS }">
          <span class="doom-overlay-title">{{ activeDoomClock.title }}</span>
          <span class="doom-overlay-timer">{{ doomRemainingLabel }}</span>
        </div>
        <div v-if="activeTimer && timerRemaining > 0" class="timer-overlay" :class="{ danger: timerRemaining <= TIMER_DANGER_THRESHOLD_SECONDS }">
          <span class="timer-overlay-label">{{ activeTimer.label }}</span>
          <span class="timer-overlay-time">{{ timerRemainingLabel }}</span>
        </div>
      </div>

      <Transition name="tv-mode" mode="out-in">
        <div :key="tvMode" class="tv-mode-container" data-testid="tv-container" :data-tv-mode="tvMode">
          <TvLobby
            v-if="tvMode === 'lobby'"
            :session="session"
            :qr-code-data-url="qrCodeDataUrl"
            :session-code="sessionCode"
            :lobby-bg-url="lobbyBgUrl"
          />

          <TvCombat
            v-else-if="tvMode === 'combat'"
            :players="sortedPlayers"
            :combat-round="combatRound"
            :hp-animations="hpAnimations"
          />

          <TvVote
            v-else-if="tvMode === 'vote'"
            :active-vote="activeVote"
          />

          <TvDoomClock
            v-else-if="tvMode === 'doom'"
            :active-doom-clock="activeDoomClock"
            :doom-remaining="doomRemaining"
            :doom-remaining-label="doomRemainingLabel"
          />

          <TvTensionScale
            v-else-if="tvMode === 'tension' && activeTensionScale"
            :active-tension-scale="activeTensionScale"
            :tension-color="tensionColor"
            :tension-shake-class="tensionShakeClass"
          />

          <TvTimescale
            v-else-if="tvMode === 'timescale' && activeTimeScale"
            :active-time-scale="activeTimeScale"
          />

          <TvImage
            v-else-if="tvMode === 'image'"
            :image-url="currentImageUrl"
            :image-label="currentImageLabel"
          />

          <TvMap
            v-else-if="tvMode === 'map' && currentMapUrl"
            :map-url="currentMapUrl"
            :fog-enabled="mapFogEnabled"
            :map-viewport="mapViewport"
            :fog-strokes="mapFogStrokes"
            :fog-cells="mapFogCells"
            :map-tokens="mapTokens"
            :grid-type="mapGridType"
            :grid-cols="mapGridCols"
            :grid-rows="mapGridRows"
            :grid-hex-orientation="mapGridHexOrientation"
            :grid-offset-x="mapGridOffsetX"
            :grid-offset-y="mapGridOffsetY"
            :grid-cell-w="mapGridCellW"
            :grid-cell-h="mapGridCellH"
            :players="players"
          />

          <TvMerchant
            v-else-if="tvMode === 'merchant' && activeMerchant"
            :active-merchant="activeMerchant"
          />

          <TvPuzzle
            v-else-if="tvMode === 'puzzle' && puzzleServeUrl"
            :puzzle-serve-url="puzzleServeUrl"
            :pending-clicks="pendingPuzzleClicks"
            @iframe-ready="onIframeReady"
          />

          <TvReputation
            v-else-if="tvMode === 'reputation'"
            :factions="factions"
            :session="session"
          />
        </div>
      </Transition>

      <!-- Reputation change toasts (all modes except reputation) -->
      <TransitionGroup name="rep-toast" tag="div" class="reputation-toast-area">
        <div v-for="toast in reputationToasts" :key="toast.id" class="rep-toast">
          <div class="rep-toast-faction">{{ toast.factionName }}</div>
          <div class="rep-toast-bar-row">
            <div class="rep-toast-bar-track">
              <div
                class="rep-toast-bar-fill"
                :style="{
                  width: toast.barWidth + '%',
                  background: toastBarColor(toast),
                  boxShadow: `0 0 12px ${toastBarColor(toast)}`,
                }"
              />
            </div>
            <span class="rep-toast-value" :style="{ color: toastBarColor(toast) }">
              {{ formatFactionValue(toast.newValue) }}
            </span>
          </div>
        </div>
      </TransitionGroup>
    </template>
  </div>
</template>

<style scoped>
/* noinspection CssUnusedSymbol */
:global(#app) {
  max-width: none !important;
  width: 100% !important;
  margin: 0 !important;
}

.tv-wrapper {
  height: 100vh;
  min-height: 100vh;
  background: var(--color-bg);
  background-image: var(--gradient-page);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  font-size: 18px;
  color: var(--color-text);
  --tv-panel-bg: var(--gradient-panel);
  --tv-panel-highlight-bg: var(--gradient-panel-soft);
  --tv-header-bg: var(--surface-highlight);
  --tv-control-bg: var(--surface-raised);
  --tv-control-bg-muted: var(--surface-ghost);
  --tv-track-bg: var(--surface-track);
  --tv-gold-bg: var(--surface-gold-soft);
  --tv-gold-bg-strong: var(--surface-gold-soft-strong);
  --tv-success-text: var(--color-success);
  --tv-success-bg: var(--color-success-soft);
  --tv-success-border: var(--color-success-border);
  --tv-warning-text: var(--color-warning);
  --tv-warning-bg: var(--color-warning-soft);
  --tv-warning-border: var(--color-warning-border);
  --tv-info-text: var(--color-info-bright);
  --tv-info-bg: var(--color-info-soft);
  --tv-info-border: var(--color-info-border);
  --tv-danger-text: var(--color-danger);
  --tv-danger-bg: var(--color-danger-soft);
  --tv-danger-border: var(--color-danger-border);
}

/* ── Loading / Error ──────────────────────────────────────────────────────── */
.tv-loading, .tv-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.loading-orb {
  width: 48px; height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-gold);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-family: var(--font-heading), sans-serif; font-size: 1rem; letter-spacing: 0.2em; color: var(--color-text-dim); }
.error-icon { font-size: 3rem; }
.error-text { font-family: var(--font-heading), sans-serif; font-size: 1.2rem; color: var(--tv-danger-text); text-align: center; }

/* ── Overlays (doom clock + free timer) ───────────────────────────────────── */
.overlays-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.doom-overlay {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid var(--tv-danger-border);
  border-radius: 12px;
  padding: 0.5rem 0.85rem;
  backdrop-filter: blur(4px);
}
.doom-overlay.danger {
  animation: overlayPulse 1s ease-in-out infinite;
  border-color: var(--tv-danger-text);
}
.doom-overlay-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--tv-danger-text);
  opacity: 0.85;
}
.doom-overlay-timer {
  font-family: var(--font-title), sans-serif;
  font-size: 2rem;
  color: var(--tv-danger-text);
  line-height: 1;
  letter-spacing: 0.05em;
}

.timer-overlay {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid var(--tv-info-border);
  border-radius: 12px;
  padding: 0.5rem 0.85rem;
  backdrop-filter: blur(4px);
}
.timer-overlay.danger {
  border-color: var(--tv-warning-border);
  animation: overlayPulse 1s ease-in-out infinite;
}
.timer-overlay-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--tv-info-text);
  opacity: 0.85;
}
.timer-overlay-time {
  font-family: var(--font-title), sans-serif;
  font-size: 2rem;
  color: var(--tv-info-text);
  line-height: 1;
  letter-spacing: 0.05em;
}

:root[data-theme='light'] .timer-overlay-label,
:root[data-theme='light'] .timer-overlay-time,
:root[data-theme='light'] .doom-overlay-title,
:root[data-theme='light'] .doom-overlay-timer {
  color: #9ed3ff;
}

@keyframes overlayPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}

/* ── Mode container + transition ──────────────────────────────────────────── */
.tv-mode-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}
/* noinspection CssUnusedSymbol */
.tv-mode-enter-active { transition: opacity 0.4s ease; }
/* noinspection CssUnusedSymbol */
.tv-mode-leave-active { transition: opacity 0.25s ease; }
/* noinspection CssUnusedSymbol */
.tv-mode-enter-from,
/* noinspection CssUnusedSymbol */
.tv-mode-leave-to { opacity: 0; }

/* ── Reputation change toasts ─────────────────────────────────────────────── */
.reputation-toast-area {
  position: fixed;
  bottom: 3rem;
  right: 3rem;
  z-index: 9500;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  pointer-events: none;
}

.rep-toast {
  background: rgba(8, 6, 2, 0.93);
  border: 2px solid rgba(255,255,255,0.15);
  border-radius: 18px;
  padding: 1.1rem 1.75rem 1.25rem;
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 48px rgba(0,0,0,0.7);
  min-width: 360px;
}

.rep-toast-faction {
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
}

.rep-toast-bar-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.rep-toast-bar-track {
  flex: 1;
  height: 14px;
  background: rgba(255,255,255,0.1);
  border-radius: 99px;
  overflow: hidden;
}

.rep-toast-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 1.1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.rep-toast-value {
  font-family: var(--font-heading), sans-serif;
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  min-width: 3.5rem;
  text-align: right;
}

/* noinspection CssUnusedSymbol */
.rep-toast-enter-active {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
/* noinspection CssUnusedSymbol */
.rep-toast-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
/* noinspection CssUnusedSymbol */
.rep-toast-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}
/* noinspection CssUnusedSymbol */
.rep-toast-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
</style>
