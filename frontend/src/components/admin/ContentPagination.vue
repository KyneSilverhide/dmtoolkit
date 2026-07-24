<script setup>
import AppIcon from '../AppIcon.vue'

const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
})
const emit = defineEmits(['update:page'])

function go(p) {
  emit('update:page', Math.min(Math.max(p, 1), props.totalPages))
}
</script>

<template>
  <div class="content-pagination">
    <button type="button" class="page-btn" :disabled="page <= 1" @click="go(page - 1)">
      <AppIcon icon="lucide:chevron-left" size="0.8em" /> Précédent
    </button>
    <span class="page-indicator">Page {{ page }} / {{ totalPages }}</span>
    <button type="button" class="page-btn" :disabled="page >= totalPages" @click="go(page + 1)">
      Suivant <AppIcon icon="lucide:chevron-right" size="0.8em" />
    </button>
  </div>
</template>

<style scoped>
.content-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem 0 0.25rem;
}

.page-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none;
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.35rem 0.85rem;
  color: var(--color-gold-dark);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.page-btn:hover:not(:disabled) { color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.page-indicator {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  white-space: nowrap;
}
</style>
