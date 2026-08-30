<script setup>
import { onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useConditions } from '@/composables/useConditions.js'

const { conditions: dndConditions, load: loadConditions } = useConditions()
onMounted(loadConditions)

const INITIATIVE_MIN = -10
const INITIATIVE_MAX = 99
const AC_MIN = 1
const AC_MAX = 30

const props = defineProps({
  currentHp:            { type: Number, required: true },
  maxHp:                { type: Number, required: true },
  editingMaxHp:         { type: Boolean, default: false },
  pendingMaxHp:         { type: Number, required: true },
  maxHpSending:         { type: Boolean, default: false },
  maxHpSent:            { type: Boolean, default: false },
  initiativeValue:      { default: null },
  initiativeSending:    { type: Boolean, default: false },
  initiativeSent:       { type: Boolean, default: false },
  acValue:              { default: null },
  acSending:            { type: Boolean, default: false },
  acSent:               { type: Boolean, default: false },
  tempHp:               { type: Number, default: 0 },
  editingTempHp:        { type: Boolean, default: false },
  pendingTempHp:        { type: Number, required: true },
  tempHpSending:        { type: Boolean, default: false },
  tempHpSent:           { type: Boolean, default: false },
  pendingDelta:         { default: null },
  hpAdjustSending:      { type: Boolean, default: false },
  isConcentrating:      { type: Boolean, default: false },
  activeConditions:     { type: Array, default: () => [] },
  counterOffers:        { type: Array, default: () => [] },
  hpPercent:            { type: Number, required: true },
  hpBarColor:           { type: String, required: true },
})

const emit = defineEmits([
  'open-max-hp-edit',
  'cancel-max-hp-edit',
  'update:pendingMaxHp',
  'send-max-hp',
  'open-temp-hp-edit',
  'cancel-temp-hp-edit',
  'update:pendingTempHp',
  'send-temp-hp',
  'adjust-delta',
  'update:pendingDelta',
  'apply-hp-delta',
  'update:initiativeValue',
  'send-initiative',
  'update:acValue',
  'send-ac',
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
        </div>
        <!-- PV totaux (primaire) + PV temp (secondaire, à côté) -->
        <div class="hp-display-row">
          <span class="hp-fraction" data-testid="hp-fraction">{{ currentHp }} / {{ maxHp }}</span>
          <span v-if="!editingTempHp && tempHp > 0" class="hp-temp-inline" data-testid="temp-hp-display">
            +{{ tempHp }}<span class="hp-temp-unit">TEMP</span>
          </span>
          <button v-if="!editingTempHp" class="temp-hp-edit-btn" :class="{ sent: tempHpSent }" @click="emit('open-temp-hp-edit')" data-testid="temp-hp-edit-btn">
            {{ tempHpSent ? '✓' : '' }}<AppIcon v-if="!tempHpSent" icon="lucide:pencil" size="0.8rem" />
          </button>
        </div>
        <!-- Temp HP edit inline -->
        <div v-if="editingTempHp" class="temp-hp-edit-row">
          <label class="temp-hp-edit-label">PV temp :</label>
          <input
            :value="pendingTempHp"
            type="number"
            class="temp-hp-edit-input"
            min="0"
            max="9999"
            data-testid="temp-hp-edit-input"
            @input="emit('update:pendingTempHp', Number($event.target.value))"
            @keyup.enter="emit('send-temp-hp')"
            @keyup.esc="emit('cancel-temp-hp-edit')"
          />
          <button class="temp-hp-confirm-btn" :disabled="tempHpSending" @click="emit('send-temp-hp')" data-testid="temp-hp-submit">
            {{ tempHpSending ? '…' : '✓' }}
          </button>
          <button class="temp-hp-cancel-btn" @click="emit('cancel-temp-hp-edit')">✕</button>
          <HelpTip id="player.temp-hp" />
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
      </div>

      <!-- Dégâts et Soins -->
      <div class="panel damage-panel">
        <div class="panel-header">
          <span class="panel-label"><AppIcon icon="game-icons:sword-wound" size="0.85rem" color="var(--color-danger)" /> Dégâts et Soins <HelpTip id="player.damage" /></span>
        </div>
        <div class="damage-controls">
          <button class="hp-btn minus" @click="emit('adjust-delta', -5)" data-testid="hp-minus-5">−5</button>
          <button class="hp-btn minus" @click="emit('adjust-delta', -1)" data-testid="hp-minus-1">−1</button>
          <input
            :value="pendingDelta"
            type="number"
            class="damage-input"
            placeholder="± PV"
            data-testid="damage-input"
            @input="emit('update:pendingDelta', $event.target.value === '' ? null : Number($event.target.value))"
          />
          <button class="hp-btn plus" @click="emit('adjust-delta', 1)" data-testid="hp-plus-1">+1</button>
          <button class="hp-btn plus" @click="emit('adjust-delta', 5)" data-testid="hp-plus-5">+5</button>
        </div>
        <button
          class="damage-apply-btn"
          :class="{ heal: pendingDelta > 0 }"
          :disabled="hpAdjustSending || !pendingDelta"
          @click="emit('apply-hp-delta')"
          data-testid="damage-apply"
        >
          <AppIcon v-if="!hpAdjustSending" :icon="pendingDelta > 0 ? 'lucide:heart-plus' : 'lucide:sword'" size="0.85em" />
          {{ hpAdjustSending ? '…' : (pendingDelta > 0 ? 'Soigner' : 'Appliquer les dégâts') }}
        </button>
        <p v-if="tempHp > 0 && pendingDelta < 0" class="damage-hint">Vos PV temporaires absorberont ces dégâts en premier.</p>
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

      <!-- AC (classe d'armure) -->
      <div class="panel ac-panel">
        <div class="panel-header">
          <span class="panel-label"><AppIcon icon="game-icons:shield" size="0.85rem" /> Classe d'Armure <HelpTip id="player.ac" /></span>
        </div>
        <div class="ac-controls">
          <input
            :value="acValue"
            type="number"
            class="ac-input"
            :min="AC_MIN"
            :max="AC_MAX"
            placeholder="Ex: 15"
            data-testid="ac-edit-input"
            @input="emit('update:acValue', $event.target.value === '' ? null : Number($event.target.value))"
          />
          <button
            class="ac-send-btn"
            :class="{ sent: acSent }"
            :disabled="acSending"
            @click="emit('send-ac')"
            data-testid="ac-submit"
          >
            <AppIcon v-if="!acSent && !acSending" icon="lucide:send" size="0.85em" />
            {{ acSent ? '✓ Envoyée' : acSending ? '…' : 'Envoyer' }}
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
          <div v-for="cond in dndConditions" :key="cond.id" class="cond-cell">
            <button
              class="condition-btn"
              :class="{ active: activeConditions.includes(cond.id) }"
              :data-testid="`condition-${cond.id}`"
              @click="emit('toggle-condition', cond.id)"
            >
              <span class="cond-icon"><AppIcon :icon="cond.icon" :color="activeConditions.includes(cond.id) ? (cond.color || 'var(--player-danger-text)') : 'currentColor'" size="1.1rem" /></span>
              <span class="cond-label">{{ cond.label }}</span>
            </button>
            <HelpTip :id="`condition.${cond.id}`" :text="cond.description" />
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
  padding: var(--space-4);
  box-shadow: var(--shadow-soft);
}
.panel-label {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0 0 var(--space-3);
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

/* ── HP Panel ────────────────────────────────────────────────────────── */
.hp-panel { display: flex; flex-direction: column; gap: var(--space-2); }
.hp-display-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}
.hp-fraction {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--color-parchment);
  letter-spacing: 0.03em;
}
.hp-temp-inline {
  display: inline-flex;
  align-items: baseline;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--player-info-text);
}
.hp-temp-unit {
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}
.hp-bar-track { height: 8px; background: var(--player-track-bg); border-radius: 4px; overflow: hidden; }
.hp-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease, background 0.4s ease; }
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
.hp-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.hp-btn:disabled:hover { border-color: var(--color-border); color: var(--color-parchment); background: var(--player-control-bg); }

/* ── Max HP Edit ─────────────────────────────────────────────────────── */
.max-hp-display-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: 0.25rem;
}
.max-hp-hint {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
}
.max-hp-edit-btn {
  background: none;
  border: none;
  padding: 0 0.2rem;
  font-size: var(--text-base);
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
  gap: var(--space-2);
  margin-bottom: 0.25rem;
}
.max-hp-edit-label {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
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
  font-size: var(--text-md);
  font-weight: 700;
}
.max-hp-confirm-btn, .max-hp-cancel-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-parchment);
  font-size: var(--text-base);
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

/* ── Temp HP Edit (même pattern que Max HP) ─────────────────────────── */
.temp-hp-edit-btn {
  background: none;
  border: none;
  padding: 0 0.2rem;
  font-size: var(--text-base);
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
  line-height: 1;
}
.temp-hp-edit-btn:hover { opacity: 1; }
.temp-hp-edit-btn.sent { opacity: 1; color: var(--player-success-text); }
.temp-hp-edit-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: 0.25rem;
}
.temp-hp-edit-label {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  white-space: nowrap;
}
.temp-hp-edit-input {
  width: 70px;
  height: 32px;
  text-align: center;
  background: var(--player-control-bg);
  border: 1px solid var(--player-info-border);
  border-radius: 6px;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-md);
  font-weight: 700;
}
.temp-hp-confirm-btn, .temp-hp-cancel-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg);
  color: var(--color-parchment);
  font-size: var(--text-base);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.temp-hp-confirm-btn { border-color: var(--player-success-border); color: var(--player-success-text); }
.temp-hp-confirm-btn:hover:not(:disabled) { background: var(--player-success-bg); }
.temp-hp-cancel-btn:hover { border-color: var(--color-danger); color: var(--color-danger); }
.temp-hp-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Dégâts et Soins ─────────────────────────────────────────────────── */
.damage-panel { display: flex; flex-direction: column; gap: var(--space-2); }
.damage-controls { display: flex; align-items: center; gap: var(--space-2); }
.damage-input {
  flex: 2;
  height: 52px;
  text-align: center;
  background: var(--player-control-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
  font-size: 1.4rem;
  font-weight: 700;
  outline: none;
}
.damage-input:focus { border-color: var(--color-gold-dark); }
.damage-apply-btn {
  width: 100%;
  padding: var(--space-2);
  border-radius: 8px;
  border: 1px solid var(--player-danger-border);
  background: var(--player-danger-bg);
  color: var(--player-danger-text);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.damage-apply-btn:hover:not(:disabled) { filter: brightness(1.08); }
.damage-apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.damage-apply-btn.heal { border-color: var(--player-success-border); background: var(--player-success-bg); color: var(--player-success-text); }
.damage-hint {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-xs);
  color: var(--player-info-text);
  margin: 0;
}

/* ── Initiative ──────────────────────────────────────────────────────── */
.initiative-panel { display: flex; flex-direction: column; gap: var(--space-2); }
.initiative-controls { display: flex; align-items: center; gap: var(--space-2); }
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
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  white-space: nowrap;
}
.initiative-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.initiative-send-btn.sent { border-color: var(--player-success-border); color: var(--player-success-text); background: var(--player-success-bg); }

/* ── AC (classe d'armure) ────────────────────────────────────────────── */
.ac-panel { display: flex; flex-direction: column; gap: var(--space-2); }
.ac-controls { display: flex; align-items: center; gap: var(--space-2); }
.ac-input {
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
.ac-input:focus { border-color: var(--player-info-border); }
.ac-send-btn {
  border: 1px solid var(--player-info-border);
  border-radius: 8px;
  background: var(--player-info-bg);
  color: var(--player-info-text);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  white-space: nowrap;
}
.ac-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ac-send-btn.sent { border-color: var(--player-success-border); color: var(--player-success-text); background: var(--player-success-bg); }

/* ── Concentration ───────────────────────────────────────────────────── */
.concentration-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
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
.conc-label { display: block; font-size: var(--text-sm); letter-spacing: 0.1em; text-transform: uppercase; }
.conc-state {
  display: block;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  margin-top: 0.1rem;
}
.concentration-btn.active .conc-state { color: var(--player-info-text); }
.conc-toggle {
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  flex-shrink: 0;
}
.concentration-btn.active .conc-toggle { color: var(--player-info-text); }

/* ── Counter offers ──────────────────────────────────────────────────── */
.counter-offers-panel { display: flex; flex-direction: column; gap: var(--space-2); }
.counter-offer {
  background: var(--player-success-bg);
  border: 1px solid var(--player-success-border);
  border-radius: 8px;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.offer-text { font-family: var(--font-body), sans-serif; font-size: var(--text-base); color: var(--color-text-dim); margin: 0; }
.offer-text strong { color: var(--color-parchment); }
.offer-price { color: var(--player-success-text) !important; }
.offer-actions { display: flex; gap: var(--space-2); }
.offer-btn {
  flex: 1; padding: var(--space-2);
  border-radius: 6px; font-family: var(--font-heading), sans-serif; font-size: var(--text-xs);
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.2s; border: 1px solid;
}
.offer-btn.accept { background: var(--player-success-bg); border-color: var(--player-success-border); color: var(--player-success-text); }
.offer-btn.accept:hover { filter: brightness(1.08); }
.offer-btn.decline { background: var(--player-danger-bg); border-color: var(--player-danger-border); color: var(--player-danger-text); }
.offer-btn.decline:hover { filter: brightness(1.05); }

/* ── Conditions ──────────────────────────────────────────────────────── */
.conditions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.cond-cell { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
.condition-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: var(--space-2) var(--space-2);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg-muted);
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
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
    gap: var(--space-3);
    align-items: start;
  }
  .combat-col-left,
  .combat-col-right {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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
