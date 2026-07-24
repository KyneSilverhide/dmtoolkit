<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import ContentPagination from './ContentPagination.vue'
import { parseEcole, levelLabel, schoolColor } from '@/utils/spellSchool.js'

import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  // Pré-remplissage déclenché depuis la palette de commande globale :
  // { query, token }. `token` doit changer à chaque nouvelle requête pour
  // que le watcher se déclenche même si `query` est identique à la dernière fois.
  prefill: { type: Object, default: null },
})

const query = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const activeClassFilter = ref(null)
// Slug exact ciblé depuis la palette de commande (Ctrl+K) : si renseigné, les résultats
// sont réduits à ce seul sort plutôt qu'à tous les sorts correspondant au texte recherché.
const exactMatchSlug = ref(null)
const spellCache = new Map()
const MIN_AUTO_SEARCH_LENGTH = 3
let autoSearchTimer = null
let suppressQueryWatch = false

// Mode "parcourir" : liste paginée de tous les sorts quand aucune recherche n'est en cours.
const allSpells = ref([])
const page = ref(1)
const PAGE_SIZE = 20

async function loadAllSpells() {
  loading.value = true
  try {
    const res = await fetch(`${BACKEND_URL}/api/spells`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) allSpells.value = await res.json()
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}
onMounted(loadAllSpells)

const isBrowsing = computed(() =>
  !activeClassFilter.value && !exactMatchSlug.value && query.value.trim().length < MIN_AUTO_SEARCH_LENGTH
)
const totalPages = computed(() => Math.max(1, Math.ceil(allSpells.value.length / PAGE_SIZE)))
const pagedSpells = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return allSpells.value.slice(start, start + PAGE_SIZE)
})
const displayItems = computed(() => (isBrowsing.value ? pagedSpells.value : results.value))
watch(isBrowsing, (browsing) => { if (browsing) page.value = 1 })

function shortComponent(composantes) {
  if (!composantes) return ''
  const m = composantes.match(/Composantes\s*:\s*(.+)/i)
  return m ? m[1] : composantes
}

function toHtml(entry) {
  if (entry.description_html) return entry.description_html
  if (!entry.description) return ''
  const escaped = entry.description
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
  return `<p>${escaped}</p>`
}

async function search() {
  const q = query.value.trim()
  if (!q) return
  if (spellCache.has(q)) {
    results.value = spellCache.get(q)
    searched.value = true
    return
  }
  loading.value = true
  searched.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/api/spells/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const data = await res.json()
      results.value = data
      spellCache.set(q, data)
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
    searched.value = true
  }
}

async function searchByClass(className) {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
  activeClassFilter.value = className
  loading.value = true
  searched.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/api/spells/by-class/${encodeURIComponent(className)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      results.value = await res.json()
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
    searched.value = true
  }
}

function clearClassFilter() {
  activeClassFilter.value = null
  results.value = []
  searched.value = false
}

function clearExactMatch() {
  exactMatchSlug.value = null
  search()
}

watch(query, () => {
  if (suppressQueryWatch) { suppressQueryWatch = false; return }
  if (activeClassFilter.value) activeClassFilter.value = null
  exactMatchSlug.value = null
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
  const q = query.value.trim()
  if (q.length < MIN_AUTO_SEARCH_LENGTH) {
    results.value = []
    searched.value = false
    loading.value = false
    return
  }
  autoSearchTimer = setTimeout(() => {
    search()
  }, 250)
})

// Pré-remplissage depuis la palette de commande globale (voir CommandPalette.vue)
// ou depuis le bouton « Voir les sorts » d'une fiche de classe (ClassSearch.vue).
// `immediate: true` est nécessaire pour que le tout premier accès à cet onglet depuis
// la palette fonctionne : au montage initial, `prefill.token` vaut déjà la valeur
// « nouvelle » (pas de changement détectable), donc un watcher non-immédiat ne se
// déclencherait jamais.
watch(() => props.prefill?.token, (token) => {
  if (!token) return
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
  if (props.prefill.classFilter) {
    suppressQueryWatch = true
    query.value = ''
    exactMatchSlug.value = null
    searchByClass(props.prefill.classFilter)
    return
  }
  activeClassFilter.value = null
  exactMatchSlug.value = props.prefill.exactSlug || null
  suppressQueryWatch = true
  query.value = props.prefill.query || ''
  search().then(() => {
    if (exactMatchSlug.value) {
      results.value = results.value.filter(s => s.slug === exactMatchSlug.value)
    }
  })
}, { immediate: true })

onUnmounted(() => {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
})
</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="lucide:sparkles" size="0.9em" /> Sorts</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom du sort, école, description…"
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
      <p class="no-results-text">Aucun sort trouvé pour « {{ activeClassFilter || query }} »</p>
    </div>

    <div v-else-if="displayItems.length > 0" class="results-info">
      <template v-if="isBrowsing">
        {{ allSpells.length }} sort(s) au total
      </template>
      <template v-else-if="activeClassFilter">
        {{ results.length }} sort(s) de la classe {{ activeClassFilter }}
        <button class="clear-filter-btn" type="button" @click="clearClassFilter">
          <AppIcon icon="lucide:x" size="0.7em" /> Réinitialiser
        </button>
      </template>
      <template v-else-if="exactMatchSlug">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>
        {{ results.length }} sort(s) trouvé(s)
        <span v-if="results.length === 50"> (premiers 50 résultats)</span>
      </template>
    </div>

    <div class="results-grid">
      <div v-for="spell in displayItems" :key="spell.slug" class="spell-card">
        <div class="spell-header">
          <div class="spell-title-row">
            <h3 class="spell-name">{{ spell.name }}</h3>
            <span v-if="parseEcole(spell.attributes?.ecole).ritual" class="ritual-badge">Rituel <HelpTip id="search.ritual" /></span>
          </div>
          <div class="spell-meta-row">
            <span
              class="school-badge"
              :style="{ '--school-color': schoolColor(parseEcole(spell.attributes?.ecole).school) }"
            >{{ parseEcole(spell.attributes?.ecole).school }}</span>
            <span class="level-badge">
              {{ levelLabel(parseEcole(spell.attributes?.ecole).level) }}
            </span>
          </div>
        </div>
        <div class="spell-attrs">
          <div v-if="spell.attributes?.temps_incantation" class="attr-item">
            <span class="attr-icon"><AppIcon icon="lucide:timer" size="0.85em" /></span>
            <span class="attr-val">{{ spell.attributes.temps_incantation.replace(/^Temps d'incantation\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.portee" class="attr-item">
            <span class="attr-icon"><AppIcon icon="lucide:crosshair" size="0.85em" /></span>
            <span class="attr-val">{{ spell.attributes.portee.replace(/^Portée\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.duree" class="attr-item">
            <span class="attr-icon"><AppIcon icon="lucide:hourglass" size="0.85em" /></span>
            <span class="attr-val">{{ spell.attributes.duree.replace(/^Durée\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.composantes" class="attr-item">
            <span class="attr-icon"><AppIcon icon="lucide:flask-conical" size="0.85em" /></span>
            <span class="attr-val">{{ shortComponent(spell.attributes.composantes) }}</span>
          </div>
        </div>
        <div v-if="spell.description_html || spell.description" class="spell-desc" v-html="toHtml(spell)" />
        <div v-if="spell.classes?.length" class="classes-row">
          <AppIcon icon="game-icons:vitruvian-man" size="0.7em" class="classes-icon" />
          <span v-for="cls in spell.classes" :key="cls" class="class-badge">{{ cls }}</span>
        </div>
        <a :href="spell.detail_url" target="_blank" class="spell-link">Voir sur AideDD ↗</a>
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
  color: var(--color-gold-bright);
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

/* Results grid */
.results-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Spell card */
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

.school-badge {
  --school-color: var(--school-default);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
  color: var(--school-color);
  border-color: color-mix(in oklab, var(--school-color) 50%, transparent);
  background: color-mix(in oklab, var(--school-color) 16%, transparent);
}

.level-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
}

/* Attributes */
.spell-attrs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.35rem 0.75rem;
  background: var(--surface-ghost);
  border: 1px solid var(--surface-track);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}

.attr-item {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 0;
}
.attr-icon { font-size: 0.75rem; flex-shrink: 0; line-height: 1.4; }
.attr-val {
  font-family: var(--font-body), sans-serif;
  font-size: 0.72rem;
  color: var(--color-text-dim);
  line-height: 1.35;
  word-break: break-word;
}

/* Description */
.spell-desc {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.55;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.spell-desc :deep(p) { margin: 0.3rem 0; }
.spell-desc :deep(p:first-child) { margin-top: 0; }
.spell-desc :deep(br) { display: block; content: ''; margin-top: 0.2rem; }
.spell-desc :deep(strong), .spell-desc :deep(b) { color: var(--color-parchment); font-weight: 600; }
.spell-desc :deep(em), .spell-desc :deep(i) { font-style: italic; color: var(--color-gold-dark); }
.spell-desc :deep(ul), .spell-desc :deep(ol) { margin: 0.3rem 0; padding-left: 1.2rem; }
.spell-desc :deep(li) { margin: 0.1rem 0; }
.spell-desc :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
  font-size: 0.75rem;
}
.spell-desc :deep(th), .spell-desc :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.25rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.spell-desc :deep(th) {
  background: var(--surface-raised, rgba(255,255,255,0.05));
  color: var(--color-gold-dark);
  font-family: var(--font-heading), sans-serif;
  font-weight: 600;
}
.spell-desc :deep(tbody tr:hover) {
  background: var(--surface-ghost);
}

/* Classes badges */
.classes-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.classes-icon { color: var(--color-text-dim); flex-shrink: 0; }
.class-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
}

/* Filtre classe actif */
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

/* Link */
.spell-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  align-self: flex-start;
  transition: color 0.2s;
}
.spell-link:hover { color: var(--color-gold-bright); }
</style>
