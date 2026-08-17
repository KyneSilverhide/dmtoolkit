<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { BACKEND_URL } from '@/config.js'
import AppIcon from '../AppIcon.vue'
import LinkedText from '../LinkedText.vue'
import ContentPagination from './ContentPagination.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'
import { useDebouncedTabFilter } from '@/composables/useDebouncedTabFilter.js'
import { spellCandidates, withGlossary } from '@/utils/textLinker.js'
import { stripAccents } from '@/utils/slugify.js'
import ContentActionButtons from './ContentActionButtons.vue'
import { contentBasePath } from '@/utils/contentRoutes.js'

// Écran joueur : endpoints publics + pas de boutons TV/Envoyer (voir SpellSearch.vue).
const props = defineProps({
  playerMode: { type: Boolean, default: false },
})

const router = useRouter()
const route = useRoute()
const tabQuery = useContentTabQuery('abilities')

// Navigue directement vers l'onglet Classes filtré sur cette seule classe (mécanisme
// slug déjà utilisé par CommandPalette), au lieu de faire remonter un événement.
function goToClass(ability) {
  router.push({ path: `${contentBasePath(route)}/classes`, query: { q: ability.className, slug: ability.classSlug } })
}

const MIN_AUTO_SEARCH_LENGTH = 3

// exactMatch (renommé exactIdFilter) : id exact ciblé depuis la palette de commande
// (Ctrl+K) — si renseigné, la liste est réduite à cette seule aptitude plutôt qu'à
// toutes celles correspondant au texte recherché.
const { query, exactMatch: exactIdFilter, clearExactMatch } = useDebouncedTabFilter(tabQuery)

const abilities = ref([])
const loading = ref(false)
const loadError = ref(false)

async function loadAbilities() {
  loading.value = true
  loadError.value = false
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/classes/abilities/public`)
      : await apiFetch('/api/classes/abilities', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) {
      const data = await res.json()
      abilities.value = data.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
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

const spells = ref([])
async function loadSpells() {
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/spells/public`)
      : await apiFetch('/api/spells', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) spells.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => { loadAbilities(); loadSpells() })

const refCandidates = computed(() => withGlossary(spellCandidates(spells.value)))

function abilityMatches(ability, q) {
  if (stripAccents(ability.name.toLowerCase()).includes(q)) return true
  if (stripAccents(ability.description.toLowerCase()).includes(q)) return true
  if (stripAccents(ability.className.toLowerCase()).includes(q)) return true
  if (ability.subclassName && stripAccents(ability.subclassName.toLowerCase()).includes(q)) return true
  return false
}

const trimmedQuery = computed(() => stripAccents(query.value.trim().toLowerCase()))

// Mode "parcourir" : liste paginée de toutes les aptitudes quand aucune recherche n'est en cours.
const page = ref(1)
const PAGE_SIZE = 20
const isBrowsing = computed(() => !exactIdFilter.value && trimmedQuery.value.length < MIN_AUTO_SEARCH_LENGTH)
const totalPages = computed(() => Math.max(1, Math.ceil(abilities.value.length / PAGE_SIZE)))
const pagedAbilities = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return abilities.value.slice(start, start + PAGE_SIZE)
})
watch(isBrowsing, (browsing) => { if (browsing) page.value = 1 })

const filteredAbilities = computed(() => {
  if (exactIdFilter.value) return abilities.value.filter(a => a.id === exactIdFilter.value)
  if (isBrowsing.value) return pagedAbilities.value
  return abilities.value.filter(a => abilityMatches(a, trimmedQuery.value))
})

</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="lucide:zap" size="0.9em" /> Aptitudes</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom d'aptitude, de classe, d'option… (ex: Conduit divin, Métamagie)"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les aptitudes.</p>
    </div>

    <div v-else-if="!isBrowsing && filteredAbilities.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucune aptitude trouvée pour « {{ query }} »</p>
    </div>

    <div v-else class="results-info">
      <template v-if="isBrowsing">
        {{ abilities.length }} aptitude(s) au total
      </template>
      <template v-else-if="exactIdFilter">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>{{ filteredAbilities.length }} aptitude(s)</template>
    </div>

    <div class="results-grid">
      <div v-for="ability in filteredAbilities" :key="ability.id" class="ability-card">
        <div class="ability-header">
          <AppIcon :icon="ability.classIcon" size="1.4rem" class="ability-icon" />
          <div class="ability-header-main">
            <h3 class="ability-name">{{ ability.name }}</h3>
            <span v-if="ability.level" class="stat-badge">Niv. {{ ability.level }}</span>
            <span v-if="ability.parentName" class="stat-badge stat-badge-option">
              <AppIcon icon="lucide:corner-down-right" size="0.65em" /> Option de {{ ability.parentName }}
            </span>
            <span v-if="ability.hasOptions" class="stat-badge stat-badge-options">
              {{ ability.optionCount }} option(s)
            </span>
          </div>
        </div>

        <p class="ability-desc"><LinkedText :text="ability.description" :candidates="refCandidates" :trait-name="ability.name" /></p>

        <div class="ability-footer">
          <button class="go-class-btn" type="button" @click="goToClass(ability)">
            <AppIcon :icon="ability.classIcon" size="0.75em" />
            {{ ability.className }}<template v-if="ability.subclassName"> · {{ ability.subclassName }}</template>
            <AppIcon icon="lucide:arrow-right" size="0.7em" />
          </button>
          <a v-if="ability.classDetailUrl" :href="ability.classDetailUrl" target="_blank" class="ability-link">Voir la classe sur AideDD ↗</a>
          <ContentActionButtons v-if="!playerMode" content-type="ability" :item="ability" />
        </div>
      </div>
    </div>

    <ContentPagination v-if="isBrowsing && totalPages > 1" :page="page" :total-pages="totalPages" @update:page="page = $event" />
  </div>
</template>

<style scoped>
/* Squelette (barre de recherche, chargement, "aucun résultat", grille...) partagé par
 * les composants de recherche de contenu qui filtrent une liste en mémoire — voir
 * assets/content-search-shared.css. Seul le rendu de la carte de résultat, propre à ce
 * type de contenu, reste défini ci-dessous.
 */
@import '@/assets/content-search-shared.css';

.ability-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: border-color 0.2s;
}
.ability-card:hover { border-color: var(--color-gold-dark); }

.ability-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.ability-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.ability-header-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ability-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem var(--space-2);
}
.stat-badge-option {
  color: var(--color-text-dim);
  background: var(--surface-ghost);
  border-color: var(--color-border);
}
.stat-badge-options {
  color: var(--color-info-bright);
  background: var(--color-info-soft);
  border-color: var(--color-info-border);
}

.ability-desc {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  line-height: 1.55;
  margin: 0;
}

.ability-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.go-class-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.2rem var(--space-3);
  color: var(--color-gold-dark);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s;
}
.go-class-btn:hover { color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.ability-link {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.ability-link:hover { color: var(--color-gold-bright); }
</style>
