<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import { TV_WIDGETS, DASHBOARD_LAYOUTS, DASHBOARD_SLOT_LABELS, gaugeWidgetType } from '@/utils/tvWidgets.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'

const tvMode = ref('lobby')
const activeDoomClock = ref(null)
const doomTitle = ref('Doom Clock')
const doomMinutes = ref(2)
const doomSeconds = ref(0)
const controlError = ref('')
const now = ref(Date.now())
// Jauge (dashboard_gauges) actuellement montrée en plein écran (tv_mode = 'tension'),
// s'il y en a une — remplace l'ancienne échelle de tension singleton. null si aucune
// jauge n'est en plein écran (peu importe si des jauges existent par ailleurs, voir
// section « Jauges » plus bas).
const fullscreenGauge = ref(null)
let clockTickInterval = null

// ── Time scale ────────────────────────────────────────────────────────────
const activeTimeScale = ref(null)
const timescaleTitle = ref('Journée')
const timescaleTotalHours = ref(24)
const timescaleSlotCount = ref(6)
const timescaleRestSlots = ref(2)

// ── Combat round ──────────────────────────────────────────────────────────
const combatRound = ref(0)

// ── Free timer ────────────────────────────────────────────────────────────
const timerLabel = ref('Minuteur')
const timerMinutes = ref(5)
const timerSeconds = ref(0)
const activeTimer = ref(null)

// ── Vue dynamique (dashboard) ──────────────────────────────────────────────
// activeDashboard reflète l'état enregistré côté serveur ({ layout, slots }) ; les refs
// dashboardLayoutChoice/dashboardSlotChoices sont l'état d'édition local du formulaire,
// resynchronisé depuis activeDashboard à chaque snapshot/mise à jour (voir
// syncDashboardEditorFromActive) pour ne jamais diverger silencieusement de ce qui est
// réellement affiché sur la TV.
const activeDashboard = ref(null)
const dashboardLayoutChoice = ref(DASHBOARD_LAYOUTS[0].key)
const dashboardSlotChoices = ref({})

const dashboardLayoutSlots = computed(() => (
  DASHBOARD_LAYOUTS.find(l => l.key === dashboardLayoutChoice.value)?.slots || []
))

function syncDashboardEditorFromActive() {
  if (activeDashboard.value?.layout) dashboardLayoutChoice.value = activeDashboard.value.layout
  const map = {}
  ;(activeDashboard.value?.slots || []).forEach(s => { map[s.slot] = s.widgetType || '' })
  dashboardSlotChoices.value = map
}

function applyDashboard() {
  const socket = getSocket()
  const slots = dashboardLayoutSlots.value.map(slotKey => ({
    slot: slotKey,
    widgetType: dashboardSlotChoices.value[slotKey] || null,
  }))
  socket.emit('set-dashboard-layout', {
    sessionId: sessionStore.activeSession.id,
    layout: dashboardLayoutChoice.value,
    slots,
  })
}

function endDashboard() {
  const socket = getSocket()
  socket.emit('end-dashboard', { sessionId: sessionStore.activeSession.id })
}

// ── Jauges (dashboard_gauges) ─────────────────────────────────────────────
// Une session peut avoir plusieurs jauges nommées indépendantes — ex. « Peur »
// croissante ET « Vagues du siège » décroissante en même temps, chacune assignable à
// une cellule du dashboard via `gauge:<id>` (voir tvWidgets.js) ET/OU affichable seule
// en plein écran (showGaugeFullscreen/fullscreenGauge, un seul écran plein à la fois).
// C'est la même ressource dans les deux cas : un seul chemin d'ajustement
// (incrementGauge/increment-dashboard-gauge) quel que soit où elle est montrée.
const dashboardGauges = ref([])
const gaugeTitle = ref('Jauge')
const gaugeSteps = ref(6)
const gaugeDirection = ref('ascending')
const gaugeVibration = ref(false)

function createGauge() {
  const socket = getSocket()
  socket.emit('create-dashboard-gauge', {
    sessionId: sessionStore.activeSession.id,
    title: gaugeTitle.value,
    steps: gaugeSteps.value,
    direction: gaugeDirection.value,
    vibrationEnabled: gaugeVibration.value,
  })
}

function incrementGauge(gaugeId, delta) {
  const socket = getSocket()
  socket.emit('increment-dashboard-gauge', { sessionId: sessionStore.activeSession.id, gaugeId, delta })
}

function deleteGauge(gaugeId) {
  const socket = getSocket()
  socket.emit('delete-dashboard-gauge', { sessionId: sessionStore.activeSession.id, gaugeId })
}

function showGaugeFullscreen(gaugeId) {
  const socket = getSocket()
  socket.emit('show-gauge-fullscreen', { sessionId: sessionStore.activeSession.id, gaugeId })
}

function hideGaugeFullscreen() {
  const socket = getSocket()
  socket.emit('hide-gauge-fullscreen', { sessionId: sessionStore.activeSession.id })
}

function gaugeRatio(gauge) {
  if (!gauge?.steps) return 0
  const progress = gauge.direction === 'descending'
    ? (gauge.steps - gauge.level) / gauge.steps
    : gauge.level / gauge.steps
  return Math.round(Math.max(0, Math.min(1, progress)) * 100)
}

function setMode(mode) {
  const socket = getSocket()
  socket.emit('set-tv-mode', { sessionId: sessionStore.activeSession.id, mode })
}

function startDoomClock() {
  const socket = getSocket()
  const durationSeconds = (Math.max(0, parseInt(doomMinutes.value) || 0) * 60) + (Math.max(0, parseInt(doomSeconds.value) || 0))
  if (durationSeconds <= 0) return
  socket.emit('start-doom-clock', {
    sessionId: sessionStore.activeSession.id,
    title: doomTitle.value,
    durationSeconds,
  })
}

function stopDoomClock() {
  const socket = getSocket()
  socket.emit('stop-doom-clock', { sessionId: sessionStore.activeSession.id })
}

// ── Time scale functions ──────────────────────────────────────────────────
function createTimeScale() {
  const socket = getSocket()
  socket.emit('create-time-scale', {
    sessionId: sessionStore.activeSession.id,
    title: timescaleTitle.value,
    totalHours: timescaleTotalHours.value,
    slotCount: timescaleSlotCount.value,
    restSlots: timescaleRestSlots.value,
  })
}

function advanceTimeScale(delta = 1) {
  const socket = getSocket()
  socket.emit('advance-time-scale', { sessionId: sessionStore.activeSession.id, delta })
}

function longRestTimeScale() {
  const socket = getSocket()
  socket.emit('long-rest-time-scale', { sessionId: sessionStore.activeSession.id })
}

function endTimeScale() {
  const socket = getSocket()
  socket.emit('end-time-scale', { sessionId: sessionStore.activeSession.id })
}

// ── Round counter functions ───────────────────────────────────────────────
function adjustRound(delta) {
  const socket = getSocket()
  const newRound = Math.max(0, combatRound.value + delta)
  socket.emit('set-combat-round', { sessionId: sessionStore.activeSession.id, round: newRound })
}

function resetRound() {
  const socket = getSocket()
  socket.emit('set-combat-round', { sessionId: sessionStore.activeSession.id, round: 0 })
}

// ── Free timer functions ──────────────────────────────────────────────────
function startTimer() {
  const socket = getSocket()
  const durationSeconds = (Math.max(0, parseInt(timerMinutes.value) || 0) * 60) + (Math.max(0, parseInt(timerSeconds.value) || 0))
  if (durationSeconds <= 0) return
  socket.emit('start-timer', {
    sessionId: sessionStore.activeSession.id,
    label: timerLabel.value,
    durationSeconds,
  })
}

function stopTimer() {
  const socket = getSocket()
  socket.emit('stop-timer', { sessionId: sessionStore.activeSession.id })
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

const timescaleSlotHours = computed(() => {
  const ts = activeTimeScale.value
  if (ts) return ts.slotHours
  const slots = timescaleSlotCount.value || 1
  return (timescaleTotalHours.value || 0) / slots
})

const timescaleCanRest = computed(() => {
  const ts = activeTimeScale.value
  if (!ts) return false
  return !ts.restTaken && ts.elapsedSlots + ts.restSlots <= ts.slotCount
})

const timescaleRestHours = computed(() => {
  const ts = activeTimeScale.value
  if (ts) return ts.restSlots * ts.slotHours
  return timescaleRestSlots.value * timescaleSlotHours.value
})

const timescaleStatusLabel = computed(() => {
  const ts = activeTimeScale.value
  if (!ts) return ''
  const elapsedH = ts.elapsedSlots * ts.slotHours
  return `${ts.title} — ${elapsedH}h / ${ts.totalHours}h (palier ${ts.elapsedSlots}/${ts.slotCount})`
})

function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  tvMode.value = data.tvMode || 'lobby'
  activeDoomClock.value = data.doomClock || null
  fullscreenGauge.value = data.tensionScale || null
  activeTimeScale.value = data.timeScale || null
  combatRound.value = data.combatRound || 0
  activeTimer.value = data.timer || null
  activeDashboard.value = data.dashboard || null
  dashboardGauges.value = Array.isArray(data.dashboardGauges) ? data.dashboardGauges : []
  syncDashboardEditorFromActive()
}

function handleDoomClockStarted(data) {
  activeDoomClock.value = data
}

function handleDoomClockStopped() {
  activeDoomClock.value = null
}

function handleTensionScaleUpdated(gauge) {
  fullscreenGauge.value = gauge
}

function handleTensionScaleEnded() {
  fullscreenGauge.value = null
}

function handleTvControlError({ message }) {
  controlError.value = message || 'Erreur lors de la mise à jour TV.'
  window.setTimeout(() => { controlError.value = '' }, 3000)
}

function handleRoundUpdated({ round }) {
  combatRound.value = round
}

function handleTimerUpdated(data) {
  activeTimer.value = data
}

function handleTimerStopped() {
  activeTimer.value = null
}

function handleTimeScaleUpdated(data) {
  activeTimeScale.value = data
}

function handleTimeScaleEnded() {
  activeTimeScale.value = null
}

function handleDashboardUpdated(data) {
  activeDashboard.value = data
  syncDashboardEditorFromActive()
}

function handleDashboardEnded() {
  activeDashboard.value = null
}

function handleDashboardGaugeCreated(gauge) {
  dashboardGauges.value = [...dashboardGauges.value, gauge]
}

function handleDashboardGaugeUpdated(gauge) {
  const idx = dashboardGauges.value.findIndex(g => g.id === gauge.id)
  if (idx !== -1) dashboardGauges.value = dashboardGauges.value.map((g, i) => (i === idx ? gauge : g))
  // La jauge ajustée peut être celle actuellement en plein écran — même ressource, un
  // seul chemin d'ajustement (increment-dashboard-gauge) quel que soit son mode d'affichage.
  if (fullscreenGauge.value?.id === gauge.id) fullscreenGauge.value = gauge
}

function handleDashboardGaugeDeleted({ gaugeId }) {
  dashboardGauges.value = dashboardGauges.value.filter(g => g.id !== gaugeId)
  if (fullscreenGauge.value?.id === gaugeId) fullscreenGauge.value = null
}

onMounted(() => {
  clockTickInterval = window.setInterval(() => { now.value = Date.now() }, 1000)
  const socket = getSocket()
  socket.on('admin-state', handleAdminState)
  socket.on('doom-clock-started', handleDoomClockStarted)
  socket.on('doom-clock-stopped', handleDoomClockStopped)
  socket.on('tension-scale-updated', handleTensionScaleUpdated)
  socket.on('tension-scale-ended', handleTensionScaleEnded)
  socket.on('tv-control-error', handleTvControlError)
  socket.on('round-updated', handleRoundUpdated)
  socket.on('timer-updated', handleTimerUpdated)
  socket.on('timer-stopped', handleTimerStopped)
  socket.on('time-scale-updated', handleTimeScaleUpdated)
  socket.on('time-scale-ended', handleTimeScaleEnded)
  socket.on('dashboard-updated', handleDashboardUpdated)
  socket.on('dashboard-ended', handleDashboardEnded)
  socket.on('dashboard-gauge-created', handleDashboardGaugeCreated)
  socket.on('dashboard-gauge-updated', handleDashboardGaugeUpdated)
  socket.on('dashboard-gauge-deleted', handleDashboardGaugeDeleted)
  // TvControls mounts lazily (KeepAlive tab) — admin-state was already sent before mount.
  // Re-emit admin-join to get a fresh snapshot of doom/tension/timescale state.
  if (sessionStore.activeSession?.id) {
    socket.emit('admin-join', sessionStore.activeSession.id)
  }
})

onUnmounted(() => {
  if (clockTickInterval) window.clearInterval(clockTickInterval)
  const socket = getSocket()
  socket.off('admin-state', handleAdminState)
  socket.off('doom-clock-started', handleDoomClockStarted)
  socket.off('doom-clock-stopped', handleDoomClockStopped)
  socket.off('tension-scale-updated', handleTensionScaleUpdated)
  socket.off('tension-scale-ended', handleTensionScaleEnded)
  socket.off('tv-control-error', handleTvControlError)
  socket.off('round-updated', handleRoundUpdated)
  socket.off('timer-updated', handleTimerUpdated)
  socket.off('timer-stopped', handleTimerStopped)
  socket.off('time-scale-updated', handleTimeScaleUpdated)
  socket.off('time-scale-ended', handleTimeScaleEnded)
  socket.off('dashboard-updated', handleDashboardUpdated)
  socket.off('dashboard-ended', handleDashboardEnded)
  socket.off('dashboard-gauge-created', handleDashboardGaugeCreated)
  socket.off('dashboard-gauge-updated', handleDashboardGaugeUpdated)
  socket.off('dashboard-gauge-deleted', handleDashboardGaugeDeleted)
})
</script>

<template>
  <div class="tv-controls">
    <p v-if="controlError" class="error-line">{{ controlError }}</p>
    <section class="control-section">
      <h2 class="section-title"><AppIcon icon="game-icons:crossed-swords" size="0.9em" /> Rounds de combat <HelpTip id="tv.combat-round" /></h2>
      <div class="round-display">Round <strong>{{ combatRound }}</strong></div>
      <div class="inline-actions">
        <button class="action-btn" @click="adjustRound(-1)" :disabled="combatRound <= 0">−1</button>
        <button class="action-btn" @click="adjustRound(1)">+1</button>
        <button class="action-btn danger-btn" @click="resetRound">Réinitialiser</button>
      </div>
    </section>

    <section class="control-section">
      <h2 class="section-title"><AppIcon icon="lucide:timer" size="0.9em" /> Doom Clock <HelpTip id="tv.doom-clock" /></h2>
      <div class="form-row">
        <input v-model="doomTitle" class="form-input" type="text" placeholder="Titre du compte à rebours" />
      </div>
      <div class="form-row split">
        <div class="labeled-input">
          <label class="input-label">Minutes</label>
          <input v-model.number="doomMinutes" class="form-input" type="number" min="0" max="1440" />
        </div>
        <div class="labeled-input">
          <label class="input-label">Secondes</label>
          <input v-model.number="doomSeconds" class="form-input" type="number" min="0" max="59" />
        </div>
      </div>
      <div class="inline-actions">
        <button class="action-btn" @click="startDoomClock">Lancer</button>
        <button class="action-btn danger-btn" :disabled="!activeDoomClock" @click="stopDoomClock">Arrêter</button>
      </div>
      <p v-if="activeDoomClock" class="status-line">
        {{ activeDoomClock.title }} — {{ doomRemainingLabel }}
      </p>
    </section>

    <section class="control-section">
      <h2 class="section-title"><AppIcon icon="lucide:hourglass" size="0.9em" /> Minuteur libre <HelpTip id="tv.free-timer" /></h2>
      <div class="form-row">
        <input v-model="timerLabel" class="form-input" type="text" placeholder="Libellé du minuteur" data-testid="timer-label-input" />
      </div>
      <div class="form-row split">
        <div class="labeled-input">
          <label class="input-label">Minutes</label>
          <input v-model.number="timerMinutes" class="form-input" type="number" min="0" max="1440" data-testid="timer-minutes-input" />
        </div>
        <div class="labeled-input">
          <label class="input-label">Secondes</label>
          <input v-model.number="timerSeconds" class="form-input" type="number" min="0" max="59" data-testid="timer-seconds-input" />
        </div>
      </div>
      <div class="inline-actions">
        <button class="action-btn" @click="startTimer" data-testid="timer-start-btn">Démarrer</button>
        <button class="action-btn danger-btn" :disabled="!activeTimer" @click="stopTimer" data-testid="timer-stop-btn">Arrêter</button>
      </div>
      <p v-if="activeTimer" class="status-line">
        {{ activeTimer.label }} — {{ timerRemainingLabel }}
      </p>
    </section>

    <section class="control-section">
      <h2 class="section-title"><AppIcon icon="lucide:clock" size="0.9em" /> Échelle de temps <HelpTip id="tv.time-scale" /></h2>
      <div class="form-row">
        <input v-model="timescaleTitle" class="form-input" type="text" placeholder="Titre (ex: Journée)" />
      </div>
      <div class="form-row split">
        <div class="labeled-input">
          <label class="input-label">Durée totale (h)</label>
          <input v-model.number="timescaleTotalHours" class="form-input" type="number" min="1" max="168" />
        </div>
        <div class="labeled-input">
          <label class="input-label">Nb de paliers</label>
          <input v-model.number="timescaleSlotCount" class="form-input" type="number" min="2" max="24" />
        </div>
        <div class="labeled-input">
          <label class="input-label">Repos long (paliers)</label>
          <input v-model.number="timescaleRestSlots" class="form-input" type="number" min="1" :max="timescaleSlotCount" />
        </div>
      </div>
      <p class="hint-line">Palier = {{ timescaleSlotHours }}h · Repos long = {{ timescaleRestHours }}h</p>
      <div class="inline-actions">
        <button class="action-btn" @click="createTimeScale">{{ activeTimeScale ? 'Recréer' : 'Créer' }}</button>
        <button class="action-btn" :disabled="!activeTimeScale || !timescaleCanRest" @click="longRestTimeScale" :class="{ 'rest-btn': activeTimeScale && timescaleCanRest }">Repos long</button>
        <button class="action-btn danger-btn" :disabled="!activeTimeScale" @click="endTimeScale">Terminer</button>
      </div>
      <div v-if="activeTimeScale" class="tension-adjust-row">
        <button class="action-btn tension-delta-btn" :disabled="activeTimeScale.elapsedSlots <= 0" @click="advanceTimeScale(-5)">−5</button>
        <button class="action-btn tension-delta-btn" :disabled="activeTimeScale.elapsedSlots <= 0" @click="advanceTimeScale(-1)">−1</button>
        <button class="action-btn tension-delta-btn" :disabled="activeTimeScale.elapsedSlots >= activeTimeScale.slotCount" @click="advanceTimeScale(1)">+1</button>
        <button class="action-btn tension-delta-btn" :disabled="activeTimeScale.elapsedSlots >= activeTimeScale.slotCount" @click="advanceTimeScale(5)">+5</button>
      </div>
      <p v-if="activeTimeScale" class="status-line">{{ timescaleStatusLabel }}</p>
      <p v-if="activeTimeScale && activeTimeScale.restTaken" class="hint-line warn-hint">Repos long déjà pris.</p>
      <p v-else-if="activeTimeScale && !timescaleCanRest" class="hint-line warn-hint">Repos impossible — pas assez de temps.</p>
    </section>

    <section class="control-section">
      <h2 class="section-title"><AppIcon icon="lucide:gauge" size="0.9em" /> Jauges (vue dynamique) <HelpTip id="tv.dashboard-gauges" /></h2>
      <p class="hint-line">
        Plusieurs jauges nommées peuvent coexister — ex. « Peur » croissante et « Vagues du siège »
        décroissante en même temps — chacune assignable à une cellule de la vue dynamique ci-dessous, ou
        affichable seule en plein écran (une seule jauge en plein écran à la fois).
      </p>
      <div
        v-for="gauge in dashboardGauges"
        :key="gauge.id"
        class="gauge-row"
        :class="{ 'gauge-row-fullscreen': fullscreenGauge?.id === gauge.id }"
        :data-testid="`gauge-row-${gauge.id}`"
      >
        <div class="gauge-row-header">
          <span class="gauge-row-title">{{ gauge.title }}</span>
          <span class="gauge-row-level">{{ gauge.level }} / {{ gauge.steps }} ({{ gaugeRatio(gauge) }}%)</span>
          <button class="action-btn danger-btn gauge-row-delete" title="Supprimer" data-testid="gauge-delete-btn" @click="deleteGauge(gauge.id)">
            <AppIcon icon="lucide:trash-2" size="0.85em" />
          </button>
        </div>
        <div class="tension-adjust-row">
          <button class="action-btn tension-delta-btn" @click="incrementGauge(gauge.id, -5)">−5</button>
          <button class="action-btn tension-delta-btn" @click="incrementGauge(gauge.id, -1)">−1</button>
          <button class="action-btn tension-delta-btn" @click="incrementGauge(gauge.id, 1)">+1</button>
          <button class="action-btn tension-delta-btn" @click="incrementGauge(gauge.id, 5)">+5</button>
          <button
            v-if="fullscreenGauge?.id === gauge.id"
            class="action-btn danger-btn gauge-fullscreen-btn"
            data-testid="gauge-hide-fullscreen-btn"
            @click="hideGaugeFullscreen"
          >Quitter le plein écran</button>
          <button v-else class="action-btn gauge-fullscreen-btn" data-testid="gauge-fullscreen-btn" @click="showGaugeFullscreen(gauge.id)">Plein écran</button>
        </div>
      </div>
      <div class="form-row">
        <input v-model="gaugeTitle" class="form-input" type="text" placeholder="Titre de la jauge (ex: Peur)" />
      </div>
      <div class="form-row split">
        <input v-model.number="gaugeSteps" class="form-input" type="number" min="2" max="20" placeholder="Étapes" />
        <select v-model="gaugeDirection" class="form-input">
          <option value="ascending">Croissant</option>
          <option value="descending">Décroissant</option>
        </select>
      </div>
      <div class="form-row">
        <label class="checkbox-label"><input v-model="gaugeVibration" type="checkbox" /> Vibration</label>
      </div>
      <div class="inline-actions">
        <button class="action-btn" data-testid="gauge-create-btn" @click="createGauge">+ Nouvelle jauge</button>
      </div>
    </section>

    <section class="control-section">
      <h2 class="section-title"><AppIcon icon="lucide:layout-grid" size="0.9em" /> Vue dynamique <HelpTip id="tv.dashboard" /></h2>
      <p class="hint-line">
        Compose plusieurs widgets Rythme déjà actifs (jauges, minuteur…) sur la TV en une
        seule vue — remplace entièrement l'écran, ce n'est pas superposé aux autres modes.
      </p>
      <div class="form-row">
        <label class="input-label">Disposition</label>
        <select v-model="dashboardLayoutChoice" class="form-input" data-testid="dashboard-layout-select">
          <option v-for="l in DASHBOARD_LAYOUTS" :key="l.key" :value="l.key">{{ l.label }}</option>
        </select>
      </div>
      <div v-for="slotKey in dashboardLayoutSlots" :key="slotKey" class="form-row">
        <label class="input-label">{{ DASHBOARD_SLOT_LABELS[slotKey] }}</label>
        <select v-model="dashboardSlotChoices[slotKey]" class="form-input" :data-testid="`dashboard-slot-${slotKey}`">
          <option value="">— Aucun —</option>
          <option v-for="w in TV_WIDGETS" :key="w.key" :value="w.key">{{ w.label }}</option>
          <option v-for="g in dashboardGauges" :key="g.id" :value="gaugeWidgetType(g.id)">{{ g.title }}</option>
        </select>
      </div>
      <div class="inline-actions">
        <button class="action-btn" data-testid="dashboard-apply-btn" @click="applyDashboard">Afficher la vue dynamique</button>
        <button class="action-btn danger-btn" :disabled="!activeDashboard" @click="endDashboard">Fermer</button>
      </div>
      <p v-if="activeDashboard" class="status-line">
        Vue dynamique active — {{ DASHBOARD_LAYOUTS.find(l => l.key === activeDashboard.layout)?.label }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.tv-controls { display: flex; flex-direction: column; gap: var(--space-4); }
.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.inline-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.tension-adjust-row { display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-1); }
.tension-delta-input { width: 4rem; text-align: center; flex: 0 0 auto; }
.tension-delta-btn { flex: 1; font-weight: 700; }
.round-display {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.1rem;
  color: var(--color-gold-bright);
  text-align: center;
  padding: var(--space-1) 0;
}
.round-display strong {
  font-size: 1.5rem;
}
.form-row { display: flex; gap: var(--space-2); }
.form-row.split > * { flex: 1; }
.form-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--admin-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-base);
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
}
.action-btn {
  padding: var(--space-2) var(--space-3);
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-btn { border-color: var(--admin-danger-border, var(--color-danger-border)); color: var(--admin-danger-text, var(--color-danger)); background: var(--gradient-danger-action); }
.status-line {
  margin: 0;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
}
.error-line {
  margin: 0;
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--admin-danger-text, var(--color-danger));
}
.gauge-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.gauge-row-header { display: flex; align-items: center; gap: var(--space-2); }
.gauge-row-title { flex: 1; font-weight: 600; }
.gauge-row-level { font-variant-numeric: tabular-nums; color: var(--color-text-dim); }
.gauge-row-delete { padding: 0.2rem 0.5rem; }
.gauge-row-fullscreen { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.gauge-fullscreen-btn { margin-left: auto; }

.labeled-input { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; }
.input-label {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.hint-line {
  margin: 0;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  color: var(--color-text-dim);
}
.warn-hint { color: var(--admin-danger-text, var(--color-danger)); }
.rest-btn { border-color: var(--color-success, #4ade80); color: var(--color-success, #4ade80); }
</style>
