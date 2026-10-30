<script setup>
import { computed } from 'vue'
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'
import { HEXCRAWL_PRESETS, actionQuarters, describeTravel, formatHours, kmToMiles } from '@/utils/hexcrawl.js'

const props = defineProps({
  config: { type: Object, required: true },
})
const emit = defineEmits(['update:config'])

const summary = computed(() => describeTravel(props.config))
const hexMiles = computed(() => Math.round(kmToMiles(props.config.hexKm || 0) * 10) / 10)

function patch(values) { emit('update:config', { ...props.config, ...values }) }
function patchPursuit(values) { patch({ pursuit: { ...props.config.pursuit, ...values } }) }

function num(value, fallback = 0, min = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, n) : fallback
}

// La config compte en tranches, les champs en heures : la saisie s'arrondit à une tranche entière.
const slice = computed(() => props.config.quarterHours)
function hoursToQuarters(event, fallback, min = 0) {
  const quarters = Math.max(min, Math.round(num(event.target.value, fallback) / slice.value))
  event.target.value = quarters * slice.value
  return quarters
}
function setActionHours(event) {
  patch({ quartersPerDay: hoursToQuarters(event, 16, 1) + props.config.restQuarters })
}
function setRestHours(event) {
  const restQuarters = hoursToQuarters(event, 8)
  patch({ restQuarters, quartersPerDay: actionQuarters(props.config) + restQuarters })
}

function applyPreset(preset) {
  emit('update:config', {
    ...structuredClone(preset.config),
    labelColOffset: props.config.labelColOffset,
    labelRowOffset: props.config.labelRowOffset,
  })
}

function parseMoves(text) {
  return String(text).split(/[\s,;]+/).map(v => parseInt(v, 10)).filter(v => v >= 0)
}

function waveTotal(wave) {
  const moves = wave.moves || []
  if (!moves.length) return 0
  const perDay = props.config.quartersPerDay
  let total = 0
  for (let i = 0; i < perDay; i++) total += moves[i % moves.length]
  return total
}

function patchWave(index, values) {
  const waves = props.config.pursuit.waves.map((wave, i) => (i === index ? { ...wave, ...values } : wave))
  patchPursuit({ waves })
}
function addWave() {
  const moves = new Array(props.config.quartersPerDay).fill(1)
  patchPursuit({ waves: [...props.config.pursuit.waves, { name: `Vague ${props.config.pursuit.waves.length + 1}`, moves }] })
}
function removeWave(index) {
  patchPursuit({ waves: props.config.pursuit.waves.filter((_, i) => i !== index) })
}
</script>

<template>
  <div class="travel-step">
    <div class="presets" role="group" aria-label="Modèles de réglages">
      <span class="label">Partir d'un modèle :</span>
      <button v-for="preset in HEXCRAWL_PRESETS" :key="preset.key" class="wiz-btn" @click="applyPreset(preset)">{{ preset.label }}</button>
    </div>

    <div class="columns">
      <div class="col">
        <section class="card">
          <h4><AppIcon icon="lucide:ruler" size="0.9em" /> Échelle et temps <HelpTip id="hexcrawl.scale" /></h4>
          <div class="fields">
            <label>Taille d'un hex (km)
              <input :value="config.hexKm" type="number" min="0.1" step="0.5" class="form-input" data-testid="hexcrawl-hex-km" @change="patch({ hexKm: num($event.target.value, 10, 0.1) })" />
              <small>≈ {{ hexMiles }} miles</small>
            </label>
            <label>Durée d'une tranche (h)
              <input :value="config.quarterHours" type="number" min="1" max="24" class="form-input" data-testid="hexcrawl-slice-hours" @change="patch({ quarterHours: num($event.target.value, 4, 1) })" />
              <small>une activité par tranche</small>
            </label>
            <label>Action par jour (h)
              <input :value="actionQuarters(config) * slice" type="number" :min="slice" :step="slice" class="form-input" data-testid="hexcrawl-action-hours" @change="setActionHours" />
            </label>
            <label>Repos par jour (h)
              <input :value="config.restQuarters * slice" type="number" min="0" :step="slice" class="form-input" data-testid="hexcrawl-rest-hours" @change="setRestHours" />
            </label>
          </div>
        </section>

        <section class="card">
          <h4><AppIcon icon="lucide:truck" size="0.9em" /> Déplacement <HelpTip id="hexcrawl.movement" /></h4>
          <div class="fields">
            <label>À pied (hex par {{ formatHours(slice) }})
              <input :value="config.footSpeed" type="number" min="1" class="form-input" data-testid="hexcrawl-foot-speed" @change="patch({ footSpeed: num($event.target.value, 1, 1) })" />
            </label>
          </div>
          <label class="check"><input :checked="config.vehicleEnabled" type="checkbox" data-testid="hexcrawl-vehicle" @change="patch({ vehicleEnabled: $event.target.checked })" /> Le groupe a un véhicule</label>
          <div v-if="config.vehicleEnabled" class="fields">
            <label>Nom
              <input :value="config.vehicleName" class="form-input" maxlength="30" @change="patch({ vehicleName: $event.target.value.trim() || 'Véhicule' })" />
            </label>
            <label>Hex par {{ formatHours(slice) }}
              <input :value="config.vehicleSpeed" type="number" min="1" class="form-input" @change="patch({ vehicleSpeed: num($event.target.value, 2, 1) })" />
            </label>
            <label>Carburant au départ
              <input :value="config.fuelStart" type="number" min="0" class="form-input" data-testid="hexcrawl-fuel" @change="patch({ fuelStart: num($event.target.value, 16) })" />
              <small>en déplacements</small>
            </label>
            <label>Recharge standard
              <input :value="config.fuelRefill" type="number" min="1" class="form-input" @change="patch({ fuelRefill: num($event.target.value, 8, 1) })" />
              <small>déplacements</small>
            </label>
          </div>
          <label v-if="config.vehicleEnabled" class="check"><input :checked="config.showFuelOnTv" type="checkbox" @change="patch({ showFuelOnTv: $event.target.checked })" /> Afficher le carburant sur la TV</label>
          <label class="check"><input :checked="config.revealNeighbors" type="checkbox" @change="patch({ revealNeighbors: $event.target.checked })" /> En avançant, révéler aussi les cases voisines</label>
        </section>
      </div>

      <div class="col">
        <section class="card summary" aria-live="polite" data-testid="hexcrawl-summary">
          <h4><AppIcon icon="lucide:calculator" size="0.9em" /> Ce que ça donne</h4>
          <p>Une journée compte <strong>{{ formatHours(summary.actionQuarters * slice) }} d'action</strong> au maximum.</p>
          <ul>
            <li>À pied : <strong>{{ summary.foot.hexes }} hex par jour</strong> ({{ summary.foot.km }} km, ≈ {{ summary.foot.miles }} miles)</li>
            <li v-if="summary.vehicle">{{ config.vehicleName }} : <strong>{{ summary.vehicle.hexes }} hex par jour</strong> ({{ summary.vehicle.km }} km, ≈ {{ summary.vehicle.miles }} miles)</li>
            <li v-if="summary.vehicle">Autonomie : <strong>{{ Math.round(summary.fuelDays * 10) / 10 }} jour{{ summary.fuelDays > 1 ? 's' : '' }}</strong> de route, et {{ Math.round(summary.refillDays * 10) / 10 }} de plus par recharge</li>
          </ul>
        </section>

        <section class="card">
          <h4><AppIcon icon="lucide:swords" size="0.9em" /> Poursuite <HelpTip id="hexcrawl.pursuit" /></h4>
          <label class="check"><input :checked="config.pursuit.enabled" type="checkbox" data-testid="hexcrawl-pursuit" @change="patchPursuit({ enabled: $event.target.checked })" /> Une armée suit la piste du groupe</label>
          <template v-if="config.pursuit.enabled">
            <div class="fields">
              <label>Départ après (h)
                <input :value="config.pursuit.startDelay * slice" type="number" min="0" :step="slice" class="form-input" @change="patchPursuit({ startDelay: hoursToQuarters($event, 8) })" />
              </label>
              <label>Délai entre vagues (h)
                <input :value="config.pursuit.waveDelay * slice" type="number" min="0" :step="slice" class="form-input" @change="patchPursuit({ waveDelay: hoursToQuarters($event, 36) })" />
              </label>
              <label>Alerte à (hex de piste)
                <input :value="config.pursuit.nearDistance" type="number" min="0" class="form-input" @change="patchPursuit({ nearDistance: num($event.target.value, 3) })" />
              </label>
            </div>
            <table class="waves">
              <thead><tr><th>Vague</th><th>Hex toutes les {{ formatHours(slice) }}</th><th>Par jour</th><th><span class="sr-only">Retirer</span></th></tr></thead>
              <tbody>
                <tr v-for="(wave, index) in config.pursuit.waves" :key="index">
                  <td><input :value="wave.name" class="form-input" maxlength="40" :aria-label="`Nom de la vague ${index + 1}`" @change="patchWave(index, { name: $event.target.value })" /></td>
                  <td><input :value="wave.moves.join(', ')" class="form-input" :aria-label="`Mouvements de ${wave.name}`" @change="patchWave(index, { moves: parseMoves($event.target.value) })" /></td>
                  <td class="total">{{ waveTotal(wave) }}</td>
                  <td><button class="icon-btn" :title="`Retirer ${wave.name}`" @click="removeWave(index)"><AppIcon icon="lucide:trash-2" size="0.9em" /></button></td>
                </tr>
              </tbody>
            </table>
            <button class="wiz-btn" @click="addWave"><AppIcon icon="lucide:plus" size="0.9em" /> Ajouter une vague</button>
            <label class="check"><input :checked="config.pursuit.showOnTv" type="checkbox" @change="patchPursuit({ showOnTv: $event.target.checked })" /> Montrer l'armée aux joueurs sur la TV</label>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.travel-step { display: flex; flex-direction: column; gap: var(--space-3); }
.presets { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.label { color: var(--color-text-dim); font-size: var(--text-sm); }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: var(--space-3); align-items: start; }
.col { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: 10px; background: var(--admin-panel-bg, var(--gradient-panel)); }
.card h4 { margin: 0; font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-gold-dark); }
.summary { border-color: var(--color-gold-dark); }
.summary p { margin: 0; font-size: var(--text-sm); color: var(--color-text-dim); }
.summary ul { margin: 0; padding-left: 1.1em; font-size: var(--text-sm); color: var(--color-text); display: flex; flex-direction: column; gap: var(--space-1); }
.fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: var(--space-2); }
.fields label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-xs); color: var(--color-text-dim); min-width: 0; }
.fields input { width: 100%; min-width: 0; }
small { font-size: var(--text-2xs); color: var(--color-text-dim); }
.check { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--color-text); cursor: pointer; }
.waves { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.waves th { text-align: left; font-size: var(--text-xs); font-weight: normal; color: var(--color-text-dim); padding-bottom: var(--space-1); }
.waves td { padding: 2px var(--space-1) 2px 0; }
.waves input { width: 100%; min-width: 0; }
.total { text-align: center; color: var(--color-text-dim); }
.icon-btn { background: none; border: none; color: var(--color-text-dim); cursor: pointer; padding: var(--space-1); }
.icon-btn:hover { color: var(--color-danger); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
.wiz-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-radius: 8px; border: 1px solid var(--color-border); background: var(--surface-raised); color: var(--color-text); font-size: var(--text-sm); cursor: pointer; }
.wiz-btn:hover { border-color: var(--color-gold-dark); }
</style>
