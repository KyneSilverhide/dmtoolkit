<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { DENSITY_ORDER, getDensityMeta } from '../utils/themePreferences.js'

// Bascule Compact / Confortable. Ne change QUE l'espacement, deux paliers de typo et la
// cible tactile (styles/tokens.derive.css) — jamais la palette ni la mise en page. Le MJ
// sur grand écran veut de la densité, le joueur sur téléphone veut des cibles atteignables ;
// avant cette bascule les deux subissaient le même réglage, calibré pour ni l'un ni l'autre.
defineProps({
  modelValue: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue'])

const densities = computed(() => DENSITY_ORDER.map(key => ({ key, ...getDensityMeta(key) })))
</script>

<template>
  <div class="density-toggle" role="group" aria-label="Densité d'affichage">
    <button
      v-for="d in densities"
      :key="d.key"
      type="button"
      class="dt-option"
      :class="{ active: d.key === modelValue }"
      :aria-pressed="d.key === modelValue"
      :title="`Densité ${d.label.toLowerCase()}`"
      :data-testid="`density-option-${d.key}`"
      @click="emit('update:modelValue', d.key)"
    >
      <AppIcon :icon="d.icon" size="0.85em" />
      <span class="dt-label">{{ d.label }}</span>
    </button>
  </div>
</template>

<style scoped>
/* inline-flex : même raison que ThemePicker — ne pas s'étirer dans un conteneur en colonne. */
.density-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.dt-option {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--color-text-dim);
  font-family: var(--font-ui), sans-serif;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.dt-option:hover { background: var(--surface-hover); color: var(--color-text); }
.dt-option.active {
  background: var(--surface-gold-soft-strong);
  color: var(--color-gold-bright);
}

@media (max-width: 767px) {
  .dt-label { display: none; }
}
</style>
