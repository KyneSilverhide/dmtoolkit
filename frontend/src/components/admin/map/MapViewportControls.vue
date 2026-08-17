<script setup>
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'

const props = defineProps({
  viewport: { type: Object, default: () => ({ x: 0, y: 0, scale: 1 }) },
})

const emit = defineEmits(['zoom-in', 'zoom-out', 'reset'])
</script>

<template>
  <div class="control-section">
    <h4 class="subsection-title"><AppIcon icon="lucide:maximize-2" size="0.85em" /> Viewport TV <HelpTip id="map.viewport" /></h4>
    <p class="viewport-info">
      x: {{ viewport.x.toFixed(0) }}, y: {{ viewport.y.toFixed(0) }}, zoom: {{ viewport.scale.toFixed(2) }}×
    </p>
    <div class="inline-actions">
      <button class="action-btn" @click="emit('zoom-in')">＋</button>
      <button class="action-btn" @click="emit('zoom-out')">－</button>
      <button class="action-btn" @click="emit('reset')">↺</button>
    </div>
  </div>
</template>

<style scoped>
.subsection-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 var(--space-2);
}
.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2);
}
.inline-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
.viewport-info { font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); color: var(--color-text-dim); letter-spacing: 0.06em; margin: 0; }
.action-btn {
  padding: var(--space-2) var(--space-3);
  background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark);
  border-radius: 8px; color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); letter-spacing: 0.08em; cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
</style>
