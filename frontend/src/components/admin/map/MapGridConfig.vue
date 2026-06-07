<script setup>
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  gridType: { type: String, default: 'none' },
  gridCols: { type: Number, default: 20 },
  gridRows: { type: Number, default: 15 },
  gridHexOrientation: { type: String, default: 'flat' },
  gridOffsetX: { type: Number, default: 0 },
  gridOffsetY: { type: Number, default: 0 },
  gridDetecting: { type: Boolean, default: false },
  gridSaving: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:show',
  'update:gridType',
  'update:gridCols',
  'update:gridRows',
  'update:gridHexOrientation',
  'update:gridOffsetX',
  'update:gridOffsetY',
  'save',
])
</script>

<template>
  <div class="control-section">
    <h4 class="subsection-title">
      <AppIcon icon="lucide:grid-3x3" size="0.85em" /> Grille <HelpTip id="map.grid" />
    </h4>

    <div class="inline-actions">
      <button class="action-btn" :class="{ active: show }" @click="emit('update:show', !show)">
        <AppIcon icon="lucide:settings-2" size="0.85em" />
        {{ show ? 'Masquer' : 'Configurer' }}
      </button>
      <span v-if="gridDetecting" class="hint-text"><AppIcon icon="lucide:loader" size="0.8em" /> Détection…</span>
      <span v-else-if="gridType !== 'none'" class="grid-status-badge">
        <AppIcon :icon="gridType === 'hex' ? 'lucide:hexagon' : 'lucide:grid-3x3'" size="0.8em" />
        {{ gridType === 'hex' ? 'Hexagones' : 'Carrés' }} {{ gridCols }}×{{ gridRows }}
      </span>
      <span v-else class="hint-text">Peinture libre</span>
    </div>

    <template v-if="show">
      <div class="grid-config-panel">
        <div class="grid-config-row">
          <label class="grid-config-label">Type</label>
          <div class="grid-type-selector">
            <button
              v-for="t in ['none','square','hex']"
              :key="t"
              class="type-btn"
              :class="{ active: gridType === t }"
              @click="emit('update:gridType', t)"
            >
              <AppIcon
                :icon="t === 'hex' ? 'lucide:hexagon' : t === 'square' ? 'lucide:grid-3x3' : 'lucide:brush'"
                size="0.8em"
              />
              {{ t === 'hex' ? 'Hexagones' : t === 'square' ? 'Carrés' : 'Libre' }}
            </button>
          </div>
        </div>

        <template v-if="gridType !== 'none'">
          <div class="grid-config-row">
            <label class="grid-config-label">Colonnes : {{ gridCols }}</label>
            <input :value="gridCols" type="range" min="2" max="100" class="brush-slider" @input="emit('update:gridCols', +$event.target.value)" />
          </div>
          <div class="grid-config-row">
            <label class="grid-config-label">Lignes : {{ gridRows }}</label>
            <input :value="gridRows" type="range" min="2" max="100" class="brush-slider" @input="emit('update:gridRows', +$event.target.value)" />
          </div>
          <div v-if="gridType === 'hex'" class="grid-config-row">
            <label class="grid-config-label">Orientation</label>
            <div class="grid-type-selector">
              <button class="type-btn" :class="{ active: gridHexOrientation === 'flat' }" @click="emit('update:gridHexOrientation', 'flat')">Plate</button>
              <button class="type-btn" :class="{ active: gridHexOrientation === 'pointy' }" @click="emit('update:gridHexOrientation', 'pointy')">Pointue</button>
            </div>
          </div>
          <div class="grid-config-row">
            <label class="grid-config-label">Décalage X : {{ Math.round(gridOffsetX * 1000) / 1000 }}</label>
            <input :value="gridOffsetX" type="range" :min="-1 / gridCols" :max="1 / gridCols" :step="1 / gridCols / 20" class="brush-slider" @input="emit('update:gridOffsetX', +$event.target.value)" />
          </div>
          <div class="grid-config-row">
            <label class="grid-config-label">Décalage Y : {{ Math.round(gridOffsetY * 1000) / 1000 }}</label>
            <input :value="gridOffsetY" type="range" :min="-1 / gridRows" :max="1 / gridRows" :step="1 / gridRows / 20" class="brush-slider" @input="emit('update:gridOffsetY', +$event.target.value)" />
          </div>
        </template>

        <button class="action-btn save-grid-btn" :disabled="gridSaving" @click="emit('save')">
          <AppIcon icon="lucide:save" size="0.85em" />
          {{ gridSaving ? 'Enregistrement…' : 'Enregistrer la grille' }}
        </button>
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
.hint-text { font-family: var(--font-body), sans-serif; font-size: 0.75rem; color: var(--color-text-dim); margin: 0; }

.grid-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 999px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
}

.grid-config-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  background: rgba(0,0,0,0.2);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.grid-config-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.grid-config-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  letter-spacing: 0.05em;
  min-width: 7rem;
  flex-shrink: 0;
}
.grid-type-selector { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.type-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.65rem;
  background: var(--surface-raised, #1e1e2e);
  border: 1.5px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.18s;
}
.type-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold); }
.type-btn.active { border-color: var(--color-gold-bright); color: var(--color-gold-bright); background: var(--surface-gold-soft); }

.action-btn {
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark);
  border-radius: 8px; color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif; font-size: 0.72rem; letter-spacing: 0.08em; cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn.active { background: var(--gradient-accent-action-hover); border-color: var(--color-gold-bright); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.save-grid-btn { width: 100%; margin-top: 0.2rem; }
.brush-slider { flex: 1; accent-color: var(--color-gold); }
</style>
