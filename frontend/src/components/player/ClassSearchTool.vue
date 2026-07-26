<script setup>
import { watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { usePublicContentList } from '@/composables/usePublicContentList.js'

const props = defineProps({
  active: { type: Boolean, default: false },
  prefillQuery: { type: String, default: '' },
  prefillToken: { type: Number, default: 0 },
})

function classMatches(dndClass, q, normalize) {
  if (normalize(dndClass.name).includes(q)) return true
  if (normalize(dndClass.primary_ability).includes(q)) return true
  if ((dndClass.features || []).some(f => normalize(f.name).includes(q) || normalize(f.description).includes(q))) return true
  return (dndClass.subclasses || []).some(sc =>
    normalize(sc.name).includes(q) ||
    (sc.traits || []).some(t => normalize(t.name).includes(q) || normalize(t.description).includes(q))
  )
}

const { filtered: classes, loading, error, query, load } = usePublicContentList('/api/classes/public/full', classMatches)
watch(() => props.active, (v) => { if (v) load() }, { immediate: true })
watch(() => props.prefillToken, () => { if (props.prefillToken) query.value = props.prefillQuery })
</script>

<template>
  <div class="class-search-tool">
    <div class="search-bar">
      <input v-model="query" class="search-input" placeholder="Nom de la classe, trait, sous-classe…" />
    </div>

    <p v-if="loading" class="no-results">Chargement…</p>
    <p v-else-if="error" class="no-results">Impossible de charger les classes.</p>
    <p v-else-if="classes.length === 0" class="no-results">Aucune classe trouvée{{ query ? ` pour « ${query} »` : '' }}</p>

    <div class="class-list">
      <article v-for="dndClass in classes" :key="dndClass.slug" class="class-card">
        <div class="class-head">
          <AppIcon :icon="dndClass.icon || 'game-icons:sword-brandish'" size="1.1em" color="var(--color-gold-dark)" />
          <h4 class="class-name">{{ dndClass.name }}</h4>
        </div>
        <p class="class-meta"><AppIcon icon="lucide:heart-pulse" size="0.8em" /> Dé de vie {{ dndClass.hit_die }} · {{ dndClass.primary_ability }}</p>
        <p v-if="dndClass.saving_throws?.length" class="class-meta"><AppIcon icon="lucide:shield" size="0.8em" /> JS : {{ dndClass.saving_throws.join(', ') }}</p>
        <p v-if="dndClass.armor_proficiencies?.length || dndClass.weapon_proficiencies?.length" class="class-meta">
          <AppIcon icon="lucide:swords" size="0.8em" /> {{ [...(dndClass.armor_proficiencies || []), ...(dndClass.weapon_proficiencies || [])].join(', ') }}
        </p>
        <p v-if="dndClass.skill_choices?.options?.length" class="class-meta">
          <AppIcon icon="lucide:star" size="0.8em" /> {{ dndClass.skill_choices.count }} compétence(s) parmi : {{ dndClass.skill_choices.options.join(', ') }}
        </p>
        <p v-if="dndClass.starting_equipment" class="class-meta">
          <AppIcon icon="lucide:backpack" size="0.8em" /> {{ dndClass.starting_equipment }}
        </p>
        <p v-if="dndClass.spellcasting" class="class-meta">
          <AppIcon icon="lucide:sparkles" size="0.8em" /> Lanceur de sorts ({{ dndClass.spellcasting.ability }}) — {{ dndClass.spellcasting.notes }}
        </p>

        <details v-if="dndClass.features?.length" class="class-section">
          <summary>Traits de classe ({{ dndClass.features.length }})</summary>
          <p v-for="f in dndClass.features" :key="f.name" class="trait-entry">
            <strong>{{ f.name }}</strong><span v-if="f.level"> (niv. {{ f.level }})</span> — {{ f.description }}
          </p>
        </details>

        <details v-if="dndClass.subclasses?.length" class="class-section">
          <summary>Sous-classes ({{ dndClass.subclasses.length }})</summary>
          <div v-for="sc in dndClass.subclasses" :key="sc.name" class="subclass-entry">
            <p class="subclass-name">{{ sc.name }}</p>
            <p v-for="t in sc.traits" :key="t.name" class="trait-entry">
              <strong>{{ t.name }}</strong><span v-if="t.level"> (niv. {{ t.level }})</span> — {{ t.description }}
            </p>
          </div>
        </details>

        <a :href="dndClass.detail_url" target="_blank" class="class-link">Voir sur AideDD ↗</a>
      </article>
    </div>
  </div>
</template>

<style scoped>
.class-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
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
.class-list { display: flex; flex-direction: column; gap: 0.6rem; }
.class-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.class-head { display: flex; align-items: center; gap: 0.4rem; }
.class-name { margin: 0; font-size: 0.95rem; font-family: var(--font-heading), sans-serif; color: var(--color-parchment); }
.class-meta { margin: 0; color: var(--color-text-dim); font-size: 0.76rem; display: flex; align-items: flex-start; gap: 0.35rem; }
.class-section {
  margin-top: 0.25rem;
  border-top: 1px solid var(--color-border);
  padding-top: 0.35rem;
}
.class-section summary {
  cursor: pointer;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.trait-entry { margin: 0.35rem 0 0; color: var(--color-text-dim); font-size: 0.76rem; line-height: 1.45; }
.trait-entry strong { color: var(--color-parchment); font-weight: 600; }
.subclass-entry { margin-top: 0.4rem; }
.subclass-name { margin: 0; color: var(--color-parchment); font-size: 0.8rem; font-weight: 600; }
.class-link { display: inline-block; margin-top: 0.2rem; font-size: 0.65rem; color: var(--color-gold-dark); text-decoration: none; font-family: var(--font-heading), sans-serif; }
</style>
