<script setup>
import { watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { usePublicContentList } from '@/composables/usePublicContentList.js'

const props = defineProps({
  // Le composant reste monté en permanence (v-show, voir PlayerInboxView.vue) : le fetch ne
  // doit se déclencher qu'à la première activation réelle de l'onglet, pas au montage.
  active: { type: Boolean, default: false },
  prefillQuery: { type: String, default: '' },
  prefillToken: { type: Number, default: 0 },
})

function raceMatches(race, q, normalize) {
  if (normalize(race.name).includes(q)) return true
  if (normalize(race.ability_bonus).includes(q)) return true
  if ((race.traits || []).some(t => normalize(t.name).includes(q) || normalize(t.description).includes(q))) return true
  return (race.subraces || []).some(sr =>
    normalize(sr.name).includes(q) ||
    (sr.traits || []).some(t => normalize(t.name).includes(q) || normalize(t.description).includes(q))
  )
}

const { filtered: races, loading, error, query, load } = usePublicContentList('/api/races/public/full', raceMatches)
watch(() => props.active, (v) => { if (v) load() }, { immediate: true })
watch(() => props.prefillToken, () => { if (props.prefillToken) query.value = props.prefillQuery })
</script>

<template>
  <div class="race-search-tool">
    <div class="search-bar">
      <input v-model="query" class="search-input" placeholder="Nom de la race, trait, bonus…" />
    </div>

    <p v-if="loading" class="no-results">Chargement…</p>
    <p v-else-if="error" class="no-results">Impossible de charger les races.</p>
    <p v-else-if="races.length === 0" class="no-results">Aucune race trouvée{{ query ? ` pour « ${query} »` : '' }}</p>

    <div class="race-list">
      <article v-for="race in races" :key="race.slug" class="race-card">
        <div class="race-head">
          <AppIcon :icon="race.icon || 'game-icons:footprint'" size="1.1em" color="var(--color-gold-dark)" />
          <h4 class="race-name">{{ race.name }}</h4>
        </div>
        <p class="race-meta"><AppIcon icon="lucide:ruler" size="0.8em" /> {{ race.size }} · {{ race.speed }}</p>
        <p class="race-meta"><AppIcon icon="lucide:cake" size="0.8em" /> {{ race.age }}</p>
        <p class="race-meta"><AppIcon icon="lucide:languages" size="0.8em" /> {{ (race.languages || []).join(', ') }}</p>
        <p class="race-meta"><AppIcon icon="lucide:trending-up" size="0.8em" /> {{ race.ability_bonus }}</p>

        <div v-if="race.traits?.length" class="trait-block">
          <p v-for="t in race.traits" :key="t.name" class="trait-entry">
            <strong>{{ t.name }}</strong> — {{ t.description }}
          </p>
        </div>

        <div v-if="race.subraces?.length" class="subrace-block">
          <p v-for="sr in race.subraces" :key="sr.name" class="subrace-entry">
            <span class="subrace-name">{{ sr.name }}</span>
            <span v-if="sr.ability_bonus" class="subrace-bonus"> — {{ sr.ability_bonus }}</span>
            <span v-for="t in sr.traits" :key="t.name" class="trait-entry">
              <strong>{{ t.name }}</strong> — {{ t.description }}
            </span>
          </p>
        </div>

        <a :href="race.detail_url" target="_blank" class="race-link">Voir sur AideDD ↗</a>
      </article>
    </div>
  </div>
</template>

<style scoped>
.race-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
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
.race-list { display: flex; flex-direction: column; gap: 0.6rem; }
.race-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.race-head { display: flex; align-items: center; gap: 0.4rem; }
.race-name { margin: 0; font-size: 0.95rem; font-family: var(--font-heading), sans-serif; color: var(--color-parchment); }
.race-meta { margin: 0; color: var(--color-text-dim); font-size: 0.76rem; display: flex; align-items: center; gap: 0.35rem; }
.trait-block, .subrace-block { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.2rem; }
.trait-entry, .subrace-entry {
  margin: 0;
  color: var(--color-text-dim);
  font-size: 0.76rem;
  line-height: 1.45;
}
.trait-entry strong, .subrace-name { color: var(--color-parchment); font-weight: 600; }
.subrace-bonus { color: var(--color-gold-dark); }
.subrace-entry { display: flex; flex-direction: column; gap: 0.15rem; }
.race-link { display: inline-block; margin-top: 0.2rem; font-size: 0.65rem; color: var(--color-gold-dark); text-decoration: none; font-family: var(--font-heading), sans-serif; }
</style>
