<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import AppIcon from '../AppIcon.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'

const tabQuery = useContentTabQuery('services')
let writeTimer = null

const query = ref('')
const services = ref([])
const loading = ref(false)
const loadError = ref(false)
// Slug exact ciblé depuis la palette de commande (Ctrl+K) : si renseigné, la liste est
// réduite à ce seul service plutôt qu'à tous ceux correspondant au texte recherché.
const exactSlugFilter = ref(null)
let suppressQueryWatch = false

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function loadServices() {
  loading.value = true
  loadError.value = false
  try {
    const res = await apiFetch('/api/services', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      services.value = await res.json()
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

onMounted(loadServices)

function serviceMatches(service, q) {
  if (stripAccents(service.name.toLowerCase()).includes(q)) return true
  if (stripAccents((service.price || '').toLowerCase()).includes(q)) return true
  return stripAccents((service.description || '').toLowerCase()).includes(q)
}

const filteredServices = computed(() => {
  if (exactSlugFilter.value) return services.value.filter(service => service.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return services.value
  return services.value.filter(service => serviceMatches(service, q))
})

// Regroupe par catégorie (champ `category` de dnd_services.json) en conservant l'ordre
// d'apparition dans les données plutôt qu'un tri alphabétique des groupes.
const groupedServices = computed(() => {
  const groups = []
  const byCategory = new Map()
  for (const service of filteredServices.value) {
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

function writeRouteQuery(q, slug) {
  lastAppliedKey = `${q || ''}|${slug || ''}`
  tabQuery.setParams({ q: q || null, slug: slug || null })
}

watch(query, () => {
  if (suppressQueryWatch) { suppressQueryWatch = false; return }
  exactSlugFilter.value = null
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => writeRouteQuery(query.value.trim(), ''), 250)
})

// Pré-remplissage depuis l'URL (?q=&slug=) : palette de commande globale
// (CommandPalette.vue) qui navigue directement vers /admin/services avec ces query
// params. Rejoué à l'activation car ce composant reste monté en permanence via
// <KeepAlive> (voir SpellSearch.vue pour le détail du raisonnement).
let lastAppliedKey = ''
function applyFromRoute() {
  const q = tabQuery.param('q')
  const slug = tabQuery.param('slug')
  const key = `${q}|${slug}`
  if (key === lastAppliedKey) return
  lastAppliedKey = key
  if (!q && !slug) return
  suppressQueryWatch = true
  query.value = q
  exactSlugFilter.value = slug || null
}
tabQuery.onRouteParamsChange(applyFromRoute)

function clearExactMatch() {
  exactSlugFilter.value = null
  writeRouteQuery(query.value.trim(), '')
}

onUnmounted(() => {
  if (writeTimer) clearTimeout(writeTimer)
})
</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="lucide:hand-coins" size="0.9em" /> Services</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, prix, description…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les services.</p>
    </div>

    <div v-else-if="filteredServices.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucun service trouvé pour « {{ query }} »</p>
    </div>

    <template v-else>
      <div class="results-info">
        <template v-if="exactSlugFilter">
          Correspondance exacte
          <button class="clear-filter-btn" type="button" @click="clearExactMatch">
            <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
          </button>
        </template>
        <template v-else>{{ filteredServices.length }} service(s)</template>
      </div>

      <div class="category-groups">
        <div v-for="group in groupedServices" :key="group.category" class="category-group">
          <h3 class="category-title">{{ group.category }}</h3>
          <div class="results-grid">
            <div v-for="service in group.services" :key="service.slug" class="service-card">
              <div class="service-header">
                <h3 class="service-name">{{ service.name }}</h3>
                <span class="price-badge"><AppIcon icon="lucide:coins" size="0.7em" /> {{ service.price }}</span>
              </div>
              <p class="service-desc">{{ service.description }}</p>
              <a :href="service.detail_url" target="_blank" class="service-link">Voir sur AideDD ↗</a>
            </div>
          </div>
        </div>
      </div>
    </template>
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

.category-groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.category-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 0.6rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--color-border);
}

.results-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.service-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: border-color 0.2s;
}
.service-card:hover { border-color: var(--color-gold-dark); }

.service-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.service-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.price-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
  white-space: nowrap;
}

.service-desc {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.55;
  margin: 0;
}

.service-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  align-self: flex-start;
  transition: color 0.2s;
}
.service-link:hover { color: var(--color-gold-bright); }
</style>
