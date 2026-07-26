<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import AppIcon from '../AppIcon.vue'
import LinkedText from '../LinkedText.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'
import { spellCandidates, withGlossary } from '@/utils/textLinker.js'
import ContentActionButtons from './ContentActionButtons.vue'

const tabQuery = useContentTabQuery('races')
let writeTimer = null

const query = ref('')
const races = ref([])
const loading = ref(false)
const loadError = ref(false)
// Slug exact ciblé depuis la palette de commande (Ctrl+K) : si renseigné, la liste est
// réduite à cette seule race plutôt qu'à toutes celles correspondant au texte recherché.
const exactSlugFilter = ref(null)
let suppressQueryWatch = false

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

async function loadRaces() {
  loading.value = true
  loadError.value = false
  try {
    const res = await apiFetch('/api/races', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      races.value = await res.json()
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
    const res = await apiFetch('/api/spells', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) spells.value = await res.json()
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => { loadRaces(); loadSpells() })

const refCandidates = computed(() => withGlossary(spellCandidates(spells.value)))

function raceMatches(race, q) {
  if (stripAccents(race.name.toLowerCase()).includes(q)) return true
  if (stripAccents((race.ability_bonus || '').toLowerCase()).includes(q)) return true
  if ((race.traits || []).some(t => stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q))) return true
  return (race.subraces || []).some(sr =>
    stripAccents(sr.name.toLowerCase()).includes(q) ||
    (sr.traits || []).some(t => stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q))
  )
}

const filteredRaces = computed(() => {
  if (exactSlugFilter.value) return races.value.filter(race => race.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return races.value
  return races.value.filter(race => raceMatches(race, q))
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
// (CommandPalette.vue) qui navigue directement vers /admin/races avec ces query
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
    <h2 class="section-title"><AppIcon icon="game-icons:vitruvian-man" size="0.9em" /> Races</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, trait, bonus de caractéristique…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les races.</p>
    </div>

    <div v-else-if="filteredRaces.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucune race trouvée pour « {{ query }} »</p>
    </div>

    <div v-else class="results-info">
      <template v-if="exactSlugFilter">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>{{ filteredRaces.length }} race(s)</template>
    </div>

    <div class="results-grid">
      <div v-for="race in filteredRaces" :key="race.slug" class="race-card">
        <div class="race-header">
          <AppIcon :icon="race.icon" size="1.6rem" class="race-icon" />
          <div class="race-header-main">
            <h3 class="race-name">{{ race.name }}</h3>
            <span class="ability-badge">{{ race.ability_bonus }}</span>
          </div>
        </div>

        <div class="race-attrs">
          <span class="race-attr"><AppIcon icon="lucide:ruler" size="0.75em" /> {{ race.size }}</span>
          <span class="race-attr"><AppIcon icon="lucide:footprints" size="0.75em" /> {{ race.speed }}</span>
          <span class="race-attr"><AppIcon icon="lucide:hourglass" size="0.75em" /> {{ race.age }}</span>
          <span class="race-attr"><AppIcon icon="lucide:languages" size="0.75em" /> {{ race.languages.join(', ') }}</span>
        </div>

        <ul v-if="race.traits.length" class="trait-list">
          <li v-for="trait in race.traits" :key="trait.name" class="trait-item">
            <span class="trait-name">{{ trait.name }}</span>
            <span class="trait-desc"><LinkedText :text="trait.description" :candidates="refCandidates" :trait-name="trait.name" /></span>
          </li>
        </ul>

        <div v-if="race.subraces.length" class="subrace-list">
          <div v-for="subrace in race.subraces" :key="subrace.name" class="subrace-card">
            <div class="subrace-header">
              <h4 class="subrace-name">{{ subrace.name }}</h4>
              <span class="ability-badge ability-badge-sub">{{ subrace.ability_bonus }}</span>
            </div>
            <ul class="trait-list">
              <li v-for="trait in subrace.traits" :key="trait.name" class="trait-item">
                <span class="trait-name">{{ trait.name }}</span>
                <span class="trait-desc"><LinkedText :text="trait.description" :candidates="refCandidates" :trait-name="trait.name" /></span>
              </li>
            </ul>
          </div>
        </div>

        <div class="race-footer">
          <span class="race-source"><AppIcon icon="lucide:library" size="0.8em" /> {{ race.source }}</span>
          <a :href="race.detail_url" target="_blank" class="race-link">Voir sur AideDD ↗</a>
          <ContentActionButtons content-type="race" :item="race" />
        </div>
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

.race-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: border-color 0.2s;
}
.race-card:hover { border-color: var(--color-gold-dark); }

.race-header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.race-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.race-header-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.race-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.ability-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
}
.ability-badge-sub { font-size: 0.55rem; }

.race-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}
.race-attr {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
}

.trait-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.trait-item {
  font-size: 0.8rem;
  line-height: 1.5;
}
.trait-name {
  font-family: var(--font-heading), sans-serif;
  color: var(--color-gold-dark);
  font-weight: 600;
  margin-right: 0.4rem;
}
.trait-desc { color: var(--color-text-dim); }

.subrace-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-top: 1px dashed var(--color-border);
  padding-top: 0.75rem;
}
.subrace-card {
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.subrace-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.subrace-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  color: var(--color-parchment);
  margin: 0;
}

.race-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.race-source {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  opacity: 0.7;
}
.race-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.race-link:hover { color: var(--color-gold-bright); }
</style>
