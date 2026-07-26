<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useConditions } from '@/composables/useConditions.js'

const props = defineProps({
  active: { type: Boolean, default: false },
  prefillQuery: { type: String, default: '' },
  prefillToken: { type: Number, default: 0 },
})

const { conditions, load } = useConditions()
watch(() => props.active, (v) => { if (v) load() }, { immediate: true })

const query = ref('')
watch(() => props.prefillToken, () => { if (props.prefillToken) query.value = props.prefillQuery })

function stripAccents(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function normalize(str) {
  return stripAccents(str).toLowerCase()
}

const filteredConditions = computed(() => {
  const q = normalize(query.value.trim())
  if (!q) return conditions.value
  return conditions.value.filter(c => normalize(c.label).includes(q) || normalize(c.description).includes(q))
})
</script>

<template>
  <div class="condition-search-tool">
    <div class="search-bar">
      <input v-model="query" class="search-input" placeholder="Nom de l'état, effet…" />
    </div>

    <p v-if="filteredConditions.length === 0" class="no-results">Aucun état trouvé{{ query ? ` pour « ${query} »` : '' }}</p>

    <div class="condition-list">
      <article v-for="cond in filteredConditions" :key="cond.id" class="condition-card">
        <div class="condition-head">
          <AppIcon :icon="cond.icon" :color="cond.color" size="1.1em" />
          <h4 class="condition-name">{{ cond.label }}</h4>
        </div>
        <p class="condition-desc">{{ cond.description }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.condition-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
.search-bar { display: flex; gap: 0.45rem; }
.search-input {
  flex: 1;
  background: var(--player-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  color: var(--color-parchment);
  outline: none;
}
.search-input:focus { border-color: var(--color-gold-dark); }
.no-results { margin: 0; color: var(--color-text-dim); font-size: 0.85rem; }
.condition-list { display: flex; flex-direction: column; gap: 0.6rem; }
.condition-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.condition-head { display: flex; align-items: center; gap: 0.4rem; }
.condition-name { margin: 0; font-size: 0.95rem; font-family: var(--font-heading), sans-serif; color: var(--color-parchment); }
.condition-desc { margin: 0; color: var(--color-text-dim); font-size: 0.78rem; line-height: 1.45; }
</style>
