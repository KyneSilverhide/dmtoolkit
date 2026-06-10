<script setup>
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'

const props = defineProps({
  fogEnabled: { type: Boolean, default: false },
  gridType: { type: String, default: 'none' },
  brushRadius: { type: Number, default: 30 },
  minBrushRadius: { type: Number, default: 5 },
  maxBrushRadius: { type: Number, default: 100 },
})

const emit = defineEmits(['toggle', 'reset', 'update:brushRadius'])
</script>

<template>
  <div class="control-section">
    <h4 class="subsection-title"><AppIcon icon="lucide:cloud" size="0.85em" /> Brouillard <HelpTip id="map.fog" /></h4>
    <div class="inline-actions">
      <button class="action-btn" :class="{ active: fogEnabled }" @click="emit('toggle')">
        <AppIcon :icon="fogEnabled ? 'lucide:eye-off' : 'lucide:eye'" size="0.85em" />
        {{ fogEnabled ? 'Désactiver' : 'Activer' }}
      </button>
      <button class="action-btn danger-btn" :disabled="!fogEnabled" @click="emit('reset')">
        <AppIcon icon="lucide:refresh-cw" size="0.85em" /> Reset
      </button>
    </div>
    <template v-if="fogEnabled && gridType === 'none'">
      <div class="brush-controls">
        <label class="brush-label">
          Rayon : {{ brushRadius }}px <HelpTip id="map.fog-brush" />
          <input :value="brushRadius" type="range" :min="minBrushRadius" :max="maxBrushRadius" class="brush-slider" @input="emit('update:brushRadius', +$event.target.value)" />
        </label>
      </div>
    </template>
  </div>
</template>

<style scoped>
.subsection-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 0.4rem;
}
.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;
}
.inline-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: center; }
.action-btn {
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark);
  border-radius: 8px; color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif; font-size: 0.72rem; letter-spacing: 0.08em; cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn.active { background: var(--gradient-accent-action-hover); border-color: var(--color-gold-bright); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-btn { border-color: var(--admin-danger-border, var(--color-danger-border)); color: var(--admin-danger-text, var(--color-danger)); background: var(--gradient-danger-action); }
.brush-controls { display: flex; flex-direction: column; gap: 0.4rem; }
.brush-label { display: flex; align-items: center; gap: 0.4rem; color: var(--color-text-dim); font-family: var(--font-heading), sans-serif; font-size: 0.7rem; }
.brush-slider { flex: 1; accent-color: var(--color-gold); }
</style>
