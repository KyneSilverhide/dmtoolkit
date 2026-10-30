<script setup>
import { onMounted, ref } from 'vue'
import AppIcon from '../../AppIcon.vue'

defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: 'lucide:triangle-alert' },
  danger: { type: Boolean, default: false },
})

const dialogEl = ref(null)
onMounted(() => dialogEl.value?.querySelector('button')?.focus())
</script>

<template>
  <Teleport to="body">
    <div class="alert-overlay">
      <div ref="dialogEl" class="alert-box" :class="{ danger }" role="alertdialog" aria-modal="true" aria-labelledby="hexcrawl-alert-title" data-testid="hexcrawl-alert">
        <h3 id="hexcrawl-alert-title"><AppIcon :icon="icon" size="1.1em" /> {{ title }}</h3>
        <div class="alert-body"><slot /></div>
        <div class="alert-actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.alert-overlay { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; align-items: center; justify-content: center; padding: var(--space-3); background: rgba(0, 0, 0, 0.65); }
.alert-box { width: min(480px, 100%); display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-gold-dark); border-radius: var(--radius-md); color: var(--color-text); }
.alert-box.danger { border: 2px solid var(--color-danger); }
.alert-box h3 { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-family: var(--font-heading), sans-serif; font-size: var(--text-lg); color: var(--color-gold-bright); }
.alert-box.danger h3 { color: var(--color-danger); }
.alert-body { display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm); }
.alert-body :deep(p) { margin: 0; }
.alert-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; }
.alert-actions :deep(button) { min-height: var(--touch-min); padding: var(--space-2) var(--space-3); border-radius: 8px; border: 1px solid var(--color-border); background: var(--surface-raised); color: var(--color-text); font-size: var(--text-sm); cursor: pointer; }
.alert-actions :deep(button:hover) { border-color: var(--color-gold-dark); }
.alert-actions :deep(button.primary) { background: var(--gradient-accent-action); border-color: var(--color-gold-dark); color: var(--color-text-on-accent); }
.alert-actions :deep(button.primary:hover) { background: var(--gradient-accent-action-hover); }
</style>
