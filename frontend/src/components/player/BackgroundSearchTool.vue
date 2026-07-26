<script setup>
import { watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { usePublicContentList } from '@/composables/usePublicContentList.js'

const props = defineProps({
  active: { type: Boolean, default: false },
  prefillQuery: { type: String, default: '' },
  prefillToken: { type: Number, default: 0 },
})

function backgroundMatches(bg, q, normalize) {
  if (normalize(bg.name).includes(q)) return true
  if (normalize(bg.description).includes(q)) return true
  if ((bg.skill_proficiencies || []).some(s => normalize(s).includes(q))) return true
  if ((bg.tool_proficiencies || []).some(t => normalize(t).includes(q))) return true
  if (bg.feature && (normalize(bg.feature.name).includes(q) || normalize(bg.feature.description).includes(q))) return true
  return ['personality_traits', 'ideals', 'bonds', 'flaws'].some(key =>
    (bg[key] || []).some(entry => normalize(entry).includes(q))
  )
}

const { filtered: backgrounds, loading, error, query, load } = usePublicContentList('/api/backgrounds/public', backgroundMatches)
watch(() => props.active, (v) => { if (v) load() }, { immediate: true })
watch(() => props.prefillToken, () => { if (props.prefillToken) query.value = props.prefillQuery })
</script>

<template>
  <div class="bg-search-tool">
    <div class="search-bar">
      <input v-model="query" class="search-input" placeholder="Nom de l'origine, compétence, capacité…" />
    </div>

    <p v-if="loading" class="no-results">Chargement…</p>
    <p v-else-if="error" class="no-results">Impossible de charger les origines.</p>
    <p v-else-if="backgrounds.length === 0" class="no-results">Aucune origine trouvée{{ query ? ` pour « ${query} »` : '' }}</p>

    <div class="bg-list">
      <article v-for="bg in backgrounds" :key="bg.slug" class="bg-card">
        <div class="bg-head">
          <AppIcon :icon="bg.icon || 'lucide:scroll'" size="1.1em" color="var(--color-gold-dark)" />
          <h4 class="bg-name">{{ bg.name }}</h4>
        </div>
        <p class="bg-desc">{{ bg.description }}</p>
        <p v-if="bg.skill_proficiencies?.length" class="bg-meta">
          <AppIcon icon="lucide:star" size="0.8em" /> Compétences : {{ bg.skill_proficiencies.join(', ') }}
        </p>
        <p v-if="bg.tool_proficiencies?.length" class="bg-meta">
          <AppIcon icon="lucide:wrench" size="0.8em" /> Outils : {{ bg.tool_proficiencies.join(', ') }}
        </p>
        <p v-if="bg.languages_count" class="bg-meta">
          <AppIcon icon="lucide:languages" size="0.8em" /> {{ bg.languages_count }} langue(s){{ bg.languages_note ? ` — ${bg.languages_note}` : '' }}
        </p>
        <p v-if="bg.equipment" class="bg-meta">
          <AppIcon icon="lucide:backpack" size="0.8em" /> {{ bg.equipment }}
        </p>
        <div v-if="bg.feature" class="feature-block">
          <strong>{{ bg.feature.name }}</strong> — {{ bg.feature.description }}
        </div>
        <a :href="bg.detail_url" target="_blank" class="bg-link">Voir sur AideDD ↗</a>
      </article>
    </div>
  </div>
</template>

<style scoped>
.bg-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
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
.bg-list { display: flex; flex-direction: column; gap: 0.6rem; }
.bg-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.bg-head { display: flex; align-items: center; gap: 0.4rem; }
.bg-name { margin: 0; font-size: 0.95rem; font-family: var(--font-heading), sans-serif; color: var(--color-parchment); }
.bg-desc { margin: 0; color: var(--color-text-dim); font-size: 0.78rem; line-height: 1.45; }
.bg-meta { margin: 0; color: var(--color-text-dim); font-size: 0.76rem; display: flex; align-items: flex-start; gap: 0.35rem; }
.feature-block { margin-top: 0.15rem; color: var(--color-text-dim); font-size: 0.76rem; line-height: 1.45; }
.feature-block strong { color: var(--color-parchment); font-weight: 600; }
.bg-link { display: inline-block; margin-top: 0.2rem; font-size: 0.65rem; color: var(--color-gold-dark); text-decoration: none; font-family: var(--font-heading), sans-serif; }
</style>
