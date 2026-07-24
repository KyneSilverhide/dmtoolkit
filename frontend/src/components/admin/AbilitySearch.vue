<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import AppIcon from '../AppIcon.vue'
import ContentPagination from './ContentPagination.vue'
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  // Pré-remplissage déclenché depuis la palette de commande globale :
  // { query, token }. `token` doit changer à chaque nouvelle requête pour
  // que le watcher se déclenche même si `query` est identique à la dernière fois.
  prefill: { type: Object, default: null },
})

// Émis par le bouton « Voir la classe » : redirige AdminView vers l'onglet Classes,
// filtré sur cette seule classe (mécanisme exactSlug déjà utilisé par CommandPalette).
const emit = defineEmits(['go-search'])
function goToClass(ability) {
  emit('go-search', { subTab: 'classes', query: ability.className, exactSlug: ability.classSlug })
}

const MIN_SEARCH_LENGTH = 2

const query = ref('')
const abilities = ref([])
const loading = ref(false)
const loadError = ref(false)
// Slug exact ciblé depuis la palette de commande (Ctrl+K) : si renseigné, la liste est
// réduite à cette seule aptitude plutôt qu'à toutes celles correspondant au texte recherché.
const exactIdFilter = ref(null)
let suppressQueryWatch = false

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function loadAbilities() {
  loading.value = true
  loadError.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/api/classes/abilities`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
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

onMounted(loadAbilities)

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
const isBrowsing = computed(() => !exactIdFilter.value && trimmedQuery.value.length < MIN_SEARCH_LENGTH)
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

watch(query, () => {
  if (suppressQueryWatch) { suppressQueryWatch = false; return }
  exactIdFilter.value = null
})

// Pré-remplissage depuis la palette de commande globale (voir CommandPalette.vue).
// `immediate: true` est nécessaire pour que le tout premier accès à cet onglet depuis
// la palette fonctionne (voir SpellSearch.vue pour le détail du raisonnement).
watch(() => props.prefill?.token, (token) => {
  if (!token) return
  suppressQueryWatch = true
  query.value = props.prefill.query || ''
  exactIdFilter.value = props.prefill.exactSlug || null
}, { immediate: true })

function clearExactMatch() {
  exactIdFilter.value = null
}
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

        <p class="ability-desc">{{ ability.description }}</p>

        <div class="ability-footer">
          <button class="go-class-btn" type="button" @click="goToClass(ability)">
            <AppIcon :icon="ability.classIcon" size="0.75em" />
            {{ ability.className }}<template v-if="ability.subclassName"> · {{ ability.subclassName }}</template>
            <AppIcon icon="lucide:arrow-right" size="0.7em" />
          </button>
          <a v-if="ability.classDetailUrl" :href="ability.classDetailUrl" target="_blank" class="ability-link">Voir la classe sur AideDD ↗</a>
        </div>
      </div>
    </div>

    <ContentPagination v-if="isBrowsing && totalPages > 1" :page="page" :total-pages="totalPages" @update:page="page = $event" />
  </div>
</template>

<style scoped>
.search-tool {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

.search-bar { display: flex; gap: 0.5rem; }

.search-input {
  flex: 1;
  background: var(--admin-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus { border-color: var(--color-gold-dark); }
.search-input::placeholder { color: var(--color-border); }

.search-loading {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  padding: 1.5rem 0;
}
.loading-dot {
  font-size: 0.5rem;
  color: var(--color-gold-dark);
  animation: dotBounce 1.2s ease-in-out infinite;
}
.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotBounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-6px); opacity: 1; } }

.no-results { text-align: center; padding: 2rem 0; }
.no-results-icon { font-size: 2.5rem; opacity: 0.4; margin: 0; }
.no-results-text { font-family: var(--font-heading), sans-serif; font-size: 0.85rem; color: var(--color-text-dim); margin: 0.5rem 0 0; }

.results-info {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.clear-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.clear-filter-btn:hover { color: var(--color-gold-bright); border-color: var(--color-gold-dark); }

.results-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ability-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.2s;
}
.ability-card:hover { border-color: var(--color-gold-dark); }

.ability-header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.ability-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.ability-header-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
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
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.55;
  margin: 0;
}

.ability-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.go-class-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.2rem 0.65rem;
  color: var(--color-gold-dark);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s;
}
.go-class-btn:hover { color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.ability-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.ability-link:hover { color: var(--color-gold-bright); }
</style>
