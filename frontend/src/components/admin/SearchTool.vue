<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { authStore } from '../../stores/auth.js'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

// ── Sub-tab ──────────────────────────────────────────────────────────────
const activeSubTab = ref('spells') // 'spells' | 'items'

// ── Shared state (reset on tab switch) ───────────────────────────────────
const query = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const spellCache = new Map()
const itemCache = new Map()
const MIN_AUTO_SEARCH_LENGTH = 3
let autoSearchTimer = null

function switchSubTab(tab) {
  activeSubTab.value = tab
  query.value = ''
  results.value = []
  searched.value = false
  loading.value = false
}

// ── Spells helpers ────────────────────────────────────────────────────────
function parseEcole(ecole) {
  if (!ecole) return { level: null, school: '', ritual: false }
  const rituel = ecole.toLowerCase().includes('rituel')
  const match = ecole.match(/niveau\s+(\d+)\s*[-–]\s*(.+)/i)
  if (match) {
    let school = match[2].replace(/\s*\(rituel\)/i, '').trim()
    school = school.charAt(0).toUpperCase() + school.slice(1)
    return { level: parseInt(match[1]), school, ritual: rituel }
  }
  // Cantrip / tour de magie
  const cantrip = ecole.match(/tour de magie\s*[-–]?\s*(.*)/i)
  if (cantrip) {
    let school = cantrip[1].replace(/\s*\(rituel\)/i, '').trim()
    return { level: 0, school: school || ecole, ritual: rituel }
  }
  return { level: null, school: ecole, ritual: rituel }
}

function levelLabel(level) {
  if (level === null) return ''
  if (level === 0) return 'Tour de magie'
  return `Niveau ${level}`
}

const SCHOOL_COLORS = {
  abjuration: 'var(--school-abjuration)',
  divination: 'var(--school-divination)',
  enchantement: 'var(--school-enchantement)',
  évocation: 'var(--school-evocation)',
  illusion: 'var(--school-illusion)',
  invocation: 'var(--school-invocation)',
  nécromancie: 'var(--school-necromancie)',
  transmutation: 'var(--school-transmutation)',
}

function schoolColor(school) {
  const key = school.toLowerCase()
  for (const [k, v] of Object.entries(SCHOOL_COLORS)) {
    if (key.includes(k)) return v
  }
  return 'var(--school-default)'
}

function shortComponent(composantes) {
  if (!composantes) return ''
  const m = composantes.match(/Composantes\s*:\s*(.+)/i)
  return m ? m[1] : composantes
}

// ── Magic items helpers ───────────────────────────────────────────────────
const RARITY_COLORS = {
  'commun': 'var(--color-text-dim)',
  'peu commun': '#1eff00',
  'rare': '#0070dd',
  'très rare': '#a335ee',
  'légendaire': '#ff8000',
  'artéfact': '#e6cc80',
}

function rarityColor(rarity) {
  if (!rarity) return 'var(--color-text-dim)'
  const key = rarity.toLowerCase()
  for (const [k, v] of Object.entries(RARITY_COLORS)) {
    if (key.includes(k)) return v
  }
  return 'var(--color-text-dim)'
}

// ── Search ────────────────────────────────────────────────────────────────
async function search() {
  const q = query.value.trim()
  if (!q) return
  const cache = activeSubTab.value === 'spells' ? spellCache : itemCache
  if (cache.has(q)) {
    results.value = cache.get(q)
    searched.value = true
    return
  }
  loading.value = true
  searched.value = false
  try {
    const endpoint = activeSubTab.value === 'spells'
      ? `/api/spells/search?q=${encodeURIComponent(q)}`
      : `/api/magic-items/search?q=${encodeURIComponent(q)}`
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const data = await res.json()
      results.value = data
      cache.set(q, data)
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
    searched.value = true
  }
}

watch(query, () => {
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

onUnmounted(() => {
  if (autoSearchTimer) clearTimeout(autoSearchTimer)
})
</script>

<template>
  <div class="search-tool">
    <h2 class="section-title">🔍 Recherche</h2>

    <!-- Sub-tabs -->
    <div class="sub-tabs">
      <button
        class="sub-tab"
        :class="{ active: activeSubTab === 'spells' }"
        @click="switchSubTab('spells')"
      >✨ Sorts</button>
      <button
        class="sub-tab"
        :class="{ active: activeSubTab === 'items' }"
        @click="switchSubTab('items')"
      >💎 Objets magiques</button>
    </div>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        :placeholder="activeSubTab === 'spells' ? 'Nom du sort, école, description…' : 'Nom, type, rareté, description…'"
        @keydown.enter="search"
      />
      <button class="search-btn" :disabled="loading || !query.trim()" @click="search">
        {{ loading ? '…' : '🔍 Chercher' }}
      </button>
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="searched && results.length === 0" class="no-results">
      <p class="no-results-icon">📭</p>
      <p class="no-results-text">
        Aucun {{ activeSubTab === 'spells' ? 'sort' : 'objet magique' }} trouvé pour « {{ query }} »
      </p>
    </div>

    <div v-else-if="results.length > 0" class="results-info">
      {{ results.length }} {{ activeSubTab === 'spells' ? 'sort(s)' : 'objet(s) magique(s)' }} trouvé(s)
      <span v-if="results.length === 50"> (premiers 50 résultats)</span>
    </div>

    <!-- Spells results -->
    <div v-if="activeSubTab === 'spells'" class="results-grid">
      <div v-for="spell in results" :key="spell.slug" class="spell-card">
        <div class="spell-header">
          <div class="spell-title-row">
            <h3 class="spell-name">{{ spell.name }}</h3>
            <span v-if="parseEcole(spell.attributes?.ecole).ritual" class="ritual-badge">Rituel</span>
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
            <span class="attr-icon">⏱️</span>
            <span class="attr-val">{{ spell.attributes.temps_incantation.replace(/^Temps d'incantation\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.portee" class="attr-item">
            <span class="attr-icon">🎯</span>
            <span class="attr-val">{{ spell.attributes.portee.replace(/^Portée\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.duree" class="attr-item">
            <span class="attr-icon">⌛</span>
            <span class="attr-val">{{ spell.attributes.duree.replace(/^Durée\s*:\s*/i, '') }}</span>
          </div>
          <div v-if="spell.attributes?.composantes" class="attr-item">
            <span class="attr-icon">🧪</span>
            <span class="attr-val">{{ shortComponent(spell.attributes.composantes) }}</span>
          </div>
        </div>
        <div v-if="spell.description" class="spell-desc">{{ spell.description }}</div>
        <a :href="spell.detail_url" target="_blank" class="spell-link">Voir sur AideDD ↗</a>
      </div>
    </div>

    <!-- Magic items results -->
    <div v-if="activeSubTab === 'items'" class="results-grid">
      <div v-for="item in results" :key="item.slug" class="spell-card">
        <div class="spell-header">
          <div class="spell-title-row">
            <h3 class="spell-name">{{ item.name }}</h3>
            <span v-if="item.requires_attunement" class="ritual-badge">Harmonisation</span>
          </div>
          <div class="spell-meta-row">
            <span class="item-type-badge">{{ item.item_type }}</span>
            <span
              class="rarity-badge"
              :style="{ '--rarity-color': rarityColor(item.rarity) }"
            >{{ item.rarity }}</span>
          </div>
        </div>
        <div v-if="item.description" class="spell-desc">{{ item.description }}</div>
        <div v-if="item.source" class="item-source">📚 {{ item.source }}</div>
        <a :href="item.detail_url" target="_blank" class="spell-link">Voir sur AideDD ↗</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-tool {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0;
}

/* Sub-tabs */
.sub-tabs {
  display: flex;
  gap: 0.4rem;
}
.sub-tab {
  padding: 0.4rem 0.85rem;
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s;
}
.sub-tab:hover { border-color: var(--color-gold-dark); color: var(--color-gold-dark); }
.sub-tab.active {
  background: var(--surface-gold-soft);
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
}

.search-bar {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
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
  font-family: var(--font-heading);
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
.no-results-text { font-family: var(--font-heading); font-size: 0.85rem; color: var(--color-text-dim); margin: 0.5rem 0 0; }

/* Results count */
.results-info {
  font-family: var(--font-heading);
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

/* Spell / item card */
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
  font-family: var(--font-heading);
  font-size: 1rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
  flex: 1;
}

.ritual-badge {
  font-family: var(--font-heading);
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
  font-family: var(--font-heading);
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
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
}

.item-type-badge {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
}

.rarity-badge {
  font-family: var(--font-heading);
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
  font-family: var(--font-body);
  font-size: 0.72rem;
  color: var(--color-text-dim);
  line-height: 1.35;
  word-break: break-word;
}

/* Description */
.spell-desc {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.55;
  white-space: pre-line;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.item-source {
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  opacity: 0.7;
}

/* Link */
.spell-link {
  font-family: var(--font-heading);
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
