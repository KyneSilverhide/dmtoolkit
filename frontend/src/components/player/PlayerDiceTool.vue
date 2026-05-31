<script setup>
import { ref, computed } from 'vue'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'

const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100]
const MAX_COUNT = 20
const MAX_MODIFIER = 99
const ANIMATION_STEPS = 12
// baseline total ≈ 744ms (sum of 40+i*4 for i=0..11) + 200ms settle = 944ms
const ANIM_BASELINE_MS = 944

const ANIM_DURATION_KEY = 'playerDice-animDuration'
const _storedDuration = parseFloat(localStorage.getItem(ANIM_DURATION_KEY) ?? '1')
const animDuration = ref(isNaN(_storedDuration) ? 1 : _storedDuration)

function saveAnimDuration() {
  localStorage.setItem(ANIM_DURATION_KEY, String(animDuration.value))
}

const selectedDie = ref(20)
const diceCount = ref(1)
const modifier = ref(0)
const rollType = ref('normal') // 'normal' | 'advantage' | 'disadvantage'

const rolling = ref(false)
const lastRoll = ref(null) // { rolls, total, diceType, diceCount, modifier, rollType, hidden }
const hiddenSent = ref(false)
const animatedTotal = ref(null)

const canAdvantage = computed(() => selectedDie.value === 20 && diceCount.value === 1)

function adjustCount(delta) {
  diceCount.value = Math.max(1, Math.min(MAX_COUNT, diceCount.value + delta))
}

function selectDie(d) {
  selectedDie.value = d
  if (!canAdvantage.value) rollType.value = 'normal'
}

function adjustModifier(delta) {
  modifier.value = Math.max(-MAX_MODIFIER, Math.min(MAX_MODIFIER, modifier.value + delta))
}

function rollOnce(sides) {
  return Math.floor(Math.random() * sides) + 1
}

function buildRolls() {
  const count = diceCount.value
  const sides = selectedDie.value
  if (rollType.value === 'advantage') {
    const s1 = Array.from({ length: count }, () => rollOnce(sides))
    const s2 = Array.from({ length: count }, () => rollOnce(sides))
    return s1.reduce((a, b) => a + b, 0) >= s2.reduce((a, b) => a + b, 0) ? s1 : s2
  } else if (rollType.value === 'disadvantage') {
    const s1 = Array.from({ length: count }, () => rollOnce(sides))
    const s2 = Array.from({ length: count }, () => rollOnce(sides))
    return s1.reduce((a, b) => a + b, 0) <= s2.reduce((a, b) => a + b, 0) ? s1 : s2
  } else {
    return Array.from({ length: count }, () => rollOnce(sides))
  }
}

async function roll() {
  if (rolling.value) return
  rolling.value = true
  hiddenSent.value = false
  lastRoll.value = null

  const rolls = buildRolls()
  const total = rolls.reduce((a, b) => a + b, 0) + modifier.value

  // Animate total count-up
  const speedFactor = (animDuration.value * 1000) / ANIM_BASELINE_MS
  animatedTotal.value = 1
  for (let i = 0; i < ANIMATION_STEPS; i++) {
    animatedTotal.value = Math.floor(Math.random() * (selectedDie.value * diceCount.value)) + 1
    await new Promise(r => setTimeout(r, (40 + i * 4) * speedFactor))
  }
  animatedTotal.value = total

  await new Promise(r => setTimeout(r, 200 * speedFactor))

  lastRoll.value = {
    rolls,
    total,
    diceType: selectedDie.value,
    diceCount: diceCount.value,
    modifier: modifier.value,
    rollType: rollType.value,
  }
  rolling.value = false

  const socket = getSocket()
  socket.emit('player-roll', {
    diceType: selectedDie.value,
    diceCount: diceCount.value,
    modifier: modifier.value,
    rollType: rollType.value,
    hidden: false,
    rolls,
    total,
  })
}

async function rollHidden() {
  if (rolling.value) return
  rolling.value = true
  hiddenSent.value = false
  lastRoll.value = null

  const socket = getSocket()

  await new Promise(r => setTimeout(r, 300))

  socket.emit('player-roll', {
    diceType: selectedDie.value,
    diceCount: diceCount.value,
    modifier: modifier.value,
    rollType: rollType.value,
    hidden: true,
  })

  hiddenSent.value = true
  rolling.value = false
  setTimeout(() => { hiddenSent.value = false }, 3000)
}

const diceLabel = computed(() => {
  const mod = modifier.value
  const count = diceCount.value
  const rt = rollType.value
  let label = `${count}d${selectedDie.value}`
  if (mod !== 0) label += mod > 0 ? `+${mod}` : `${mod}`
  if (rt === 'advantage') label += ' (avantage)'
  else if (rt === 'disadvantage') label += ' (désavantage)'
  return label
})

const totalColor = computed(() => {
  if (!lastRoll.value) return 'var(--color-gold-bright)'
  const max = lastRoll.value.diceCount * lastRoll.value.diceType + lastRoll.value.modifier
  const pct = max > 0 ? lastRoll.value.total / max : 0.5
  if (pct >= 0.8) return 'var(--color-success)'
  if (pct >= 0.4) return 'var(--color-gold-bright)'
  return 'var(--color-danger)'
})
</script>

<template>
  <div class="dice-tool">
    <!-- Die selector -->
    <div class="section">
      <p class="section-label">Type de dé</p>
      <div class="die-grid">
        <button
          v-for="d in DICE_TYPES"
          :key="d"
          class="die-btn"
          :class="{ active: selectedDie === d }"
          @click="selectDie(d)"
        >
          d{{ d }}
        </button>
      </div>
    </div>

    <!-- Animation duration -->
    <div class="section anim-settings">
      <label class="anim-label">
        <span class="section-label">Durée de l'animation</span>
        <span class="anim-value">{{ animDuration.toFixed(1) }}s</span>
      </label>
      <input
        type="range"
        class="anim-slider"
        v-model.number="animDuration"
        min="0"
        max="3"
        step="0.1"
        :disabled="rolling"
        @change="saveAnimDuration"
      />
    </div>

    <!-- Count + Modifier -->
    <div class="section row-controls">
      <div class="control-group">
        <p class="section-label">Nombre</p>
        <div class="stepper">
          <button class="step-btn" @click="adjustCount(-1)" :disabled="diceCount <= 1">−</button>
          <span class="step-value">{{ diceCount }}</span>
          <button class="step-btn" @click="adjustCount(1)" :disabled="diceCount >= MAX_COUNT">+</button>
        </div>
      </div>
      <div class="control-group">
        <p class="section-label">Modificateur</p>
        <div class="stepper">
          <button class="step-btn" @click="adjustModifier(-1)">−</button>
          <span class="step-value mod-value">{{ modifier >= 0 ? '+' + modifier : modifier }}</span>
          <button class="step-btn" @click="adjustModifier(1)">+</button>
        </div>
      </div>
    </div>

    <!-- Roll type (advantage/disadvantage only for d20 x1) -->
    <div class="section" v-if="canAdvantage">
      <p class="section-label">Type de jet</p>
      <div class="roll-type-btns">
        <button class="roll-type-btn" :class="{ active: rollType === 'normal' }" @click="rollType = 'normal'">
          <AppIcon icon="game-icons:dice-six-faces-five" size="1em" /> Normal
        </button>
        <button class="roll-type-btn advantage" :class="{ active: rollType === 'advantage' }" @click="rollType = 'advantage'">
          <AppIcon icon="lucide:sparkles" size="1em" /> Avantage
        </button>
        <button class="roll-type-btn disadvantage" :class="{ active: rollType === 'disadvantage' }" @click="rollType = 'disadvantage'">
          <AppIcon icon="game-icons:skull" size="1em" /> Désavantage
        </button>
      </div>
    </div>

    <!-- Dice label preview -->
    <p class="dice-preview">{{ diceLabel }}</p>

    <!-- Result display -->
    <div class="result-area" v-if="lastRoll || rolling">
      <div class="result-total" :style="{ color: totalColor }">
        {{ rolling ? animatedTotal : lastRoll?.total }}
      </div>
      <div v-if="lastRoll && lastRoll.rolls.length > 1" class="rolls-detail">
        Dés : {{ lastRoll.rolls.join(' + ') }}
        <span v-if="lastRoll.modifier !== 0"> {{ lastRoll.modifier > 0 ? '+' : '' }}{{ lastRoll.modifier }}</span>
      </div>
    </div>

    <!-- Hidden sent feedback -->
    <div v-if="hiddenSent" class="hidden-sent">
      <AppIcon icon="lucide:eye-off" size="0.9em" /> Jet envoyé au MJ (résultat caché)
    </div>

    <!-- Action buttons -->
    <div class="action-btns">
      <button class="roll-btn normal" :class="{ rolling }" :disabled="rolling" @click="roll">
        <span class="btn-icon" :class="{ spin: rolling }"><AppIcon icon="game-icons:dice-six-faces-five" size="1.2rem" /></span>
        {{ rolling ? 'Lancement…' : 'Lancer' }}
      </button>
      <button class="roll-btn hidden" :disabled="rolling" @click="rollHidden">
        <AppIcon icon="lucide:eye-off" size="0.9em" /> Jet caché
      </button>
    </div>
  </div>
</template>

<style scoped>
.dice-tool {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}

.die-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.die-btn {
  flex: 1;
  min-width: 46px;
  padding: 0.5rem 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--player-control-bg, var(--surface-raised));
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
}

.die-btn:hover {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.die-btn.active {
  border-color: var(--color-gold-bright);
  background: var(--player-gold-bg, var(--surface-gold-soft));
  color: var(--color-gold-bright);
}

.row-controls {
  flex-direction: row;
  gap: 1rem;
}

.control-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--player-control-bg, var(--surface-raised));
  color: var(--color-parchment);
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.step-value {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.1rem;
  color: var(--color-gold-bright);
  min-width: 32px;
  text-align: center;
}

.mod-value {
  font-size: 1rem;
}

.roll-type-btns {
  display: flex;
  gap: 0.4rem;
}

.roll-type-btn {
  flex: 1;
  padding: 0.5rem 0.3rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--player-control-bg, var(--surface-raised));
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
}

.roll-type-btn.active {
  border-color: var(--color-gold-bright);
  background: var(--player-gold-bg, var(--surface-gold-soft));
  color: var(--color-gold-bright);
}

.roll-type-btn.advantage.active {
  border-color: var(--color-success-border);
  background: var(--player-success-bg, var(--color-success-soft));
  color: var(--color-success);
}

.roll-type-btn.disadvantage.active {
  border-color: var(--color-danger-border);
  background: var(--player-danger-bg, var(--color-danger-soft));
  color: var(--color-danger);
}

.dice-preview {
  text-align: center;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  color: var(--color-text-dim);
  margin: 0;
}

.result-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1rem 0;
}

.result-total {
  font-family: var(--font-title, var(--font-heading)), sans-serif;
  font-size: 4rem;
  line-height: 1;
  transition: color 0.3s;
  text-shadow: 0 0 24px currentColor;
}

.rolls-detail {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  color: var(--color-text-dim);
  letter-spacing: 0.08em;
}

.hidden-sent {
  text-align: center;
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  color: var(--player-info-text, var(--color-info-bright));
  background: var(--player-info-bg, var(--color-info-soft));
  border: 1px solid var(--player-info-border, var(--color-info-border));
  border-radius: 8px;
  padding: 0.6rem 1rem;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.action-btns {
  display: flex;
  gap: 0.5rem;
}

.roll-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.roll-btn.normal {
  background: var(--gradient-danger-action, linear-gradient(135deg, #7c2d12, #450a0a));
  border: 1px solid var(--color-danger-border);
  color: var(--color-parchment);
}

.roll-btn.normal:hover:not(:disabled) {
  background: var(--gradient-danger-action-hover, linear-gradient(135deg, #991b1b, #7c2d12));
  transform: translateY(-1px);
}

.roll-btn.hidden {
  background: var(--player-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  color: var(--color-text-dim);
}

.roll-btn.hidden:hover:not(:disabled) {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.roll-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-icon {
  font-size: 1.1rem;
}

.btn-icon.spin {
  animation: spin 0.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.anim-settings {
  padding: 0;
}

.anim-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}

.anim-value {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  color: var(--color-gold-bright);
  min-width: 2.5rem;
  text-align: right;
}

.anim-slider {
  width: 100%;
  accent-color: var(--color-gold-dark);
  cursor: pointer;
  height: 4px;
}

.anim-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
