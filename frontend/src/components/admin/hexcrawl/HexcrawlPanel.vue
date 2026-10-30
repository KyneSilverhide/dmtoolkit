<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'
import { formatHours } from '@/utils/hexcrawl.js'

const props = defineProps({
  status: { type: Object, required: true },
  config: { type: Object, required: true },
  positionLabel: { type: String, default: '' },
  armyLabel: { type: String, default: '' },
  travelMode: { type: Boolean, default: true },
  hardNext: { type: Boolean, default: false },
  notice: { type: String, default: '' },
  canUndo: { type: Boolean, default: false },
})
const emit = defineEmits(['update:travelMode', 'update:hardNext', 'action', 'undo', 'reset', 'edit', 'remove'])

const refillAmount = ref(null)
// Un champ vidé donne '' avec v-model.number : on revient alors à la recharge standard.
const refill = computed(() => Number(refillAmount.value) || props.config.fuelRefill)
const pips = computed(() => Array.from({ length: props.status.quartersPerDay }, (_, i) => i + 1))
// Un combat de contact ne s'évite pas : le temps ne repart qu'une fois la vague réglée.
const inCombat = computed(() => props.status.army?.alert === 'contact')

function act(entry) { emit('action', entry) }
</script>

<template>
  <section class="control-section hexcrawl-panel" aria-label="Suivi du voyage" data-testid="hexcrawl-panel">
    <header class="panel-head">
      <h4 class="subsection-title"><AppIcon icon="lucide:route" size="0.85em" /> Voyage <HelpTip id="hexcrawl.travel" /></h4>
      <label class="switch">
        <input :checked="travelMode" type="checkbox" data-testid="hexcrawl-travel-mode" @change="emit('update:travelMode', $event.target.checked)" />
        Déplacer au clic
      </label>
    </header>

    <div class="clock" data-testid="hexcrawl-clock">
      <strong>Jour {{ status.day }}</strong>
      <span>{{ formatHours(status.hoursToday) }} écoulée{{ status.hoursToday >= 2 ? 's' : '' }}</span>
      <span v-if="positionLabel" class="pos">{{ positionLabel }}</span>
    </div>
    <div class="pips" aria-hidden="true">
      <span v-for="pip in pips" :key="pip" class="pip" :class="{ past: pip < status.quarter, now: pip === status.quarter && !status.restDue }" />
    </div>

    <p v-if="!status.started" class="callout" role="status"><AppIcon icon="lucide:map-pin" size="0.9em" /> Cliquez la case de départ sur la carte.</p>
    <p v-else-if="inCombat" class="callout warn" role="status"><AppIcon icon="lucide:swords" size="0.9em" /> Combat en cours : le temps reprend quand la vague est réglée.</p>
    <p v-else-if="status.restDue" class="callout warn" role="status"><AppIcon icon="lucide:moon" size="0.9em" /> Repos dû : au-delà, épuisement selon vos règles.</p>
    <p v-else class="reach">Encore <strong>{{ status.movesLeftToday }} hex</strong> possibles avant le repos ({{ formatHours(status.hoursLeft) }})</p>
    <p v-if="status.skippedRests" class="reach" data-testid="hexcrawl-skipped-rests"><AppIcon icon="lucide:moon" size="0.9em" /> {{ status.skippedRests }} repos sauté{{ status.skippedRests > 1 ? 's' : '' }} depuis le dernier sommeil.</p>
    <p v-if="notice" class="callout warn" role="alert">{{ notice }}</p>

    <div v-if="config.vehicleEnabled" class="mode-row">
      <div class="segmented" role="group" aria-label="Mode de déplacement">
        <button :class="{ active: status.mode === 'vehicle' }" data-testid="hexcrawl-mode-vehicle" @click="status.mode !== 'vehicle' && act({ t: 'mode', mode: 'vehicle' })">{{ config.vehicleName }}</button>
        <button :class="{ active: status.mode === 'foot' }" data-testid="hexcrawl-mode-foot" @click="status.mode !== 'foot' && act({ t: 'mode', mode: 'foot' })">À pied</button>
      </div>
      <span class="speed">{{ formatHours(status.hoursPerHex) }} par hex</span>
    </div>

    <div v-if="config.vehicleEnabled" class="fuel" :class="{ empty: status.fuel <= 0 }">
      <span class="fuel-value" data-testid="hexcrawl-fuel-left"><AppIcon icon="lucide:fuel" size="0.9em" /> <strong>{{ status.fuel }}</strong> déplacement{{ status.fuel > 1 ? 's' : '' }}</span>
      <div class="fuel-actions">
        <input v-model.number="refillAmount" type="number" class="form-input fuel-input" :placeholder="String(config.fuelRefill)" aria-label="Quantité de carburant à ajouter" />
        <button class="action-btn" data-testid="hexcrawl-refuel" @click="act({ t: 'refuel', amount: refill })">+{{ refill }}</button>
        <button class="action-btn ghost" title="Retirer 1 déplacement" aria-label="Retirer 1 déplacement" @click="act({ t: 'refuel', amount: -1 })">−1</button>
      </div>
    </div>

    <label class="check" :class="{ on: hardNext }">
      <input :checked="hardNext" type="checkbox" data-testid="hexcrawl-hard" @change="emit('update:hardNext', $event.target.checked)" />
      Prochain hex difficile (coût double) <HelpTip id="hexcrawl.hard" />
    </label>

    <div class="actions">
      <button class="action-btn" :disabled="!status.started || inCombat" data-testid="hexcrawl-end-quarter" @click="act({ t: 'end-quarter' })">
        <AppIcon icon="lucide:skip-forward" size="0.85em" /> {{ status.used > 0 ? `Finir la tranche (${formatHours(status.hoursToFinishQuarter)})` : `Passer ${formatHours(config.quarterHours)}` }}
      </button>
      <button class="action-btn" :disabled="!status.started || inCombat" data-testid="hexcrawl-halt" :title="`Le groupe ne bouge pas pendant ${formatHours(config.quarterHours)} : chaque PJ fouille, fabrique, soigne ou monte la garde.`" @click="act({ t: 'halt' })">
        <AppIcon icon="lucide:tent" size="0.85em" /> Halte {{ formatHours(config.quarterHours) }} (fouille, fabrication…)
      </button>
      <button class="action-btn" :disabled="!status.started || inCombat" data-testid="hexcrawl-rest" @click="act({ t: 'rest' })">
        <AppIcon icon="lucide:moon" size="0.85em" /> Repos ({{ formatHours(config.restQuarters * config.quarterHours) }})
      </button>
      <button class="action-btn ghost" :disabled="!canUndo" data-testid="hexcrawl-undo" @click="emit('undo')">
        <AppIcon icon="lucide:undo-2" size="0.85em" /> Annuler
      </button>
    </div>

    <div v-if="status.army" class="army" :class="status.army.alert" data-testid="hexcrawl-army" :role="status.army.alert ? 'status' : undefined">
      <div class="army-head">
        <AppIcon icon="lucide:swords" size="0.9em" />
        <strong v-if="status.army.status === 'over'">Poursuite terminée</strong>
        <strong v-else>{{ status.army.waveName }}</strong>
      </div>
      <p v-if="status.army.status === 'waiting'" class="army-text">Départ dans {{ formatHours(status.army.releaseInHours) }}</p>
      <template v-else-if="status.army.status === 'active'">
        <p v-if="status.army.alert === 'contact'" class="army-text"><strong>Contact !</strong> L'armée a rejoint le groupe ({{ armyLabel }}).</p>
        <p v-else class="army-text">
          À <strong>{{ status.army.distance }} hex</strong> de piste, en {{ armyLabel }}
          <template v-if="status.army.adjacent"> · <strong>À une case du groupe : elle fonce dessus à la fin de la tranche.</strong></template>
          <template v-else-if="status.army.alert === 'near'"> · Le groupe voit la poussière et entend les cors.</template>
        </p>
        <div class="army-actions">
          <button class="action-btn ghost" title="Reculer l'armée d'un hex (piège)" data-testid="hexcrawl-army-back" @click="act({ t: 'army', delta: -1 })">−1</button>
          <button class="action-btn ghost" title="Avancer l'armée d'un hex" :disabled="inCombat" @click="act({ t: 'army', delta: 1 })">+1</button>
          <button class="action-btn" data-testid="hexcrawl-wave-defeated" @click="act({ t: 'wave-defeated' })">Vague battue</button>
          <button class="action-btn ghost" data-testid="hexcrawl-pursuit-end" @click="act({ t: 'pursuit-end' })">Fin de poursuite</button>
        </div>
      </template>
    </div>

    <footer class="panel-foot">
      <button class="link-btn" data-testid="hexcrawl-edit" @click="emit('edit')"><AppIcon icon="lucide:settings-2" size="0.85em" /> Réglages</button>
      <button class="link-btn danger" data-testid="hexcrawl-reset" @click="emit('reset')"><AppIcon icon="lucide:rotate-ccw" size="0.85em" /> Recommencer</button>
      <button class="link-btn danger" data-testid="hexcrawl-remove" @click="emit('remove')"><AppIcon icon="lucide:trash-2" size="0.85em" /> Retirer</button>
    </footer>
  </section>
</template>

<style scoped>
.control-section { background: var(--admin-panel-bg, var(--gradient-panel)); border: 1px solid var(--color-gold-dark); border-radius: 10px; padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.subsection-title { font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); letter-spacing: 0.15em; text-transform: uppercase; color: var(--color-gold-dark); margin: 0; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.switch, .check { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--color-text-dim); cursor: pointer; }
.check.on { color: var(--color-text); }
.clock { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; color: var(--color-text); font-size: var(--text-sm); }
.clock strong { font-family: var(--font-heading), sans-serif; font-size: var(--text-lg, 18px); color: var(--color-gold-bright); }
.pos { margin-left: auto; padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: 999px; font-weight: bold; }
.pips { display: flex; gap: 3px; }
.pip { flex: 1; height: 6px; border-radius: 3px; background: var(--surface-raised); border: 1px solid var(--color-border); }
.pip.past { background: var(--color-gold-dark); border-color: var(--color-gold-dark); }
.pip.now { background: var(--color-gold-bright); border-color: var(--color-gold-bright); }
.reach { margin: 0; font-size: var(--text-sm); color: var(--color-text-dim); }
.callout { display: flex; gap: var(--space-2); align-items: center; margin: 0; padding: var(--space-2); border-radius: 8px; background: var(--surface-gold-soft); color: var(--color-text); font-size: var(--text-sm); }
.callout.warn { background: transparent; border: 1px solid var(--color-danger); color: var(--color-danger); }
.mode-row { display: flex; align-items: center; gap: var(--space-2); }
.segmented { flex: 1; display: flex; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.segmented button { flex: 1; padding: var(--space-2); min-height: var(--touch-min, 36px); background: none; border: none; color: var(--color-text-dim); font-size: var(--text-sm); cursor: pointer; }
.segmented button.active { background: var(--surface-gold-soft); color: var(--color-text); font-weight: bold; }
.speed { font-size: var(--text-xs); color: var(--color-text-dim); white-space: nowrap; }
.fuel { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; color: var(--color-text); font-size: var(--text-sm); }
.fuel.empty .fuel-value { color: var(--color-danger); }
.fuel-actions { display: flex; align-items: center; gap: var(--space-1); }
.fuel-input { width: 3.6em; padding: var(--space-1); }
.actions, .army-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.action-btn { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2); background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark); border-radius: 8px; color: var(--color-text-on-accent); font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); letter-spacing: 0.04em; cursor: pointer; }
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.action-btn.ghost { background: var(--surface-raised); border-color: var(--color-border); color: var(--color-text); }
.action-btn.ghost:hover:not(:disabled) { background: var(--surface-raised); border-color: var(--color-gold-dark); }
.army { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); font-size: var(--text-sm); }
.army.near { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.army.contact { border-color: var(--color-danger); border-width: 2px; }
.army-head { display: flex; align-items: center; gap: var(--space-2); }
.army-text { margin: 0; color: var(--color-text-dim); }
.army.contact .army-text strong { color: var(--color-danger); }
.panel-foot { display: flex; justify-content: space-between; gap: var(--space-2); }
.link-btn { display: inline-flex; align-items: center; gap: var(--space-1); background: none; border: none; padding: var(--space-1) 0; color: var(--color-text-dim); font-size: var(--text-xs); cursor: pointer; }
.link-btn:hover { color: var(--color-text); }
.link-btn.danger:hover { color: var(--color-danger); }
</style>
