<script setup>
import { ref, computed, onMounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { BACKEND_URL } from '@/config.js'
import AppIcon from '../AppIcon.vue'
import LinkedText from '../LinkedText.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'
import { useDebouncedTabFilter } from '@/composables/useDebouncedTabFilter.js'
import { withGlossary } from '@/utils/textLinker.js'
import { stripAccents } from '@/utils/slugify.js'
import ContentActionButtons from './ContentActionButtons.vue'

// Écran joueur : endpoint public + pas de boutons TV/Envoyer (voir SpellSearch.vue).
const props = defineProps({
  playerMode: { type: Boolean, default: false },
})

const tabQuery = useContentTabQuery('conditions')
// exactMatch (renommé exactSlugFilter) : slug exact ciblé depuis la palette de commande
// (Ctrl+K) — si renseigné, la liste est réduite à cet seul état plutôt qu'à tous ceux
// correspondant au texte recherché.
const { query, exactMatch: exactSlugFilter, clearExactMatch } = useDebouncedTabFilter(tabQuery)

const conditions = ref([])
const loading = ref(false)
const loadError = ref(false)

async function loadConditions() {
  loading.value = true
  loadError.value = false
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/conditions/public`)
      : await apiFetch('/api/conditions', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) {
      conditions.value = await res.json()
    } else {
      loadError.value = true
    }
  } catch (err) {
    console.error(err)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadConditions)

// Un état référence surtout d'autres règles (avantage/désavantage/jet de sauvegarde…),
// déjà couvertes par le glossaire — voir utils/glossary.js — jamais un autre état par son
// nom, donc pas besoin de candidats spécifiques ici au-delà de withGlossary([]).
const refCandidates = computed(() => withGlossary([]))

function conditionMatches(condition, q) {
  if (stripAccents(condition.name.toLowerCase()).includes(q)) return true
  if (stripAccents((condition.name_vo || '').toLowerCase()).includes(q)) return true
  if ((condition.aliases || []).some(a => stripAccents(a.toLowerCase()).includes(q))) return true
  return stripAccents((condition.description || '').toLowerCase()).includes(q)
}

const filteredConditions = computed(() => {
  if (exactSlugFilter.value) return conditions.value.filter(condition => condition.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return conditions.value
  return conditions.value.filter(condition => conditionMatches(condition, q))
})

</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="lucide:skull" size="0.9em" /> États</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom de l'état, effet…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les états.</p>
    </div>

    <div v-else-if="filteredConditions.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucun état trouvé pour « {{ query }} »</p>
    </div>

    <div v-else class="results-info">
      <template v-if="exactSlugFilter">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>{{ filteredConditions.length }} état(s)</template>
    </div>

    <div class="results-grid">
      <div v-for="condition in filteredConditions" :key="condition.slug" class="condition-card">
        <div class="condition-header">
          <h3 class="condition-name">{{ condition.name }}</h3>
          <span v-if="condition.name_vo" class="vo-badge">{{ condition.name_vo }}</span>
        </div>
        <p class="condition-desc"><LinkedText :text="condition.description" :candidates="refCandidates" /></p>
        <div class="condition-footer">
          <a :href="condition.detail_url" target="_blank" class="condition-link">Voir sur AideDD ↗</a>
          <ContentActionButtons v-if="!playerMode" content-type="condition" :item="condition" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Squelette (barre de recherche, chargement, "aucun résultat", grille...) partagé par
 * les composants de recherche de contenu qui filtrent une liste en mémoire — voir
 * assets/content-search-shared.css. Seul le rendu de la carte de résultat, propre à ce
 * type de contenu, reste défini ci-dessous.
 */
@import '@/assets/content-search-shared.css';

.condition-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: border-color 0.2s;
}
.condition-card:hover { border-color: var(--color-danger); }

.condition-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.condition-name {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-md);
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.vo-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 20px;
  padding: 0.15rem var(--space-2);
}

.condition-desc {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  line-height: 1.55;
  margin: 0;
}

.condition-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.condition-link {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.condition-link:hover { color: var(--color-gold-bright); }
</style>
