<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'

const tvMode = ref('lobby')
const activeDoomClock = ref(null)
const doomTitle = ref('Doom Clock')
const doomMinutes = ref(2)
const doomSeconds = ref(0)
const controlError = ref('')
const now = ref(Date.now())
const activeTensionScale = ref(null)
const tensionTitle = ref('Échelle de tension')
const tensionSteps = ref(6)
const tensionDirection = ref('ascending')
const tensionVibration = ref(false)
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

function createTensionScale() {
  const socket = getSocket()
  socket.emit('create-tension-scale', {
    sessionId: sessionStore.activeSession.id,
    title: tensionTitle.value,
    steps: tensionSteps.value,
    direction: tensionDirection.value,
    vibrationEnabled: tensionVibration.value,
  })
}

function incrementTensionScale(delta) {
  const socket = getSocket()
  socket.emit('increment-tension-scale', { sessionId: sessionStore.activeSession.id, delta })
}

function endTensionScale() {
  const socket = getSocket()
  socket.emit('end-tension-scale', { sessionId: sessionStore.activeSession.id })
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

const tensionRatio = computed(() => {
  if (!activeTensionScale.value?.steps) return 0
  const direction = activeTensionScale.value.direction || 'ascending'
  const progress = direction === 'descending'
    ? (activeTensionScale.value.steps - activeTensionScale.value.level) / activeTensionScale.value.steps
    : activeTensionScale.value.level / activeTensionScale.value.steps
  return Math.round(Math.max(0, Math.min(1, progress)) * 100)
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
  activeTensionScale.value = data.tensionScale || null
  activeTimeScale.value = data.timeScale || null
  combatRound.value = data.combatRound || 0
  activeTimer.value = data.timer || null
  if (data.tensionScale) {
    tensionDirection.value = data.tensionScale.direction || 'ascending'
    tensionVibration.value = !!data.tensionScale.vibrationEnabled
  }
}

function handleDoomClockStarted(data) {
  activeDoomClock.value = data
}

function handleDoomClockStopped() {
  activeDoomClock.value = null
}

function handleTensionScaleUpdated(data) {
  activeTensionScale.value = data
  tensionDirection.value = data.direction || 'ascending'
  tensionVibration.value = !!data.vibrationEnabled
}

function handleTensionScaleEnded() {
  activeTensionScale.value = null
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
})
</script>

<template>
  <div class="tv-controls">
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
      <h2 class="section-title"><AppIcon icon="lucide:trending-up" size="0.9em" /> Échelle de tension <HelpTip id="tv.tension-scale" /></h2>
      <div class="form-row">
        <input v-model="tensionTitle" class="form-input" type="text" placeholder="Titre de l'échelle" />
      </div>
      <div class="form-row split">
        <input v-model.number="tensionSteps" class="form-input" type="number" min="2" max="20" placeholder="Étapes" />
        <select v-model="tensionDirection" class="form-input">
          <option value="ascending">Croissant</option>
          <option value="descending">Décroissant</option>
        </select>
      </div>
      <div class="form-row">
        <label class="checkbox-label"><input v-model="tensionVibration" type="checkbox" /> Vibration</label>
      </div>
      <div class="inline-actions">
        <button class="action-btn" data-testid="tension-create-btn" @click="createTensionScale">{{ activeTensionScale ? 'Recréer' : 'Créer' }}</button>
        <button class="action-btn danger-btn" data-testid="tension-end-btn" :disabled="!activeTensionScale" @click="endTensionScale">Terminer</button>
      </div>
      <div v-if="activeTensionScale" class="tension-adjust-row">
        <button class="action-btn tension-delta-btn" @click="incrementTensionScale(-5)">−5</button>
        <button class="action-btn tension-delta-btn" @click="incrementTensionScale(-1)">−1</button>
        <button class="action-btn tension-delta-btn" @click="incrementTensionScale(1)">+1</button>
        <button class="action-btn tension-delta-btn" @click="incrementTensionScale(5)">+5</button>
      </div>
      <p v-if="activeTensionScale" class="status-line">
        {{ activeTensionScale.title }} — {{ activeTensionScale.level }} / {{ activeTensionScale.steps }} ({{ tensionRatio }}%)
      </p>
      <p v-if="controlError" class="error-line">{{ controlError }}</p>
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
  </div>
</template>

<style scoped>
.tv-controls { display: flex; flex-direction: column; gap: 1rem; }
.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.inline-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }
.tension-adjust-row { display: flex; gap: 0.45rem; align-items: center; margin-top: 0.3rem; }
.tension-delta-input { width: 4rem; text-align: center; flex: 0 0 auto; }
.tension-delta-btn { flex: 1; font-weight: 700; }
.round-display {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.1rem;
  color: var(--color-gold-bright);
  text-align: center;
  padding: 0.3rem 0;
}
.round-display strong {
  font-size: 1.5rem;
}
.form-row { display: flex; gap: 0.45rem; }
.form-row.split > * { flex: 1; }
.form-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--admin-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
}
.action-btn {
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-btn { border-color: var(--admin-danger-border, var(--color-danger-border)); color: var(--admin-danger-text, var(--color-danger)); background: var(--gradient-danger-action); }
.status-line {
  margin: 0;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
}
.error-line {
  margin: 0;
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--admin-danger-text, var(--color-danger));
}
.labeled-input { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; }
.input-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.hint-line {
  margin: 0;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  color: var(--color-text-dim);
}
.warn-hint { color: var(--admin-danger-text, var(--color-danger)); }
.rest-btn { border-color: var(--color-success, #4ade80); color: var(--color-success, #4ade80); }
</style>
