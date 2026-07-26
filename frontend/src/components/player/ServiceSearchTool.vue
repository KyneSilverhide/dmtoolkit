<script setup>
import { computed, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { usePublicContentList } from '@/composables/usePublicContentList.js'

const props = defineProps({
  active: { type: Boolean, default: false },
  prefillQuery: { type: String, default: '' },
  prefillToken: { type: Number, default: 0 },
})

function serviceMatches(service, q, normalize) {
  if (normalize(service.name).includes(q)) return true
  if (normalize(service.price).includes(q)) return true
  return normalize(service.description).includes(q)
}

const { filtered: services, loading, error, query, load } = usePublicContentList('/api/services/public', serviceMatches)
watch(() => props.active, (v) => { if (v) load() }, { immediate: true })
watch(() => props.prefillToken, () => { if (props.prefillToken) query.value = props.prefillQuery })

// Regroupe par catégorie en conservant l'ordre d'apparition, comme ServiceSearch.vue (MJ).
const groupedServices = computed(() => {
  const groups = []
  const byCategory = new Map()
  for (const service of services.value) {
    const category = service.category || 'Autre'
    let group = byCategory.get(category)
    if (!group) {
      group = { category, services: [] }
      byCategory.set(category, group)
      groups.push(group)
    }
    group.services.push(service)
  }
  return groups
})
</script>

<template>
  <div class="service-search-tool">
    <div class="search-bar">
      <input v-model="query" class="search-input" placeholder="Nom du service, catégorie…" />
    </div>

    <p v-if="loading" class="no-results">Chargement…</p>
    <p v-else-if="error" class="no-results">Impossible de charger les services.</p>
    <p v-else-if="services.length === 0" class="no-results">Aucun service trouvé{{ query ? ` pour « ${query} »` : '' }}</p>

    <div v-else class="category-groups">
      <div v-for="group in groupedServices" :key="group.category" class="category-group">
        <h4 class="category-title">{{ group.category }}</h4>
        <div class="service-list">
          <article v-for="service in group.services" :key="service.slug" class="service-card">
            <div class="service-head">
              <h4 class="service-name">{{ service.name }}</h4>
              <span class="price-badge"><AppIcon icon="lucide:coins" size="0.7em" /> {{ service.price }}</span>
            </div>
            <p class="service-desc">{{ service.description }}</p>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.service-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
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
.category-groups { display: flex; flex-direction: column; gap: 1rem; }
.category-title {
  margin: 0 0 0.4rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.service-list { display: flex; flex-direction: column; gap: 0.5rem; }
.service-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.service-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.service-name { margin: 0; font-size: 0.9rem; font-family: var(--font-heading), sans-serif; color: var(--color-parchment); }
.price-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
  white-space: nowrap;
}
.service-desc { margin: 0; color: var(--color-text-dim); font-size: 0.76rem; line-height: 1.4; }
</style>
