<script setup>
import AppIcon from '@/components/AppIcon.vue'
import HelpTip from '@/components/HelpTip.vue'
import { DND_CONDITIONS } from '@/utils/conditions.js'

const INITIATIVE_MIN = -10
const INITIATIVE_MAX = 99
const MAX_HP_LIMIT = 9999

const props = defineProps({
  currentHp:            { type: Number, required: true },
  maxHp:                { type: Number, required: true },
  pendingHp:            { type: Number, required: true },
  hpSending:            { type: Boolean, default: false },
  hpSent:               { type: Boolean, default: false },
  editingMaxHp:         { type: Boolean, default: false },
  pendingMaxHp:         { type: Number, required: true },
  maxHpSending:         { type: Boolean, default: false },
  maxHpSent:            { type: Boolean, default: false },
  initiativeValue:      { default: null },
  initiativeSending:    { type: Boolean, default: false },
  initiativeSent:       { type: Boolean, default: false },
  isConcentrating:      { type: Boolean, default: false },
  activeConditions:     { type: Array, default: () => [] },
  counterOffers:        { type: Array, default: () => [] },
  confirmedDisplayedHp: { type: Number, required: true },
  confirmedTemporaryHp: { type: Number, default: 0 },
  temporaryHp:          { type: Number, default: 0 },
  hpPercent:            { type: Number, required: true },
  hpBarColor:           { type: String, required: true },
})

const emit = defineEmits([
  'adjust-hp',
  'set-pending-hp',
  'send-hp',
  'open-max-hp-edit',
  'cancel-max-hp-edit',
  'update:pendingMaxHp',
  'send-max-hp',
  'update:initiativeValue',
  'send-initiative',
  'toggle-concentration',
  'toggle-condition',
  'respond-counter-offer',
])
</script>

<template>
  <div class="combat-layout">
    <div class="combat-col-left">
      <!-- HP Panel -->
      <div class="panel hp-panel">
        <div class="panel-header">
          <span class="panel-label"><AppIcon icon="game-icons:hearts" size="0.85rem" color="var(--color-danger)" /> Points de Vie <HelpTip id="player.hp-update" /></span>
          <span class="hp-fraction" data-testid="hp-fraction">{{ confirmedDisplayedHp }} / {{ maxHp }}</span>
          <span v-if="confirmedTemporaryHp > 0" class="hp-temp">+{{ confirmedTemporaryHp }} TEMP <HelpTip id="player.temp-hp" /></span>
        </div>
        <!-- Max HP edit inline -->
        <div v-if="editingMaxHp" class="max-hp-edit-row">
          <label class="max-hp-edit-label">PV max :</label>
          <input
            :value="pendingMaxHp"
            type="number"
            class="max-hp-edit-input"
            min="1"
            max="9999"
            @input="emit('update:pendingMaxHp', Number($event.target.value))"
            @keyup.enter="emit('send-max-hp')"
            @keyup.esc="emit('cancel-max-hp-edit')"
          />
          <button class="max-hp-confirm-btn" :disabled="maxHpSending" @click="emit('send-max-hp')">
            {{ maxHpSending ? '…' : '✓' }}
          </button>
          <button class="max-hp-cancel-btn" @click="emit('cancel-max-hp-edit')">✕</button>
        </div>
        <div v-else class="max-hp-display-row">
          <span class="max-hp-hint">Max : {{ maxHp }}</span>
          <HelpTip id="player.max-hp" />
          <button class="max-hp-edit-btn" :class="{ sent: maxHpSent }" @click="emit('open-max-hp-edit')">
            {{ maxHpSent ? '✓' : '' }}<AppIcon v-if="!maxHpSent" icon="lucide:pencil" size="0.85rem" />
          </button>
        </div>
        <div class="hp-bar-track">
          <div class="hp-bar-fill" :style="{ width: hpPercent + '%', background: hpBarColor }" />
        </div>
        <div class="hp-controls">
          <button class="hp-btn minus" @click="emit('adjust-hp', -5)" data-testid="hp-minus-5">−5</button>
          <button class="hp-btn minus" @click="emit('adjust-hp', -1)" data-testid="hp-minus-1">−1</button>
          <input
            :value="pendingHp"
            type="number"
            class="hp-input"
            :min="0"
            :max="MAX_HP_LIMIT"
            data-testid="hp-input"
            @input="emit('set-pending-hp', Number($event.target.value))"
          />
          <button class="hp-btn plus" @click="emit('adjust-hp', 1)" data-testid="hp-plus-1">+1</button>
          <button class="hp-btn plus" @click="emit('adjust-hp', 5)" data-testid="hp-plus-5">+5</button>
        </div>
        <button
          class="hp-send-btn"
          :class="{ sent: hpSent }"
          :disabled="hpSending || pendingHp === currentHp"
          @click="emit('send-hp')"
          data-testid="hp-submit"
        >
          <AppIcon v-if="!hpSent && !hpSending" icon="lucide:send" size="0.85em" />
          {{ hpSent ? '✓ Mis à jour' : hpSending ? '…' : 'Mettre à jour' }}
        </button>
      </div>

      <!-- Initiative -->
      <div class="panel initiative-panel">
        <div class="panel-header">
          <span class="panel-label"><AppIcon icon="game-icons:dice-six-faces-five" size="0.85rem" /> Initiative <HelpTip id="player.initiative" /></span>
        </div>
        <div class="initiative-controls">
          <input
            :value="initiativeValue"
            type="number"
            class="initiative-input"
            :min="INITIATIVE_MIN"
            :max="INITIATIVE_MAX"
            placeholder="Ex: 14"
            data-testid="initiative-input"
            @input="emit('update:initiativeValue', $event.target.value === '' ? null : Number($event.target.value))"
          />
          <button
            class="initiative-send-btn"
            :class="{ sent: initiativeSent }"
            :disabled="initiativeSending"
            @click="emit('send-initiative')"
            data-testid="initiative-submit"
          >
            <AppIcon v-if="!initiativeSent && !initiativeSending" icon="lucide:send" size="0.85em" />
            {{ initiativeSent ? '✓ Envoyée' : initiativeSending ? '…' : 'Envoyer' }}
          </button>
        </div>
      </div>

      <!-- Concentration -->
      <div class="panel">
        <button
          class="concentration-btn"
          :class="{ active: isConcentrating }"
          @click="emit('toggle-concentration')"
          data-testid="concentration-toggle"
        >
          <span class="concentration-icon"><AppIcon icon="game-icons:bullseye" size="1.3rem" /></span>
          <span class="concentration-text">
            <span class="conc-label">Concentration <HelpTip id="player.concentration" /></span>
            <span class="conc-state">{{ isConcentrating ? 'Active' : 'Inactive' }}</span>
          </span>
          <span class="conc-toggle">{{ isConcentrating ? 'Arrêter' : 'Activer' }}</span>
        </button>
      </div>

      <!-- Counter offers -->
      <div v-if="counterOffers.length > 0" class="panel counter-offers-panel">
        <p class="panel-label"><AppIcon icon="lucide:refresh-cw" size="0.85rem" /> Contre-offres <HelpTip id="player.counter-offer" /></p>
        <div v-for="offer in counterOffers" :key="offer.requestId" class="counter-offer">
          <p class="offer-text">
            <span v-if="offer.action === 'discount'"><AppIcon icon="lucide:tag" size="0.9em" color="var(--player-success-text)" /> Ristourne</span>
            <span v-else><AppIcon icon="lucide:trending-up" size="0.9em" color="var(--player-danger-text)" /> Augmentation</span>
            pour <strong>{{ offer.itemName }}</strong> :
            <strong class="offer-price">{{ offer.finalPrice }} po</strong>
          </p>
          <div class="offer-actions">
            <button class="offer-btn accept" @click="emit('respond-counter-offer', offer.requestId, true)">Accepter</button>
            <button class="offer-btn decline" @click="emit('respond-counter-offer', offer.requestId, false)">Décliner</button>
          </div>
        </div>
      </div>
    </div><!-- end combat-col-left -->

    <div class="combat-col-right">
      <!-- Conditions -->
      <div class="panel">
        <p class="panel-label"><AppIcon icon="game-icons:lightning-trio" size="0.85rem" color="var(--color-warning)" /> États et Conditions</p>
        <div class="conditions-grid">
          <div v-for="cond in DND_CONDITIONS" :key="cond.id" class="cond-cell">
            <button
              class="condition-btn"
              :class="{ active: activeConditions.includes(cond.id) }"
              :data-testid="`condition-${cond.id}`"
              @click="emit('toggle-condition', cond.id)"
            >
              <span class="cond-icon"><AppIcon :icon="cond.icon" :color="activeConditions.includes(cond.id) ? (cond.color || 'var(--player-danger-text)') : 'currentColor'" size="1.1rem" /></span>
              <span class="cond-label">{{ cond.label }}</span>
            </button>
            <HelpTip :id="`condition.${cond.id}`" />
          </div>
        </div>
      </div>
    </div><!-- end combat-col-right -->
  </div><!-- end combat-layout -->
</template>

<style scoped>
/* ── Panel cards ─────────────────────────────────────────────────────── */
.panel {
  background: var(--player-panel-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: var(--shadow-soft);
}
.panel-label {
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  color: var(--color-parchment);
  letter-spacing: 0.05em;
}
.hp-temp {
  font-family: var(--font-heading), sans-serif;
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
  height: 52px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.15s;
  touch-action: manipulation;
}
.hp-btn.minus:hover, .hp-btn.minus:active { border-color: var(--player-danger-border); color: var(--player-danger-text); background: var(--player-danger-bg); }
.hp-btn.plus:hover, .hp-btn.plus:active { border-color: var(--player-success-border); color: var(--player-success-text); background: var(--player-success-bg); }
.hp-input {
  flex: 2;
  height: 52px;
  text-align: center;
  background: var(--player-control-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: 1.6rem;
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
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.hp-send-btn:hover:not(:disabled) { background: var(--player-gold-bg-strong); }
.hp-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.hp-send-btn.sent { border-color: var(--player-success-border); background: var(--player-success-bg); color: var(--player-success-text); }

/* ── Max HP Edit ─────────────────────────────────────────────────────── */
.max-hp-display-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.max-hp-hint {
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
}
.max-hp-edit-btn {
  background: none;
  border: none;
  padding: 0 0.2rem;
  font-size: 0.85rem;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
  line-height: 1;
}
.max-hp-edit-btn:hover { opacity: 1; }
.max-hp-edit-btn.sent { opacity: 1; color: var(--player-success-text); }
.max-hp-edit-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}
.max-hp-edit-label {
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  white-space: nowrap;
}
.max-hp-edit-input {
  width: 70px;
  height: 32px;
  text-align: center;
  background: var(--player-control-bg);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  font-weight: 700;
}
.max-hp-confirm-btn, .max-hp-cancel-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-parchment);
  font-size: 0.85rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.max-hp-confirm-btn { border-color: var(--player-success-border); color: var(--player-success-text); }
.max-hp-confirm-btn:hover:not(:disabled) { background: var(--player-success-bg); }
.max-hp-cancel-btn:hover { border-color: var(--color-danger); color: var(--color-danger); }
.max-hp-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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
.offer-text { font-family: var(--font-body), sans-serif; font-size: 0.85rem; color: var(--color-text-dim); margin: 0; }
.offer-text strong { color: var(--color-parchment); }
.offer-price { color: var(--player-success-text) !important; }
.offer-actions { display: flex; gap: 0.5rem; }
.offer-btn {
  flex: 1; padding: 0.45rem;
  border-radius: 6px; font-family: var(--font-heading), sans-serif; font-size: 0.7rem;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.2s; border: 1px solid;
}
.offer-btn.accept { background: var(--player-success-bg); border-color: var(--player-success-border); color: var(--player-success-text); }
.offer-btn.accept:hover { filter: brightness(1.08); }
.offer-btn.decline { background: var(--player-danger-bg); border-color: var(--player-danger-border); color: var(--player-danger-text); }
.offer-btn.decline:hover { filter: brightness(1.05); }

/* ── Conditions ──────────────────────────────────────────────────────── */
.conditions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
.cond-cell { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
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
  font-family: var(--font-heading), sans-serif;
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

/* ── Combat layout ───────────────────────────────────────────────────── */
.combat-layout { display: contents; }
.combat-col-left { display: contents; }
.combat-col-right { display: contents; }

@media (min-width: 640px) {
  .combat-layout {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 0.75rem;
    align-items: start;
  }
  .combat-col-left,
  .combat-col-right {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .conditions-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .conditions-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
