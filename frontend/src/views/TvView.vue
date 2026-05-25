<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { applyTheme, getThemePreference, setThemePreference } from '../utils/themePreferences.js'
import AppIcon from '../components/AppIcon.vue'
import DemoBanner from '../components/DemoBanner.vue'
import { DND_CONDITIONS_MAP } from '../utils/conditions.js'

const DOOM_DANGER_THRESHOLD_SECONDS = 10
const TENSION_COLOR_MEDIUM_RATIO = 0.33
const TENSION_COLOR_HIGH_RATIO = 0.66
const TENSION_SHAKE_MEDIUM_RATIO = 0.4
const TENSION_SHAKE_HARD_RATIO = 0.75
const TEMP_HP_COLOR = 'var(--tv-info-text)'
const TIMER_DANGER_THRESHOLD_SECONDS = 10

const route = useRoute()
import { BACKEND_URL } from '@/config.js'

const session = ref(null)
const players = ref([])
const connectionError = ref('')
const tvMode = ref('lobby')
const qrCodeDataUrl = ref(null)
const sessionCode = ref('')
const currentImageUrl = ref(null)
const lobbyBgUrl = ref(null)
const activeVote = ref(null)
const activeMerchant = ref(null)
const activeDoomClock = ref(null)
const activeTensionScale = ref(null)
const now = ref(Date.now())
let clockTickInterval = null
const theme = ref(getThemePreference('tv', 'dark'))
const isLightTheme = computed(() => theme.value === 'light')

// ── Combat round ────────────────────────────────────────────────────────────
const combatRound = ref(0)

// ── Free timer ──────────────────────────────────────────────────────────────
const activeTimer = ref(null)

// ── Map state ──────────────────────────────────────────────────────────────
const currentMapUrl = ref(null)
const mapFogEnabled = ref(false)
const mapViewport = ref({ xn: 0, yn: 0, scale: 1 })
const mapFogStrokes = ref([])
const mapFogCanvas = ref(null)
const mapContainerRef = ref(null)
const mapImageSize = ref({ w: 0, h: 0 })
const mapTokens = ref({})  // { [playerId]: { nx, ny } }

// ── Demo mode ───────────────────────────────────────────────────────────────
const isDemo = ref(false)

const mapImageStyle = computed(() => {
  const container = mapContainerRef.value
  if (!container) return {}
  const W = container.offsetWidth || 1920
  const H = container.offsetHeight || 1080
  const natW = mapImageSize.value.w || 1920
  const natH = mapImageSize.value.h || 1080
  const vp = mapViewport.value
  const baseScale = Math.min(W / natW, H / natH)
  const totalScale = baseScale * vp.scale
  const imgW = natW * totalScale
  const imgH = natH * totalScale
  const offsetX = W / 2 - imgW / 2 + (vp.xn * natW * baseScale)
  const offsetY = H / 2 - imgH / 2 + (vp.yn * natH * baseScale)
  return {
    position: 'absolute',
    left: `${offsetX}px`,
    top: `${offsetY}px`,
    width: `${imgW}px`,
    height: `${imgH}px`,
    transform: 'none',
    transformOrigin: undefined,
  }
})

// Positions des jetons calculées avec le même layout que l'image
const mapTokenStyles = computed(() => {
  const result = {}
  const container = mapContainerRef.value
  if (!container || !mapImageSize.value.w) return result
  const W = container.offsetWidth || 1920
  const H = container.offsetHeight || 1080
  const natW = mapImageSize.value.w
  const natH = mapImageSize.value.h
  const vp = mapViewport.value
  const baseScale = Math.min(W / natW, H / natH)
  const totalScale = baseScale * vp.scale
  const imgW = natW * totalScale
  const imgH = natH * totalScale
  const offsetX = W / 2 - imgW / 2 + (vp.xn * natW * baseScale)
  const offsetY = H / 2 - imgH / 2 + (vp.yn * natH * baseScale)
  for (const [pid, pos] of Object.entries(mapTokens.value)) {
    const tx = offsetX + pos.nx * natW * totalScale
    const ty = offsetY + pos.ny * natH * totalScale
    result[pid] = { left: `${tx}px`, top: `${ty}px` }
  }
  return result
})

function getPlayerById(playerId) {
  return players.value.find(p => String(p.id) === String(playerId)) || null
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  setThemePreference('tv', theme.value)
  applyTheme(theme.value)
}

// Track HP change animations per player: { id -> { type: 'damage'|'heal', delta: number, key: number } }
const hpAnimations = ref({})
// Track previous HP values to compute delta
const previousHp = ref({})

function onMapImageLoad(e) {
  mapImageSize.value = { w: e.target.naturalWidth, h: e.target.naturalHeight }
  renderMapFog()
}

// ── Map fog rendering ──────────────────────────────────────────────────────
function renderMapFog() {
  const canvas = mapFogCanvas.value
  if (!canvas) return
  const container = mapContainerRef.value
  if (!container) return

  const W = container.offsetWidth || 1920
  const H = container.offsetHeight || 1080
  canvas.width = W
  canvas.height = H

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)

  if (!mapFogEnabled.value) return

  // Draw full fog
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fillRect(0, 0, W, H)

  if (mapFogStrokes.value.length === 0) return

  const natW = mapImageSize.value.w
  const natH = mapImageSize.value.h
  if (!natW || !natH) return

  // Replicate the same CSS transform the image uses
  const vp = mapViewport.value
  const baseScale = Math.min(W / natW, H / natH)
  const totalScale = baseScale * vp.scale
  const imgW = natW * totalScale
  const imgH = natH * totalScale
  const offsetX = W / 2 - imgW / 2 + (vp.xn * natW * baseScale)
  const offsetY = H / 2 - imgH / 2 + (vp.yn * natH * baseScale)

  // Erase revealed areas
  ctx.globalCompositeOperation = 'destination-out'
  for (const stroke of mapFogStrokes.value) {
    ctx.beginPath()
    ctx.arc(
        offsetX + stroke.nx * natW * totalScale,
        offsetY + stroke.ny * natH * totalScale,
        stroke.nr * natW * totalScale,
        0, Math.PI * 2
    )
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function applyMapState(data) {
  if (!data) return
  if (data.mapUrl !== currentMapUrl.value) {
    mapImageSize.value = { w: 0, h: 0 }
  }
  currentMapUrl.value = data.mapUrl || null
  mapFogEnabled.value = !!data.fogEnabled
  mapViewport.value = {
    xn: data.viewport?.xn ?? data.viewport?.x ?? 0,
    yn: data.viewport?.yn ?? data.viewport?.y ?? 0,
    scale: data.viewport?.scale ?? 1,
  }
  mapFogStrokes.value = Array.isArray(data.fogStrokes) ? data.fogStrokes : []
  mapTokens.value = (data.mapTokens && typeof data.mapTokens === 'object') ? data.mapTokens : {}
  nextTick(renderMapFog)
}

function hpPercent(player) {
  if (!player.max_hp) return 100
  const displayedBaseHp = Math.min(player.max_hp, Math.max(0, player.current_hp ?? 0))
  return Math.min(100, Math.max(0, (displayedBaseHp / player.max_hp) * 100))
}
function hpBarColor(player) {
  if (temporaryHp(player) > 0) return TEMP_HP_COLOR
  const pct = hpPercent(player)
  if (pct > 50) return 'var(--tv-success-text)'
  if (pct > 20) return 'var(--tv-warning-text)'
  return 'var(--tv-danger-text)'
}
function temporaryHp(player) {
  return Math.max(0, (player.current_hp ?? 0) - (player.max_hp ?? 0))
}
function displayedCurrentHp(player) {
  const current = Number(player.current_hp ?? 0)
  const max = Number(player.max_hp)
  if (!Number.isFinite(max) || max <= 0) return Math.max(0, current)
  return Math.max(0, Math.min(current, max))
}

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function avatarUrl(player) {
  if (!player.avatar_url) return null
  return resolveMediaUrl(player.avatar_url)
}

const CONDITION_LABELS = DND_CONDITIONS_MAP

function parseConditions(player) {
  try {
    const raw = player.conditions
    if (!raw) return []
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function barWidth(optionIndex) {
  if (!activeVote.value || !activeVote.value.totalVotes) return 0
  return Math.round((activeVote.value.results[optionIndex] / activeVote.value.totalVotes) * 100)
}

function voterNamesFor(optionIndex) {
  if (!activeVote.value) return ''
  return activeVote.value.voterNames
    .filter(v => v.optionIndex === optionIndex)
    .map(v => v.name)
    .join(', ')
}

const doomRemaining = computed(() => {
  if (!activeDoomClock.value?.endAt) return 0
  return Math.max(0, Math.floor((new Date(activeDoomClock.value.endAt).getTime() - now.value) / 1000))
})

const doomRemainingLabel = computed(() => {
  const mins = Math.floor(doomRemaining.value / 60)
  const secs = doomRemaining.value % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

const timerRemaining = computed(() => {
  if (!activeTimer.value?.endAt) return 0
  return Math.max(0, Math.floor((new Date(activeTimer.value.endAt).getTime() - now.value) / 1000))
})

const timerRemainingLabel = computed(() => {
  const mins = Math.floor(timerRemaining.value / 60)
  const secs = timerRemaining.value % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

// Sort players by initiative descending (null/undefined last) for combat mode
const sortedPlayers = computed(() => {
  return [...players.value].sort((a, b) => {
    const ai = a.initiative
    const bi = b.initiative
    if (ai === null || ai === undefined) return 1
    if (bi === null || bi === undefined) return -1
    return bi - ai
  })
})

const tensionProgress = computed(() => {
  if (!activeTensionScale.value?.steps) return 0
  const direction = activeTensionScale.value.direction || 'ascending'
  const progress = direction === 'descending'
    ? (activeTensionScale.value.steps - activeTensionScale.value.level) / activeTensionScale.value.steps
    : activeTensionScale.value.level / activeTensionScale.value.steps
  return Math.min(1, Math.max(0, progress))
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

let socket = null

onMounted(() => {
  clockTickInterval = window.setInterval(() => { now.value = Date.now() }, 1000)
  socket = io(BACKEND_URL)

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
    lobbyBgUrl.value = data.lobbyBgUrl || null
    activeVote.value = data.activeVote || null
    activeMerchant.value = data.activeMerchant || null
    activeDoomClock.value = data.doomClock || null
    activeTensionScale.value = data.tensionScale || null
    combatRound.value = data.combatRound || 0
    activeTimer.value = data.timer || null
    isDemo.value = !!data.isDemo
    data.players.forEach(pl => { previousHp.value[pl.id] = pl.current_hp })
    if (data.mapState) applyMapState(data.mapState)
  })

  socket.on('tv-mode-changed', ({ mode, imageUrl, merchantData }) => {
    tvMode.value = mode
    if (imageUrl) currentImageUrl.value = imageUrl
    if (merchantData) activeMerchant.value = merchantData
    else if (mode === 'lobby') activeMerchant.value = null
  })

  socket.on('vote-started', (voteData) => {
    activeVote.value = { ...voteData, isClosed: false }
  })

  socket.on('vote-updated', (voteData) => {
    activeVote.value = { ...voteData, isClosed: false }
  })

  socket.on('vote-closed', (voteData) => {
    activeVote.value = { ...voteData, isClosed: true }
  })

  socket.on('player-joined', (player) => {
    const idx = players.value.findIndex(p => String(p.id) === String(player.id))
    if (idx === -1) {
      players.value.push(player)
    } else {
      players.value[idx] = { ...players.value[idx], ...player }
    }
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
      hpAnimations.value = {
        ...hpAnimations.value,
        [id]: { type: delta < 0 ? 'damage' : 'heal', delta, key: Date.now() },
      }
      setTimeout(() => {
        const current = { ...hpAnimations.value }
        delete current[id]
        hpAnimations.value = current
      }, 2000)
    }
  })

  socket.on('conditions-updated', ({ playerId, conditions }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      players.value[idx] = { ...players.value[idx], conditions }
    }
  })

  socket.on('concentration-updated', ({ playerId, isConcentrating }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      players.value[idx] = { ...players.value[idx], is_concentrating: isConcentrating }
    }
  })

  socket.on('initiative-updated', ({ playerId, initiative }) => {
    const idx = players.value.findIndex(p => String(p.id) === String(playerId))
    if (idx !== -1) {
      players.value[idx] = { ...players.value[idx], initiative }
    }
  })

  socket.on('error', ({ message }) => {
    connectionError.value = message
  })

  socket.on('merchant-items-updated', (merchantData) => {
    activeMerchant.value = merchantData
  })

  socket.on('doom-clock-started', (doomClock) => {
    activeDoomClock.value = doomClock
  })

  socket.on('doom-clock-stopped', () => {
    activeDoomClock.value = null
  })

  socket.on('tension-scale-updated', (tensionScale) => {
    activeTensionScale.value = tensionScale
  })

  socket.on('tension-scale-ended', () => {
    activeTensionScale.value = null
  })

  socket.on('round-updated', ({ round }) => {
    combatRound.value = round
  })

  socket.on('timer-updated', (timer) => {
    activeTimer.value = timer
  })

  socket.on('timer-stopped', () => {
    activeTimer.value = null
  })

  socket.on('lobby-bg-updated', ({ url }) => {
    lobbyBgUrl.value = url || null
  })

  // ── Map events ─────────────────────────────────────────────────────────
  socket.on('map-state', applyMapState)

  socket.on('map-viewport-changed', ({ xn, yn, scale }) => {
    mapViewport.value = { xn: xn ?? 0, yn: yn ?? 0, scale: scale ?? 1 }
    nextTick(renderMapFog)
  })

  socket.on('map-fog-updated', ({ enabled }) => {
    mapFogEnabled.value = enabled
    nextTick(renderMapFog)
  })

  socket.on('map-fog-patch', ({ strokes }) => {
    if (Array.isArray(strokes)) {
      mapFogStrokes.value.push(...strokes)
      renderMapFog()
    }
  })

  socket.on('map-fog-reset', () => {
    mapFogStrokes.value = []
    renderMapFog()
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

  socket.on('demo-reset', () => {
    window.location.reload()
  })

  window.addEventListener('resize', renderMapFog)
})

onUnmounted(() => {
  if (clockTickInterval) window.clearInterval(clockTickInterval)
  if (socket) socket.disconnect()
  window.removeEventListener('resize', renderMapFog)
})
</script>

<template>
  <div class="tv-wrapper">
    <button class="tv-theme-toggle" @click="toggleTheme">
      <AppIcon :icon="isLightTheme ? 'lucide:moon' : 'lucide:sun'" size="1em" />
      {{ isLightTheme ? 'Sombre' : 'Clair' }}
    </button>
    <!-- Demo banner — fixed at bottom to avoid disrupting the spectator view -->
    <div v-if="isDemo" class="tv-demo-banner" role="alert">
      ⚠️ Mode démonstration — contenu effacé chaque nuit à minuit
    </div>
    <!-- Error state -->
    <div v-if="connectionError" class="tv-error">
      <p class="error-icon"><AppIcon icon="lucide:alert-triangle" size="3rem" color="var(--color-warning)" /></p>
      <p class="error-text">{{ connectionError }}</p>
    </div>

    <!-- Loading state -->
    <div v-else-if="!session" class="tv-loading">
      <div class="loading-orb" />
      <p class="loading-text">Connexion à la session…</p>
    </div>

    <!-- Main TV display -->
    <template v-else>
      <!-- Doom clock overlay: shown on top of any mode other than doom full-screen -->
      <div v-if="activeDoomClock && tvMode !== 'doom'" class="doom-overlay" :class="{ danger: doomRemaining <= DOOM_DANGER_THRESHOLD_SECONDS }">
        <span class="doom-overlay-title">{{ activeDoomClock.title }}</span>
        <span class="doom-overlay-timer">{{ doomRemainingLabel }}</span>
      </div>

      <!-- Free timer overlay -->
      <div v-if="activeTimer && timerRemaining > 0" class="timer-overlay" :class="{ danger: timerRemaining <= TIMER_DANGER_THRESHOLD_SECONDS }">
        <span class="timer-overlay-label">{{ activeTimer.label }}</span>
        <span class="timer-overlay-time">{{ timerRemainingLabel }}</span>
      </div>
      <Transition name="tv-mode" mode="out-in">
      <div :key="tvMode" class="tv-mode-container" data-testid="tv-container" :data-tv-mode="tvMode">
      <!-- Lobby mode: session title + QR code + session code -->
      <div v-if="tvMode === 'lobby'" class="lobby-display" data-testid="tv-mode-lobby">
        <img v-if="lobbyBgUrl" :src="resolveMediaUrl(lobbyBgUrl)" class="lobby-bg-img" aria-hidden="true" />
        <header class="tv-header">
          <h1 class="session-title">{{ session.name }}</h1>
          <div class="lobby-divider" aria-hidden="true">⸻ ✦ ⸻</div>
        </header>
        <p class="lobby-title">Rejoignez la partie !</p>
        <img v-if="qrCodeDataUrl" :src="qrCodeDataUrl" alt="QR Code" class="lobby-qr" />
        <div class="lobby-code" data-testid="tv-session-code">{{ sessionCode }}</div>
        <p class="lobby-hint">Scannez le QR code ou saisissez le code sur l'application</p>
      </div>

      <!-- Combat mode: party HP grid -->
      <template v-else-if="tvMode === 'combat'">
        <div v-if="players.length === 0" class="tv-empty">
          <p class="empty-icon"><AppIcon icon="game-icons:castle" size="2.5rem" color="var(--color-text-dim)" /></p>
          <p class="empty-text">En attente des aventuriers…</p>
        </div>

        <template v-else>
          <div class="combat-header">
            <div class="combat-round-badge" data-testid="tv-round"><AppIcon icon="game-icons:crossed-swords" size="1em" /> Round {{ combatRound }}</div>
          </div>
          <main class="party-grid">
          <div
            v-for="player in sortedPlayers"
            :key="player.id"
            class="player-card"
            :class="{
              'is-damage': hpAnimations[player.id]?.type === 'damage',
              'is-heal': hpAnimations[player.id]?.type === 'heal',
              'is-critical': hpPercent(player) <= 20 && hpPercent(player) > 0,
              'is-ko': hpPercent(player) <= 0,
            }"
            :data-testid="`tv-player-card-${player.id}`"
          >
            <!-- Header -->
            <div class="card-header">
              <!-- Avatar -->
              <div class="card-avatar">
                <img v-if="avatarUrl(player)" :src="avatarUrl(player)" :alt="player.player_name" class="avatar-img" />
                <span v-else class="avatar-fallback">{{ player.player_name?.[0]?.toUpperCase() || '?' }}</span>
              </div>

              <div class="card-identity">
                <span class="card-name">{{ player.player_name }}</span>
                <span v-if="player.dnd_class" class="class-badge">{{ player.dnd_class }}</span>
              </div>

              <div class="initiative-badge"><AppIcon icon="game-icons:dice-six-faces-five" size="1em" /> {{ player.initiative ?? '—' }}</div>

              <div class="ac-shield">
                <span class="ac-icon"><AppIcon icon="game-icons:shield" size="1em" color="var(--color-gold-bright)" /></span>
                <span class="ac-value">{{ player.ac ?? 10 }}</span>
              </div>

              <span v-if="player.is_concentrating" class="concentration-badge" title="Concentration">
                <AppIcon icon="game-icons:bullseye" size="1em" color="var(--tv-info-text, var(--color-info-bright))" />
              </span>
            </div>

            <!-- HP Bar -->
            <div class="hp-section">
              <div class="hp-numbers">
                <span class="hp-current" :style="{ color: hpBarColor(player) }">
                  {{ displayedCurrentHp(player) }}
                </span>
                <span class="hp-separator">/</span>
                <span class="hp-max">{{ player.max_hp ?? 0 }}</span>
                <span class="hp-label">PV</span>
                <span v-if="temporaryHp(player) > 0" class="hp-temp">+{{ temporaryHp(player) }} TEMP</span>
              </div>
              <div class="hp-track">
                <div
                  class="hp-fill"
                  :style="{ width: hpPercent(player) + '%', background: hpBarColor(player) }"
                />
              </div>
            </div>

            <!-- Conditions -->
            <div v-if="parseConditions(player).length > 0" class="conditions-row">
              <span
                v-for="cid in parseConditions(player)"
                :key="cid"
                class="condition-badge"
                :title="CONDITION_LABELS[cid]?.label || cid"
              >
                <AppIcon
                  :icon="CONDITION_LABELS[cid]?.icon || 'game-icons:lightning-trio'"
                  :color="CONDITION_LABELS[cid]?.color || 'currentColor'"
                  size="1em"
                />
                {{ CONDITION_LABELS[cid]?.label || cid }}
              </span>
            </div>

            <!-- HP change floating indicator -->
            <Transition name="hp-float">
              <div
                v-if="hpAnimations[player.id]"
                :key="hpAnimations[player.id].key"
                class="hp-delta"
                :class="hpAnimations[player.id].type === 'damage' ? 'hp-delta-damage' : 'hp-delta-heal'"
              >
                {{ hpAnimations[player.id].delta > 0 ? '+' : '' }}{{ hpAnimations[player.id].delta }}
              </div>
            </Transition>
          </div>
        </main>
        </template>
      </template>

      <!-- Vote mode -->
      <div v-else-if="tvMode === 'vote'" class="vote-display" data-testid="tv-mode-vote">
        <h2 class="vote-question" data-testid="tv-vote-question">{{ activeVote?.question }}</h2>
        <div class="vote-progress">{{ activeVote?.totalVotes }} / {{ activeVote?.totalPlayers }} joueurs ont voté</div>
        <div v-if="activeVote?.isClosed" class="vote-results">
          <div v-for="(option, i) in activeVote.options" :key="i" class="vote-option">
            <div class="vote-option-header">
              <span class="vote-option-label">{{ option }}</span>
              <span class="vote-option-count">{{ activeVote.results[i] }} vote(s)</span>
            </div>
            <div class="vote-bar">
              <div class="vote-bar-fill" :style="{ width: barWidth(i) + '%' }"></div>
            </div>
            <span v-if="!activeVote.isAnonymous" class="voter-names">
              {{ voterNamesFor(i) }}
            </span>
          </div>
        </div>
        <div v-else class="vote-waiting">
          <div class="vote-orb"></div>
          <p>Vote en cours…</p>
        </div>
      </div>

      <!-- Doom clock mode -->
      <div v-else-if="tvMode === 'doom'" class="doom-display" data-testid="tv-mode-doom">
        <h2 class="doom-title">{{ activeDoomClock?.title || 'DOOM CLOCK' }}</h2>
        <div class="doom-timer" :class="{ danger: doomRemaining <= DOOM_DANGER_THRESHOLD_SECONDS }" data-testid="tv-doom-timer">{{ doomRemainingLabel }}</div>
      </div>

      <!-- Tension mode -->
      <div
        v-else-if="tvMode === 'tension' && activeTensionScale"
        class="tension-display"
        data-testid="tv-mode-tension"
        :style="{ '--tension-color': tensionColor }"
      >
        <h2 class="tension-title">{{ activeTensionScale.title }}</h2>
        <div class="tension-steps">
          <div
            v-for="step in activeTensionScale.steps"
            :key="step"
            class="tension-step"
            :class="{ active: step <= activeTensionScale.level }"
          >
            {{ step }}
          </div>
        </div>
        <div class="tension-core">
          <div class="tension-pulse-wrap" :class="tensionShakeClass">
            <div class="tension-pulse"></div>
          </div>
          <div class="tension-level">
            {{ activeTensionScale.level }}<span>/{{ activeTensionScale.steps }}</span>
          </div>
        </div>
      </div>

      <!-- Image mode -->
      <div v-else-if="tvMode === 'image'" class="image-display" data-testid="tv-mode-image">
        <img :src="resolveMediaUrl(currentImageUrl)" class="tv-image" alt="Image affichée" />
      </div>

      <!-- Map mode -->
      <div v-else-if="tvMode === 'map' && currentMapUrl" ref="mapContainerRef" class="map-display" data-testid="tv-mode-map">
        <!-- Layer 1: map image -->
        <img :src="resolveMediaUrl(currentMapUrl)" class="map-image" :style="mapImageStyle" alt="Carte" @load="onMapImageLoad" />
        <!-- Layer 2: fog of war canvas -->
        <canvas ref="mapFogCanvas" class="map-fog-canvas" />
        <!-- Layer 3: player tokens — toujours au-dessus du brouillard -->
        <div class="map-tokens-layer">
          <div
            v-for="(tokenPos, pid) in mapTokens"
            :key="pid"
            class="map-token-placed"
            :style="mapTokenStyles[pid]"
          >
            <div class="token-circle" :style="String(pid).startsWith('custom_') ? { borderColor: '#6aaa44', boxShadow: '0 0 20px rgba(0,0,0,0.9), 0 0 12px rgba(106,170,68,0.5)' } : {}">
              <img
                v-if="getPlayerById(pid)?.avatar_url"
                :src="resolveMediaUrl(getPlayerById(pid).avatar_url)"
                :alt="getPlayerById(pid)?.player_name"
                class="token-avatar-img"
              />
              <span v-else class="token-initial-letter">
                {{ (getPlayerById(pid)?.player_name || mapTokens[pid]?.name || '?')[0]?.toUpperCase() }}
              </span>
            </div>
            <span class="token-label">  {{ getPlayerById(pid)?.player_name || mapTokens[pid]?.name || `[pid=${pid}]` }}</span>

          </div>
        </div>
      </div>

      <!-- Merchant mode -->
      <div v-else-if="tvMode === 'merchant' && activeMerchant" class="merchant-display" data-testid="tv-mode-merchant">
        <div class="merchant-grid">
          <div
            v-for="item in activeMerchant.items"
            :key="item.id"
            class="merchant-item"
            :class="{ 'out-of-stock': item.stock === 0 }"
          >
            <div class="item-category">{{ item.category }}</div>
            <div class="item-name">{{ item.name }}</div>
            <p v-if="item.description" class="item-desc">{{ item.description }}</p>
            <div class="item-footer">
              <span class="item-price">{{ item.price }} po</span>
              <span v-if="item.stock === -1" class="item-stock unlimited">∞</span>
              <span v-else-if="item.stock === 0" class="item-stock empty">Épuisé</span>
              <span v-else class="item-stock">× {{ item.stock }}</span>
            </div>
          </div>
        </div>
      </div>
      </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
:global(#app) {
  max-width: none !important;
  width: 100% !important;
  margin: 0 !important;
}

.tv-wrapper {
  min-height: 100vh;
  background: var(--color-bg);
  background-image: var(--gradient-page);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  font-size: 18px; /* Base font size boosted for TV viewing distance */
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

.tv-theme-toggle {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 20;
  background: var(--tv-control-bg);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tv-theme-toggle:hover {
  color: var(--color-gold-bright);
  border-color: var(--color-gold-dark);
}

/* ── Loading / Error ─────────────────────────────────────────────────── */
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
.loading-text { font-family: var(--font-heading); font-size: 1rem; letter-spacing: 0.2em; color: var(--color-text-dim); }
.error-icon { font-size: 3rem; }
.error-text { font-family: var(--font-heading); font-size: 1.2rem; color: var(--tv-danger-text); text-align: center; }

/* ── Header (lobby only) ──────────────────────────────────────────────── */
.tv-header {
  text-align: center;
  margin-bottom: 0.6rem;
}
.session-title {
  font-family: var(--font-title);
  font-size: clamp(1.2rem, 3vw, 2.4rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.1em;
  margin: 0.15rem 0;
}

.lobby-divider {
  font-family: var(--font-heading);
  font-size: clamp(0.48rem, 0.9vw, 0.66rem);
  letter-spacing: 0.5em;
  color: var(--color-gold-dark);
  margin-top: 0.3rem;
}

/* ── Lobby mode ───────────────────────────────────────────────────────── */
.lobby-display {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
}
.lobby-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.25;
  pointer-events: none;
  user-select: none;
}
.lobby-title {
  font-family: var(--font-title);
  font-size: clamp(1.08rem, 2.1vw, 1.68rem);
  color: var(--color-parchment);
  text-shadow: var(--text-shadow-emphasis);
  letter-spacing: 0.08em;
  margin: 0;
}
.lobby-qr {
  width: 400px;
  height: 400px;
  border: 2px solid var(--color-gold-dark);
  border-radius: 10px;
  background: white;
  padding: 5px;
  box-shadow: var(--shadow-soft);
}
.lobby-code {
  font-family: var(--font-title);
  font-size: clamp(2.4rem, 7.2vw, 4.8rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.2em;
  line-height: 1;
}
.lobby-hint {
  font-family: var(--font-heading);
  font-size: clamp(0.42rem, 0.9vw, 0.6rem);
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  text-align: center;
}

/* ── Empty ───────────────────────────────────────────────────────────── */
.tv-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.empty-icon { font-size: 4rem; opacity: 0.4; }
.empty-text { font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-text-dim); letter-spacing: 0.2em; }

/* ── Overlays (doom clock + free timer) ───────────────────────────────── */
.doom-overlay {
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
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
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--tv-danger-text);
  opacity: 0.85;
}
.doom-overlay-timer {
  font-family: var(--font-title);
  font-size: 1.6rem;
  color: var(--tv-danger-text);
  line-height: 1;
  letter-spacing: 0.05em;
}

.timer-overlay {
  position: fixed;
  top: 1rem;
  right: 4rem;
  z-index: 30;
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
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--tv-info-text);
  opacity: 0.85;
}
.timer-overlay-time {
  font-family: var(--font-title);
  font-size: 3rem;
  color: var(--tv-info-text);
  line-height: 1;
  letter-spacing: 0.05em;
}

/* In light theme the overlays always have a dark (black) background, so force
   light text colors to ensure readability regardless of theme. */
:root[data-theme='light'] .timer-overlay-label,
:root[data-theme='light'] .timer-overlay-time {
  color: #9ed3ff;
}

@keyframes overlayPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}

/* ── Combat header (round badge) ─────────────────────────────────────── */
.combat-header {
  display: flex;
  justify-content: center;
  padding: 0.6rem 0 0.2rem;
}
.combat-round-badge {
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
  background: var(--tv-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 999px;
  padding: 0.3rem 1.2rem;
  text-shadow: var(--text-shadow-accent);
}

/* ── Party Grid ──────────────────────────────────────────────────────── */
.party-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
  align-content: start;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* Centre le dernier joueur quand le total est impair */
.player-card:last-child:nth-child(odd) {
  grid-column: 1 / -1;
  max-width: calc(50% - 1rem);
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

/* ── Player Card ─────────────────────────────────────────────────────── */
.player-card {
  position: relative;
  background: var(--tv-panel-highlight-bg);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow: hidden;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.player-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--color-gold-dark), transparent);
  opacity: 0.4;
}
.player-card.is-critical {
  border-color: var(--tv-danger-border);
  box-shadow: 0 0 20px var(--tv-danger-bg);
}
.player-card.is-ko {
  border-color: var(--color-border);
  opacity: 0.6;
  filter: grayscale(0.5);
}

/* Damage animation: red shake */
.player-card.is-damage {
  animation: damageShake 0.5s ease-out, damageGlow 2s ease-out;
}
@keyframes damageShake {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-8px); }
  30%  { transform: translateX(7px); }
  45%  { transform: translateX(-5px); }
  60%  { transform: translateX(4px); }
  75%  { transform: translateX(-2px); }
  100% { transform: translateX(0); }
}
@keyframes damageGlow {
  0%   { box-shadow: 0 0 30px var(--tv-danger-bg); border-color: var(--tv-danger-border); }
  40%  { box-shadow: 0 0 20px var(--tv-danger-bg); }
  100% { box-shadow: none; border-color: var(--color-border); }
}

/* Heal animation: green pulse */
.player-card.is-heal {
  animation: healPulse 2s ease-out;
}
@keyframes healPulse {
  0%   { box-shadow: 0 0 0 0 var(--tv-success-bg); border-color: var(--tv-success-border); }
  20%  { box-shadow: 0 0 30px 6px var(--tv-success-bg); }
  60%  { box-shadow: 0 0 15px 2px var(--tv-success-bg); }
  100% { box-shadow: none; border-color: var(--color-border); }
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Avatar */
.card-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--color-gold-dark);
  flex-shrink: 0;
  background: var(--tv-control-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-fallback {
  font-family: var(--font-heading);
  font-size: 2.8rem;
  color: var(--color-gold-dark);
  font-weight: 700;
  line-height: 1;
}

.card-identity {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.card-name {
  font-family: var(--font-heading);
  font-size: clamp(1.1rem, 2.2vw, 1.6rem);
  color: var(--color-parchment);
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.class-badge {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: var(--tv-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  width: fit-content;
}

.initiative-badge {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--tv-info-text);
  background: var(--tv-info-bg);
  border: 1px solid var(--tv-info-border);
  border-radius: 20px;
  padding: 0.2rem 0.5rem;
  white-space: nowrap;
}

.ac-shield {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--tv-gold-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  padding: 0.3rem 0.6rem;
}
.ac-icon { font-size: 1rem; }
.ac-value {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.3rem);
  font-weight: 700;
  color: var(--color-gold-bright);
}

.concentration-badge {
  font-size: 1.3rem;
  filter: drop-shadow(0 0 6px var(--tv-info-border));
}

/* HP Section */
.hp-section { display: flex; flex-direction: column; gap: 0.5rem; }
.hp-numbers { display: flex; align-items: baseline; gap: 0.3rem; }
.hp-current {
  font-family: var(--font-heading);
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 900;
  line-height: 1;
  transition: color 0.4s;
}
.hp-separator { font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-border); }
.hp-max { font-family: var(--font-heading); font-size: 1.3rem; color: var(--color-text-dim); }
.hp-label {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-left: 0.25rem;
}
.hp-temp {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tv-info-text);
  margin-left: 0.45rem;
}

.hp-track {
  height: 14px;
  background: var(--tv-track-bg);
  border-radius: 7px;
  overflow: hidden;
}
.hp-fill {
  height: 100%;
  border-radius: 7px;
  transition: width 0.6s ease, background 0.6s ease;
  box-shadow: 0 0 10px currentColor;
}

/* Conditions row */
.conditions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.condition-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading);
  font-size: clamp(0.75rem, 1.4vw, 1rem);
  letter-spacing: 0.05em;
  color: var(--tv-warning-text);
  background: var(--tv-warning-bg);
  border: 1px solid var(--tv-warning-border);
  border-radius: 20px;
  padding: 0.24rem 0.7rem;
  white-space: nowrap;
}

/* HP floating delta */
.hp-delta {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-title);
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 900;
  pointer-events: none;
  text-shadow: 0 2px 10px var(--color-shadow);
  z-index: 10;
}
.hp-delta-damage {
  color: var(--tv-danger-text);
  text-shadow: 0 0 20px var(--tv-danger-bg), 0 2px 8px var(--color-shadow);
}
.hp-delta-heal {
  color: var(--tv-success-text);
  text-shadow: 0 0 20px var(--tv-success-bg), 0 2px 8px var(--color-shadow);
}

/* Transition for HP delta float-up */
.hp-float-enter-active {
  animation: floatUp 2s ease-out forwards;
}
.hp-float-leave-active {
  display: none;
}
@keyframes floatUp {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
  20%  { opacity: 1; transform: translate(-50%, -70%) scale(1.1); }
  70%  { opacity: 0.8; transform: translate(-50%, -100%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -130%) scale(0.9); }
}

/* ── Vote mode ────────────────────────────────────────────────────────── */
.vote-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}
.vote-question {
  font-family: var(--font-title);
  font-size: clamp(1.5rem, 4vw, 3rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  text-align: center;
  margin: 0;
}
.vote-progress {
  font-family: var(--font-heading);
  font-size: clamp(0.9rem, 2vw, 1.3rem);
  letter-spacing: 0.15em;
  color: var(--color-parchment-dark);
}
.vote-results {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.vote-option {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.vote-option-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.vote-option-label {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.4rem);
  color: var(--color-parchment);
}
.vote-option-count {
  font-family: var(--font-heading);
  font-size: clamp(0.85rem, 1.5vw, 1.1rem);
  color: var(--color-gold);
}
.vote-bar {
  height: 24px;
  background: var(--tv-track-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}
.vote-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  border-radius: 12px;
  transition: width 0.8s ease;
  box-shadow: var(--shadow-soft);
}
.voter-names {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-text-dim);
  font-style: italic;
}
.vote-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}
.vote-orb {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid var(--color-gold-dark);
  border-top-color: var(--color-gold-bright);
  animation: spin 1.5s linear infinite;
  box-shadow: var(--shadow-soft);
}
.vote-waiting p {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.4rem);
  letter-spacing: 0.2em;
  color: var(--color-parchment);
}

/* ── Doom mode ────────────────────────────────────────────────────────── */
.doom-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}
.doom-title {
  font-family: var(--font-title);
  font-size: clamp(2rem, 5vw, 4rem);
  letter-spacing: 0.12em;
  color: var(--color-gold-bright);
  text-transform: uppercase;
  margin: 0;
}
.doom-timer {
  font-family: var(--font-title);
  font-size: clamp(5rem, 16vw, 13rem);
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--color-parchment);
  text-shadow: var(--text-shadow-accent);
}
.doom-timer.danger {
  color: var(--tv-danger-text);
  animation: doomPulse 0.75s infinite;
}
@keyframes doomPulse {
  0%, 100% { transform: scale(1); text-shadow: 0 0 20px var(--tv-danger-bg); }
  50% { transform: scale(1.03); text-shadow: 0 0 45px var(--tv-danger-bg); }
}

/* ── Tension mode ─────────────────────────────────────────────────────── */
.tension-display {
  --tension-color: var(--tv-warning-text);
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
}
.tension-title {
  font-family: var(--font-title);
  font-size: clamp(1.6rem, 4vw, 3rem);
  color: var(--color-gold-bright);
  margin: 0;
}
.tension-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 0.6rem;
  width: min(980px, 100%);
}
.tension-step {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  text-align: center;
  padding: 0.55rem 0;
  font-family: var(--font-heading);
  color: var(--color-text-dim);
  background: var(--tv-control-bg-muted);
}
.tension-step.active {
  color: var(--color-parchment);
  border-color: var(--tension-color);
  background: color-mix(in oklab, var(--tension-color) 25%, black);
  box-shadow: 0 0 16px color-mix(in oklab, var(--tension-color) 50%, transparent);
}
/* In light theme the active step background is always dark (mixed with black),
   so force a light text color for readable contrast. */
:root[data-theme='light'] .tension-step.active {
  color: #f0e6c8;
}
.tension-core {
  position: relative;
  width: clamp(180px, 30vw, 290px);
  height: clamp(180px, 30vw, 290px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tension-pulse-wrap {
  position: absolute;
  inset: 0;
}
.tension-pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 4px solid var(--tension-color);
  box-shadow: 0 0 35px color-mix(in oklab, var(--tension-color) 55%, transparent);
  animation: tensionPulse 1.25s infinite;
}
.tension-level {
  position: relative;
  font-family: var(--font-title);
  font-size: clamp(3rem, 8vw, 6rem);
  line-height: 1;
  color: var(--tension-color);
  text-shadow: 0 0 25px color-mix(in oklab, var(--tension-color) 45%, transparent);
}
.tension-level span {
  font-size: 0.35em;
  color: var(--color-text-dim);
}
.tension-pulse-wrap.shake-soft { animation: shakeSoft 0.32s infinite; }
.tension-pulse-wrap.shake-medium { animation: shakeMedium 0.2s infinite; }
.tension-pulse-wrap.shake-hard { animation: shakeHard 0.12s infinite; }
@keyframes tensionPulse {
  0% { transform: scale(0.96); opacity: 0.55; }
  70% { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(1.09); opacity: 0.2; }
}
@keyframes shakeSoft {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(1px, -1px); }
}
@keyframes shakeMedium {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-2px, 1px); }
  75% { transform: translate(2px, -1px); }
}
@keyframes shakeHard {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-3px, 2px); }
  40% { transform: translate(3px, -2px); }
  60% { transform: translate(-2px, -1px); }
  80% { transform: translate(2px, 1px); }
}

/* ── Image mode ───────────────────────────────────────────────────────── */
.image-display {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.tv-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

/* ── Map mode ─────────────────────────────────────────────────────────── */
.map-display {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #000;
}
.map-image {
  position: absolute;
  max-width: none;
  display: block;
  z-index: 1;
  user-select: none;
  pointer-events: none;
}
.map-fog-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}
/* ── Token layer ── */
.map-tokens-layer {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 3;
  pointer-events: none;
}
.map-token-placed {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  transform: translate(-50%, -50%);
}
.token-circle {
  width: 84px; height: 84px;
  border-radius: 50%;
  border: 4px solid #c9a227;
  overflow: hidden;
  background: #1a1230;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 20px rgba(0,0,0,0.9), 0 0 12px rgba(201,162,39,0.5);
  flex-shrink: 0;
}
.token-avatar-img {
  width: 100%; height: 100%; object-fit: cover;
}
.token-initial-letter {
  font-family: var(--font-heading);
  font-size: 2.4rem;
  color: #c9a227;
  font-weight: 700;
  line-height: 1;
}
.token-label {
  font-family: var(--font-heading);
  font-size: clamp(0.6rem, 1.2vw, 0.85rem);
  color: #fff;
  text-shadow: 0 1px 4px #000, 0 0 8px #000;
  letter-spacing: 0.06em;
  text-align: center;
  white-space: nowrap;
  background: rgba(0,0,0,0.55);
  padding: 1px 6px;
  border-radius: 4px;
}

/* ── Merchant mode ────────────────────────────────────────────────────── */
.merchant-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2rem;
  box-sizing: border-box;
}
.merchant-header {
  text-align: center;
}
.merchant-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}
.merchant-name {
  font-family: var(--font-title);
  font-size: clamp(2rem, 4vw, 3.5rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.08em;
  margin: 0;
}
.merchant-desc {
  font-family: var(--font-heading);
  font-size: clamp(0.7rem, 1.5vw, 1rem);
  letter-spacing: 0.15em;
  color: var(--color-text-dim);
  margin-top: 0.5rem;
}
.merchant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.merchant-item {
  background: linear-gradient(160deg, var(--color-surface-soft) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.2s;
}
.merchant-item:not(.out-of-stock):hover {
  border-color: var(--color-gold-dark);
}
.merchant-item.out-of-stock {
  opacity: 0.45;
  filter: grayscale(0.5);
}
.item-category {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.item-name {
  font-family: var(--font-heading);
  font-size: clamp(1rem, 2vw, 1.3rem);
  color: var(--color-parchment);
  letter-spacing: 0.04em;
}
.item-desc {
  font-family: var(--font-body);
  font-size: clamp(0.8rem, 1.5vw, 1rem);
  color: var(--color-text-dim);
  line-height: 1.4;
  margin: 0;
  flex: 1;
}
.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.25rem;
}
.item-price {
  font-family: var(--font-title);
  font-size: clamp(1.4rem, 3vw, 2rem);
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
}
.item-stock {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  background: var(--tv-control-bg);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 0.2rem 0.65rem;
}
.item-stock.unlimited { color: var(--color-gold-dark); border-color: var(--color-gold-dark); }
.item-stock.empty { color: var(--tv-danger-text); border-color: var(--tv-danger-border); background: var(--tv-danger-bg); }

/* ── Mode transition ─────────────────────────────────────────────────── */
.tv-mode-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.tv-mode-enter-active {
  transition: opacity 0.4s ease;
}
.tv-mode-leave-active {
  transition: opacity 0.25s ease;
}
.tv-mode-enter-from,
.tv-mode-leave-to {
  opacity: 0;
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.tv-footer {
  text-align: center;
  margin-top: 2rem;
}
.footer-text {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  opacity: 0.7;
}

/* ── Demo banner ─────────────────────────────────────────────────────── */
.tv-demo-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9000;
  text-align: center;
  padding: 0.3rem 1rem;
  background: rgba(146, 64, 14, 0.75);
  color: #fef3c7;
  font-family: var(--font-heading, sans-serif);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  backdrop-filter: blur(4px);
  border-top: 1px solid rgba(245, 158, 11, 0.4);
}
</style>
