<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { authStore } from '../../stores/auth.js'
import { getSocket } from '../../socket.js'
import meleeTable from '../../assets/melee.json'
import distanceTable from '../../assets/distance.json'
import magiqueTable from '../../assets/magique.json'
import AppIcon from '../AppIcon.vue'

const combatType = ref('melee')
const isRolling = ref(false)
const diceValue = ref(null)
const result = ref(null)
const animatedDice = ref(null)
const showResult = ref(false)
const sendFeedback = ref('')
const selectedPlayerId = ref('all')
const hasConnectedPlayers = computed(() => sessionStore.players.length > 0)

const ANIM_DURATION_KEY = 'criticalFail-animDuration'
const animDuration = ref(parseFloat(localStorage.getItem(ANIM_DURATION_KEY) ?? '2'))

function saveAnimDuration() {
  localStorage.setItem(ANIM_DURATION_KEY, String(animDuration.value))
}

const tables = {
  melee: meleeTable,
  distance: distanceTable,
  magique: magiqueTable
}

const combatTypes = [
  { key: 'melee',    label: 'Mêlée',    icon: 'game-icons:crossed-swords' },
  { key: 'distance', label: 'Distance', icon: 'game-icons:arrow-cluster' },
  { key: 'magique',  label: 'Magique',  icon: 'game-icons:crystal-ball' },
]

function selectType(type) {
  if (isRolling.value) return
  combatType.value = type
  result.value = null
  diceValue.value = null
  showResult.value = false
}

function getResult(roll, table) {
  return table.find(entry => roll >= entry.min && roll <= entry.max) || null
}

async function rollDice() {
  if (isRolling.value) return
  isRolling.value = true
  showResult.value = false
  result.value = null

  const finalRoll = Math.floor(Math.random() * 100) + 1

  // baseline total ≈ 1770ms (sum of 30+i*2 for i=0..29)
  const speedFactor = (animDuration.value * 1000) / 1770
  let steps = 30
  for (let i = 0; i < steps; i++) {
    animatedDice.value = Math.floor(Math.random() * 100) + 1
    await new Promise(r => setTimeout(r, (30 + i * 2) * speedFactor))
  }

  animatedDice.value = finalRoll
  diceValue.value = finalRoll

  await new Promise(r => setTimeout(r, 400 * speedFactor))

  const found = getResult(finalRoll, tables[combatType.value])
  result.value = found ? found.result : 'Résultat introuvable.'

  await new Promise(r => setTimeout(r, 100 * speedFactor))
  showResult.value = true
  isRolling.value = false
}

function sendToPlayers() {
  if (!sessionStore.activeSession) {
    sendFeedback.value = 'Aucune session active.'
    setTimeout(() => { sendFeedback.value = '' }, 3000)
    return
  }
  if (!diceValue.value || !result.value) {
    sendFeedback.value = 'Lancez les dés d\'abord.'
    setTimeout(() => { sendFeedback.value = '' }, 3000)
    return
  }
  if (!hasConnectedPlayers.value) {
    sendFeedback.value = 'Aucun joueur connecté.'
    setTimeout(() => { sendFeedback.value = '' }, 3000)
    return
  }

  const socket = getSocket(authStore.token)
  socket.emit('send-dice-result', {
    sessionId: sessionStore.activeSession.id,
    combatType: combatType.value,
    rollValue: diceValue.value,
    resultText: result.value,
    toPlayerId: selectedPlayerId.value === 'all' ? null : parseInt(selectedPlayerId.value),
  })

  const target = selectedPlayerId.value === 'all'
    ? 'tous les joueurs'
    : sessionStore.players.find(p => p.id === parseInt(selectedPlayerId.value))?.player_name || 'joueur'
  sendFeedback.value = `Résultat envoyé à ${target} !`
  setTimeout(() => { sendFeedback.value = '' }, 3000)
}

const typeLabel = computed(() => {
  return combatTypes.find(t => t.key === combatType.value)?.label || ''
})

function handleSendError(data) {
  sendFeedback.value = data?.message || "Erreur lors de l'envoi."
  setTimeout(() => { sendFeedback.value = '' }, 3000)
}

onMounted(() => {
  const socket = getSocket(authStore.token)
  socket.on('send-error', handleSendError)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('send-error', handleSendError)
})
</script>

<template>
  <div class="critical-fail-tool" :class="'theme-' + combatType">
    <section class="type-selector">
      <p class="selector-label">Type d'attaque</p>
      <div class="type-buttons">
        <button
          v-for="type in combatTypes"
          :key="type.key"
          class="type-btn"
          :class="{ active: combatType === type.key }"
          @click="selectType(type.key)"
          :disabled="isRolling"
        >
          <AppIcon :icon="type.icon" class="type-icon" />
          <span class="type-name">{{ type.label }}</span>
        </button>
      </div>
    </section>

    <section class="anim-settings">
      <label class="anim-label">
        <span class="anim-label-text">Durée de l'animation</span>
        <span class="anim-value">{{ animDuration.toFixed(1) }}s</span>
      </label>
      <input
        type="range"
        class="anim-slider"
        v-model.number="animDuration"
        min="0"
        max="3"
        step="0.1"
        :disabled="isRolling"
        @change="saveAnimDuration"
      />
    </section>

    <section class="dice-section">
      <div class="dice-container">
        <div class="dice-d100" :class="{ rolling: isRolling, landed: diceValue !== null && !isRolling }">
          <div class="dice-inner">
            <div class="dice-face">
              <span v-if="animatedDice !== null" class="dice-number">{{ animatedDice }}</span>
              <span v-else class="dice-number dice-placeholder">%</span>
            </div>
            <div class="dice-label">d100</div>
          </div>
        </div>
      </div>

      <button
        class="roll-btn"
        @click="rollDice"
        :disabled="isRolling"
        :class="{ rolling: isRolling }"
      >
        <span class="roll-btn-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="1.2rem" /></span>
        <span class="roll-btn-text">{{ isRolling ? 'Lancement...' : 'Lancer les dés' }}</span>
      </button>
    </section>

    <section class="result-section" v-if="diceValue !== null">
      <div class="result-card" :class="{ visible: showResult }">
        <p class="result-text">{{ result }}</p>
        <div class="result-footer">
          <span class="result-type-badge">{{ typeLabel }}</span>
        </div>
      </div>

      <div v-if="showResult" class="send-section">
        <div class="recipient-row">
          <select v-model="selectedPlayerId" class="recipient-select" :disabled="!hasConnectedPlayers">
            <option v-if="hasConnectedPlayers" value="all">Tous les joueurs</option>
            <option v-else value="" disabled>Aucun joueur connecté</option>
            <option v-for="p in sessionStore.players" :key="p.id" :value="p.id">
              {{ p.player_name }}
            </option>
          </select>
          <button class="send-btn" data-testid="dice-send-btn" @click="sendToPlayers" :disabled="!sessionStore.activeSession || !hasConnectedPlayers">
            <AppIcon icon="lucide:send" size="0.9em" /> Envoyer
          </button>
        </div>
        <p v-if="sendFeedback" class="send-feedback">{{ sendFeedback }}</p>
        <p v-if="!sessionStore.activeSession" class="no-session-hint">
          Aucune session active — créez une session dans l'onglet Sessions.
        </p>
        <p v-else-if="!hasConnectedPlayers" class="no-session-hint">
          Aucun joueur connecté dans cette session.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.critical-fail-tool {
  padding-bottom: 2rem;
}

.type-selector {
  padding: 0.5rem 0 1rem;
}

.selector-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  text-align: center;
  margin-bottom: 0.75rem;
}

.type-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.type-btn {
  flex: 1;
  max-width: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.75rem 0.5rem;
  background: linear-gradient(160deg, var(--color-surface-soft) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-dim);
  cursor: pointer;
  transition: all 0.25s ease;
  font-family: var(--font-heading);
  position: relative;
  overflow: hidden;
}

.type-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, var(--surface-gold-soft) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.25s;
}

.type-btn:hover:not(:disabled)::before,
.type-btn.active::before {
  opacity: 1;
}

.type-btn.active {
  border-color: var(--theme-accent, var(--color-gold-dark));
  color: var(--theme-accent-light, var(--color-gold-bright));
  box-shadow: 0 0 16px var(--theme-glow, var(--combat-melee-glow)), inset 0 0 8px var(--surface-gold-soft);
}

.type-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.type-icon {
  font-size: 1.5rem;
}

.type-name {
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.anim-settings {
  padding: 0 0 1rem;
}

.anim-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}

.anim-label-text {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.anim-value {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  color: var(--color-gold-bright);
  min-width: 2.5rem;
  text-align: right;
}

.anim-slider {
  width: 100%;
  accent-color: var(--theme-accent, var(--color-gold-dark));
  cursor: pointer;
  height: 4px;
}

.anim-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dice-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 0 1rem;
  gap: 1.5rem;
}

.dice-container {
  perspective: 600px;
}

.dice-d100 {
  width: 120px;
  height: 120px;
  position: relative;
}

.dice-d100.rolling .dice-inner {
  animation: diceShake 0.1s ease-in-out infinite;
}

.dice-d100.landed .dice-inner {
  animation: diceLand 0.4s ease-out forwards;
}

@keyframes diceShake {
  0% { transform: rotate(-3deg) scale(1.02); }
  25% { transform: rotate(3deg) scale(0.98); }
  50% { transform: rotate(-2deg) scale(1.03); }
  75% { transform: rotate(2deg) scale(0.97); }
  100% { transform: rotate(-3deg) scale(1.02); }
}

@keyframes diceLand {
  0% { transform: scale(1.1) rotate(5deg); }
  40% { transform: scale(0.92) rotate(-2deg); }
  70% { transform: scale(1.04) rotate(1deg); }
  100% { transform: scale(1) rotate(0deg); }
}

.dice-inner {
  width: 100%;
  height: 100%;
  position: relative;
  filter: drop-shadow(0 6px 18px var(--color-shadow)) drop-shadow(0 0 12px var(--surface-gold-soft));
}

.dice-face {
  width: 100%;
  height: 100%;
  background: var(--player-panel-highlight-bg, var(--gradient-panel-soft));
  border: 2.5px solid var(--color-gold-dark);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 0 4px var(--surface-gold-soft),
    inset 0 2px 0 var(--surface-highlight),
    inset 0 0 24px var(--surface-gold-soft-strong);
  position: relative;
}

.dice-number {
  font-family: var(--font-heading);
  font-size: 2.6rem;
  font-weight: 900;
  color: var(--color-gold-bright);
  text-shadow:
    0 0 20px var(--surface-gold-soft-strong),
    0 0 40px var(--surface-gold-soft),
    2px 2px 0 var(--color-shadow);
  line-height: 1;
  user-select: none;
}

.dice-placeholder {
  font-size: 2.2rem;
  color: var(--color-gold-dark);
  text-shadow: none;
  opacity: 0.5;
}

.dice-label {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.3em;
  color: var(--color-text-dim);
  text-transform: uppercase;
  white-space: nowrap;
}

.roll-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 1.75rem;
  background: var(--gradient-danger-action);
  border: 1px solid var(--color-danger-border);
  border-radius: 10px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.95rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow:
    var(--shadow-soft),
    0 1px 0 var(--surface-highlight) inset;
  margin-top: 1.5rem;
}

.roll-btn:hover:not(:disabled) {
  background: var(--gradient-danger-action-hover);
  box-shadow: var(--shadow-medium);
  transform: translateY(-1px);
}

.roll-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.roll-btn-icon {
  font-size: 1.2rem;
}

.roll-btn.rolling .roll-btn-icon {
  animation: spinDice 0.5s linear infinite;
}

@keyframes spinDice {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.result-section {
  padding: 0.5rem 0 1rem;
}

.result-card {
  background: linear-gradient(160deg, var(--color-surface) 0%, var(--color-surface) 100%);
  border: 1px solid var(--color-gold-dark);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow:
    0 0 0 1px var(--surface-gold-soft),
    var(--shadow-medium);
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.result-card.visible {
  opacity: 1;
  transform: translateY(0);
}

.result-text {
  font-family: var(--font-body);
  font-size: 1.15rem;
  line-height: 1.65;
  color: var(--color-parchment);
  text-align: center;
}

.result-footer {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.result-type-badge {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

.send-section {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.recipient-row {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  align-items: center;
}

.recipient-select {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.9rem;
  outline: none;
  cursor: pointer;
}
.recipient-select option {
  background: var(--color-surface-soft);
  color: var(--color-parchment);
}
.recipient-select:focus { border-color: var(--color-gold-dark); }
.recipient-select:disabled { opacity: 0.5; cursor: not-allowed; }

.send-btn {
  padding: 0.5rem 1.1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  background: var(--gradient-accent-action-hover);
  box-shadow: var(--shadow-soft);
}

.send-btn:hover:not(:disabled) {
  background: var(--gradient-success-action-hover);
  box-shadow: var(--shadow-soft);
  color: var(--color-success);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-feedback {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-success);
  text-align: center;
}

.no-session-hint {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  text-align: center;
}

/* Themes */
.critical-fail-tool.theme-melee {
  --theme-accent: var(--combat-melee-accent);
  --theme-accent-light: var(--combat-melee-accent-light);
  --theme-glow: var(--combat-melee-glow);
}

.critical-fail-tool.theme-distance {
  --theme-accent: var(--combat-distance-accent);
  --theme-accent-light: var(--combat-distance-accent-light);
  --theme-glow: var(--combat-distance-glow);
}

.critical-fail-tool.theme-magique {
  --theme-accent: var(--combat-magique-accent);
  --theme-accent-light: var(--combat-magique-accent-light);
  --theme-glow: var(--combat-magique-glow);
}

.critical-fail-tool.theme-melee .dice-face,
.critical-fail-tool.theme-distance .dice-face,
.critical-fail-tool.theme-magique .dice-face {
  border-color: var(--theme-accent);
}

.critical-fail-tool.theme-melee .dice-number,
.critical-fail-tool.theme-distance .dice-number,
.critical-fail-tool.theme-magique .dice-number {
  color: var(--theme-accent-light);
}

.critical-fail-tool.theme-melee .result-card {
  border-color: var(--theme-accent);
}

.critical-fail-tool.theme-distance .result-card {
  border-color: var(--theme-accent);
}

.critical-fail-tool.theme-magique .result-card {
  border-color: var(--theme-accent);
}
</style>
