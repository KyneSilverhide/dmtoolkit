<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { BACKEND_URL } from '@/config.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import HtmlSpanTooltip from '../HtmlSpanTooltip.vue'
import ContentPagination from './ContentPagination.vue'
import ContentActionButtons from './ContentActionButtons.vue'
import { itemTypeStyle } from '@/utils/itemTypes.js'
import { rarityColor } from '@/utils/rarity.js'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'
import { renderContentHtml } from '@/utils/textLinker.js'
import { contentBasePath } from '@/utils/contentRoutes.js'

const props = defineProps({
  // 'equipment' (objets standard) ou 'magic' (objets magiques)
  category: { type: String, required: true },
  // Écran joueur : endpoints publics + pas de boutons TV/Envoyer (voir SpellSearch.vue).
  playerMode: { type: Boolean, default: false },
})

// La clé d'onglet correspond directement à la catégorie ('equipment' ou 'magic').
const tabQuery = useContentTabQuery(props.category)
const router = useRouter()
const route = useRoute()
const descTooltip = ref(null)

const CATEGORY_META = {
  equipment: { label: 'Objets', icon: 'lucide:package', placeholder: 'Nom, type, description…', noun: 'objet', nounPlural: 'objet(s)' },
  magic: { label: 'Objets magiques', icon: 'lucide:gem', placeholder: 'Nom, type, rareté, description…', noun: 'objet magique', nounPlural: 'objet(s) magique(s)' },
}
const meta = computed(() => CATEGORY_META[props.category])

const query = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
// Slug exact ciblé depuis la palette de commande (Ctrl+K) : si renseigné, les résultats
// sont réduits à ce seul objet plutôt qu'à tous ceux correspondant au texte recherché.
const exactMatchSlug = ref(null)
const rawCache = new Map() // résultats bruts (standard + magiques) partagés entre catégories
const MIN_AUTO_SEARCH_LENGTH = 3
let autoSearchTimer = null
let suppressQueryWatch = false

function filterByCategory(data) {
  return props.category === 'magic'
    ? data.filter(item => item.source_category === 'magic')
    : data.filter(item => item.source_category !== 'magic')
}

// Mode "parcourir" : liste paginée de tous les objets de la catégorie quand aucune
// recherche n'est en cours.
const allRaw = ref([])
const page = ref(1)
const PAGE_SIZE = 20

async function loadAll() {
  loading.value = true
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/magic-items/public`)
      : await apiFetch('/api/magic-items', { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) allRaw.value = await res.json()
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}
onMounted(loadAll)

// Chargés pour donner un aperçu réel (nom + extrait de description) dans la bulle des
// mentions de sorts internalisées (voir internalizeSpellLinks() dans textLinker.js), plutôt
// que le message générique "Cliquer pour voir la fiche du sort".
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
onMounted(loadSpells)
const spellsBySlug = computed(() => Object.fromEntries(spells.value.map(s => [s.slug, s])))

const isBrowsing = computed(() => !exactMatchSlug.value && query.value.trim().length < MIN_AUTO_SEARCH_LENGTH)
const allCategoryItems = computed(() => filterByCategory(allRaw.value))
const totalPages = computed(() => Math.max(1, Math.ceil(allCategoryItems.value.length / PAGE_SIZE)))
const pagedItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return allCategoryItems.value.slice(start, start + PAGE_SIZE)
})
const displayItems = computed(() => (isBrowsing.value ? pagedItems.value : results.value))
watch(isBrowsing, (browsing) => { if (browsing) page.value = 1 })

function toHtml(entry) {
  return renderContentHtml(entry, { internalizeSpells: true, spellsBySlug: spellsBySlug.value })
}

// Voir SpellSearch.vue onDescClick — même délégation de clic pour les mentions d'état et de
// sort rendues en HTML brut (data-condition-slug / data-spell-slug) au lieu d'un vrai
// composant RefLink.
function onDescClick(e) {
  const base = contentBasePath(route)
  const conditionEl = e.target.closest('[data-condition-slug]')
  if (conditionEl) {
    router.push({ path: `${base}/conditions`, query: { q: conditionEl.dataset.conditionName, slug: conditionEl.dataset.conditionSlug } })
    return
  }
  const spellEl = e.target.closest('[data-spell-slug]')
  if (spellEl) {
    router.push({ path: `${base}/spells`, query: { q: spellEl.dataset.spellName, slug: spellEl.dataset.spellSlug } })
  }
}

function itemTypeIcon(itemType) {
  return itemTypeStyle(itemType).icon
}
function itemTypeColor(itemType) {
  return itemTypeStyle(itemType).color
}

async function search() {
  const q = query.value.trim()
  if (!q) return
  if (rawCache.has(q)) {
    results.value = filterByCategory(rawCache.get(q))
    searched.value = true
    return
  }
  loading.value = true
  searched.value = false
  try {
    const res = props.playerMode
      ? await fetch(`${BACKEND_URL}/api/magic-items/public/search?q=${encodeURIComponent(q)}`)
      : await apiFetch(`/api/magic-items/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${authStore.token}` } })
    if (res.ok) {
      const data = await res.json()
      rawCache.set(q, data)
      results.value = filterByCategory(data)
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
    searched.value = true
  }
}

function writeRouteQuery(q, slug) {
  lastAppliedKey = `${q || ''}|${slug || ''}`
  tabQuery.setParams({ q: q || null, slug: slug || null })
}

watch(query, () => {
  if (suppressQueryWatch) { suppressQueryWatch = false; return }
  exactMatchSlug.value = null
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
  const q = query.value.trim()
  if (q.length < MIN_AUTO_SEARCH_LENGTH) {
    results.value = []
    searched.value = false
    loading.value = false
    writeRouteQuery('', '')
    return
  }
  autoSearchTimer = setTimeout(() => {
    search()
    writeRouteQuery(q, '')
  }, 250)
})

// Pré-remplissage depuis l'URL (?q=&slug=) : palette de commande globale
// (CommandPalette.vue) qui navigue directement vers /admin/equipment ou /admin/magic
// avec ces query params. Rejoué à l'activation car ce composant reste monté en
// permanence via <KeepAlive> (voir SpellSearch.vue pour le détail du raisonnement).
let lastAppliedKey = ''
function applyFromRoute() {
  const q = tabQuery.param('q')
  const slug = tabQuery.param('slug')
  const key = `${q}|${slug}`
  if (key === lastAppliedKey) return
  lastAppliedKey = key
  if (!q && !slug) return
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
  exactMatchSlug.value = slug || null
  suppressQueryWatch = true
  query.value = q
  search().then(() => {
    if (exactMatchSlug.value) {
      results.value = results.value.filter(item => item.slug === exactMatchSlug.value)
    }
  })
}
tabQuery.onRouteParamsChange(applyFromRoute)

function clearExactMatch() {
  exactMatchSlug.value = null
  search()
  writeRouteQuery(query.value.trim(), '')
}

onUnmounted(() => {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
})
</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon :icon="meta.icon" size="0.9em" /> {{ meta.label }}</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        :placeholder="meta.placeholder"
        @keydown.enter="search"
      />
      <button class="search-btn" :disabled="loading || !query.trim()" @click="search">
        <AppIcon v-if="!loading" icon="lucide:search" size="0.85em" /> {{ loading ? '…' : 'Chercher' }}
      </button>
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="!isBrowsing && searched && results.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucun {{ meta.noun }} trouvé pour « {{ query }} »</p>
    </div>

    <div v-else-if="displayItems.length > 0" class="results-info">
      <template v-if="isBrowsing">
        {{ allCategoryItems.length }} {{ meta.nounPlural }} au total
      </template>
      <template v-else-if="exactMatchSlug">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>
        {{ results.length }} {{ meta.nounPlural }} trouvé(s)
        <span v-if="results.length === 80"> (premiers 80 résultats)</span>
      </template>
    </div>

    <div class="results-grid">
      <div
        v-for="item in displayItems"
        :key="item.slug"
        class="spell-card item-result-card"
        :style="{ '--item-type-color': itemTypeColor(item.item_type) }"
      >
        <div class="spell-header">
          <div class="spell-title-row">
            <h3 class="spell-name">{{ item.name }}</h3>
            <span v-if="item.requires_attunement" class="ritual-badge">Harmonisation <HelpTip id="search.harmonisation" /></span>
          </div>
          <div class="spell-meta-row">
            <span class="item-type-badge">
              <AppIcon :icon="itemTypeIcon(item.item_type)" size="1.1em" />
              {{ item.item_type }}
            </span>
            <span
              class="rarity-badge"
              :style="{ '--rarity-color': rarityColor(item.rarity) }"
            >{{ item.rarity }}</span>
            <span v-if="item.list_data?.prix" class="price-badge">
              <AppIcon icon="lucide:coins" size="0.7em" /> {{ item.list_data.prix }}
            </span>
          </div>
        </div>
        <div
          v-if="item.description_html || item.description"
          class="item-desc"
          v-html="toHtml(item)"
          @click="onDescClick"
          @mouseover="descTooltip?.onMouseOver($event)"
          @mouseout="descTooltip?.onMouseOut($event)"
        />
        <div v-if="item.source" class="item-source"><AppIcon icon="lucide:library" size="0.8em" /> {{ item.source }}</div>
        <div class="spell-footer">
          <a :href="item.detail_url" target="_blank" class="spell-link">Voir sur AideDD ↗</a>
          <ContentActionButtons v-if="!playerMode" content-type="item" :item="item" />
        </div>
      </div>
    </div>

    <ContentPagination v-if="isBrowsing && totalPages > 1" :page="page" :total-pages="totalPages" @update:page="page = $event" />
    <HtmlSpanTooltip ref="descTooltip" />
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

.search-bar {
  display: flex;
  gap: 0.5rem;
}

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

.search-btn {
  padding: 0.6rem 1.1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.search-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.search-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Loading */
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

/* No results */
.no-results {
  text-align: center;
  padding: 2rem 0;
}
.no-results-icon { font-size: 2.5rem; opacity: 0.4; margin: 0; }
.no-results-text { font-family: var(--font-heading), sans-serif; font-size: 0.85rem; color: var(--color-text-dim); margin: 0.5rem 0 0; }

/* Results count */
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

/* Results grid */
.results-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Item card */
.spell-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: border-color 0.2s;
}
.spell-card:hover { border-color: var(--color-gold-dark); }

.item-result-card {
  border-color: color-mix(in oklab, var(--item-type-color, var(--color-text-dim)) 55%, var(--color-border)) !important;
}
.item-result-card:hover {
  border-color: color-mix(in oklab, var(--item-type-color, var(--color-text-dim)) 80%, var(--color-border)) !important;
}

.spell-header { display: flex; flex-direction: column; gap: 0.35rem; }

.spell-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.spell-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
  flex: 1;
}

.ritual-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-info-bright);
  background: var(--color-info-soft);
  border: 1px solid var(--color-info-border);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  flex-shrink: 0;
}

.spell-meta-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.item-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
  color: var(--item-type-color, var(--color-text-dim));
  border-color: color-mix(in oklab, var(--item-type-color, var(--color-text-dim)) 50%, transparent);
  background: color-mix(in oklab, var(--item-type-color, var(--color-text-dim)) 16%, transparent);
}

.price-badge {
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
  padding: 0.1rem 0.5rem;
}

.rarity-badge {
  --rarity-color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
  color: var(--rarity-color);
  border-color: color-mix(in oklab, var(--rarity-color) 50%, transparent);
  background: color-mix(in oklab, var(--rarity-color) 14%, transparent);
}

/* Description */
.item-desc {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.55;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.item-desc :deep(p) { margin: 0.3rem 0; }
.item-desc :deep(p:first-child) { margin-top: 0; }
.item-desc :deep(br) { display: block; content: ''; margin-top: 0.2rem; }
.item-desc :deep(strong), .item-desc :deep(b) { color: var(--color-parchment); font-weight: 600; }
.item-desc :deep(em), .item-desc :deep(i) { font-style: italic; color: var(--color-gold-dark); }
.item-desc :deep(ul), .item-desc :deep(ol) { margin: 0.3rem 0; padding-left: 1.2rem; }
.item-desc :deep(li) { margin: 0.1rem 0; }
.item-desc :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
  font-size: 0.75rem;
}
.item-desc :deep(th), .item-desc :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.25rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.item-desc :deep(th) {
  background: var(--surface-raised, rgba(255,255,255,0.05));
  color: var(--color-gold-dark);
  font-family: var(--font-heading), sans-serif;
  font-weight: 600;
}
.item-desc :deep(tbody tr:hover) {
  background: var(--surface-ghost);
}

.item-source {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  opacity: 0.7;
}

/* Link */
.spell-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.spell-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.spell-link:hover { color: var(--color-gold-bright); }
</style>
