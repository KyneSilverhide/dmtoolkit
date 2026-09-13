<script setup>
import { computed } from 'vue'
import { DASHBOARD_LAYOUTS, gaugeIdFromWidgetType } from '@/utils/tvWidgets.js'
import TvTensionScale from './TvTensionScale.vue'
import TvTimerWidgetCompact from './TvTimerWidgetCompact.vue'

// Vue dynamique : compose plusieurs widgets Rythme (déjà actifs indépendamment — jauges
// nommées, minuteur libre) dans un layout choisi par le MJ (TvControls.vue). C'est un
// tv_mode exclusif au même titre que 'tension'/'doom' — pas un overlay superposé aux
// autres scènes (voir CLAUDE.md / socket.js set-dashboard-layout).
//
// Une jauge (`gauges`) est multi-instance — contrairement à l'échelle de tension
// classique (singleton, un seul écran plein à la fois) — d'où sa propre couleur/vibration
// calculées ici par instance plutôt que reçues en props uniques comme avant.
const TENSION_COLOR_MEDIUM_RATIO = 0.33
const TENSION_COLOR_HIGH_RATIO = 0.66
const TENSION_SHAKE_MEDIUM_RATIO = 0.4
const TENSION_SHAKE_HARD_RATIO = 0.75

const props = defineProps({
  layout: { type: String, default: null },
  slots: { type: Array, default: () => [] },
  gauges: { type: Array, default: () => [] },
  activeTimer: { type: Object, default: null },
  timerRemaining: { type: Number, default: 0 },
  timerRemainingLabel: { type: String, default: '00:00' },
  timerDanger: { type: Boolean, default: false },
})

const layoutDef = computed(() => DASHBOARD_LAYOUTS.find(l => l.key === props.layout))
const slotKeys = computed(() => layoutDef.value?.slots || [])

function widgetTypeFor(slotKey) {
  return props.slots.find(s => s.slot === slotKey)?.widgetType || null
}

function gaugeFor(slotKey) {
  const id = gaugeIdFromWidgetType(widgetTypeFor(slotKey))
  if (id == null) return null
  return props.gauges.find(g => g.id === id) || null
}

function gaugeProgress(gauge) {
  if (!gauge?.steps) return 0
  const dir = gauge.direction || 'ascending'
  const p = dir === 'descending' ? (gauge.steps - gauge.level) / gauge.steps : gauge.level / gauge.steps
  return Math.min(1, Math.max(0, p))
}

function gaugeColor(gauge) {
  const p = gaugeProgress(gauge)
  if (p < TENSION_COLOR_MEDIUM_RATIO) return 'var(--tv-success-text)'
  if (p < TENSION_COLOR_HIGH_RATIO) return 'var(--tv-warning-text)'
  return 'var(--tv-danger-text)'
}

function gaugeShakeClass(gauge) {
  if (!gauge?.vibrationEnabled) return ''
  const p = gaugeProgress(gauge)
  if (p < TENSION_SHAKE_MEDIUM_RATIO) return 'shake-soft'
  if (p < TENSION_SHAKE_HARD_RATIO) return 'shake-medium'
  return 'shake-hard'
}
</script>

<template>
  <div class="tv-dashboard" :class="`tv-dashboard-${layout || '2-col'}`" data-testid="tv-mode-dashboard">
    <div v-for="slotKey in slotKeys" :key="slotKey" class="dashboard-cell" :data-slot="slotKey">
      <TvTensionScale
        v-if="gaugeFor(slotKey)"
        compact
        :active-tension-scale="gaugeFor(slotKey)"
        :tension-color="gaugeColor(gaugeFor(slotKey))"
        :tension-shake-class="gaugeShakeClass(gaugeFor(slotKey))"
      />
      <TvTimerWidgetCompact
        v-else-if="widgetTypeFor(slotKey) === 'timer' && activeTimer"
        :active-timer="activeTimer"
        :remaining="timerRemaining"
        :remaining-label="timerRemainingLabel"
        :danger="timerDanger"
      />
      <div v-else class="dashboard-cell-empty">
        <span v-if="widgetTypeFor(slotKey)">En attente…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tv-dashboard {
  flex: 1;
  display: grid;
  gap: 1.25rem;
  padding: 2rem;
  box-sizing: border-box;
}
.tv-dashboard-2-col { grid-template-columns: 1fr 1fr; }
.tv-dashboard-3-col { grid-template-columns: 1fr 1fr 1fr; }
.tv-dashboard-2-row {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr 1fr;
}
.tv-dashboard-4-corners {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.dashboard-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--tv-panel-bg);
  overflow: hidden;
  /* Les widgets compacts (TvTensionScale/TvTimerWidgetCompact en mode .compact) se
     dimensionnent en unités cq* relatives à CETTE cellule plutôt qu'au viewport — un
     widget reste lisible à distance quel que soit le layout (colonne étroite et haute,
     ligne large et basse, coin carré...), sans clamp() arbitraire par layout. */
  container-type: size;
}

.dashboard-cell-empty {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  opacity: 0.6;
}
</style>
