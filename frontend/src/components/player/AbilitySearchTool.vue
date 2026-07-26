<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import ContentPagination from '../admin/ContentPagination.vue'
import { usePublicContentList } from '@/composables/usePublicContentList.js'

const props = defineProps({
  active: { type: Boolean, default: false },
  prefillQuery: { type: String, default: '' },
  prefillToken: { type: Number, default: 0 },
})

const PAGE_SIZE = 20

function abilityMatches(ability, q, normalize) {
  if (normalize(ability.name).includes(q)) return true
  if (normalize(ability.description).includes(q)) return true
  if (normalize(ability.className).includes(q)) return true
  return normalize(ability.subclassName || '').includes(q)
}

const { filtered: abilities, loading, error, query, load } = usePublicContentList('/api/classes/abilities/public', abilityMatches)
watch(() => props.active, (v) => { if (v) load() }, { immediate: true })
watch(() => props.prefillToken, () => { if (props.prefillToken) query.value = props.prefillQuery })

const page = ref(1)
watch(query, () => { page.value = 1 })

const isBrowsing = computed(() => query.value.trim().length === 0)
const totalPages = computed(() => Math.max(1, Math.ceil(abilities.value.length / PAGE_SIZE)))
const pageItems = computed(() => {
  if (!isBrowsing.value) return abilities.value
  const start = (page.value - 1) * PAGE_SIZE
  return abilities.value.slice(start, start + PAGE_SIZE)
})
</script>

<template>
  <div class="ability-search-tool">
    <div class="search-bar">
      <input v-model="query" class="search-input" placeholder="Nom d'une aptitude, classe…" />
    </div>

    <p v-if="loading" class="no-results">Chargement…</p>
    <p v-else-if="error" class="no-results">Impossible de charger les aptitudes.</p>
    <p v-else-if="abilities.length === 0" class="no-results">Aucune aptitude trouvée{{ query ? ` pour « ${query} »` : '' }}</p>

    <div v-else class="ability-list">
      <article v-for="ability in pageItems" :key="ability.id" class="ability-card">
        <div class="ability-head">
          <AppIcon :icon="ability.classIcon || 'lucide:sparkle'" size="1.1em" color="var(--color-gold-dark)" />
          <h4 class="ability-name">{{ ability.name }}</h4>
        </div>
        <p class="ability-source">{{ [ability.className, ability.subclassName].filter(Boolean).join(' · ') }}<template v-if="ability.level"> · Niveau {{ ability.level }}</template></p>
        <p class="ability-desc">{{ ability.description }}</p>
      </article>
    </div>

    <ContentPagination v-if="isBrowsing && totalPages > 1" v-model:page="page" :total-pages="totalPages" />
  </div>
</template>

<style scoped>
.ability-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
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
.ability-list { display: flex; flex-direction: column; gap: 0.6rem; }
.ability-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ability-head { display: flex; align-items: center; gap: 0.4rem; }
.ability-name { margin: 0; font-size: 0.95rem; font-family: var(--font-heading), sans-serif; color: var(--color-parchment); }
.ability-source { margin: 0; color: var(--color-gold-dark); font-size: 0.65rem; letter-spacing: 0.05em; text-transform: uppercase; font-family: var(--font-heading), sans-serif; }
.ability-desc { margin: 0; color: var(--color-text-dim); font-size: 0.78rem; line-height: 1.45; }
</style>
