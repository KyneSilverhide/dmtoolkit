<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '@/stores/auth.js'
import { apiFetch } from '@/utils/apiFetch.js'
import AppIcon from '../AppIcon.vue'
import { useContentTabQuery } from '@/composables/useContentTabQuery.js'

const router = useRouter()
const tabQuery = useContentTabQuery('classes')
let writeTimer = null

// Navigue directement vers l'onglet Sorts filtré par classe (voir SpellSearch.vue
// `by-class`), au lieu de faire remonter un événement à AdminView.
function goToClassSpells(dndClass) {
  router.push({ path: '/admin/spells', query: { class: dndClass.name } })
}

const query = ref('')
const classes = ref([])
const loading = ref(false)
const loadError = ref(false)
// Slug exact ciblé depuis la palette de commande (Ctrl+K) : si renseigné, la liste est
// réduite à cette seule classe plutôt qu'à toutes celles correspondant au texte recherché.
const exactSlugFilter = ref(null)
let suppressQueryWatch = false

// Sections dépliées par classe : `${slug}:${section}` -> true
const expanded = reactive({})
function toggleSection(slug, section) {
  const key = `${slug}:${section}`
  expanded[key] = !expanded[key]
}
function isExpanded(slug, section) {
  return !!expanded[`${slug}:${section}`]
}

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function loadClasses() {
  loading.value = true
  loadError.value = false
  try {
    const res = await apiFetch('/api/classes', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      classes.value = await res.json()
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

onMounted(loadClasses)

function classMatches(dndClass, q) {
  if (stripAccents(dndClass.name.toLowerCase()).includes(q)) return true
  if (stripAccents((dndClass.primary_ability || '').toLowerCase()).includes(q)) return true
  if ((dndClass.features || []).some(f => stripAccents(f.name.toLowerCase()).includes(q) || stripAccents(f.description.toLowerCase()).includes(q))) return true
  return (dndClass.subclasses || []).some(sc =>
    stripAccents(sc.name.toLowerCase()).includes(q) ||
    (sc.traits || []).some(t => stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q))
  )
}

const filteredClasses = computed(() => {
  if (exactSlugFilter.value) return classes.value.filter(dndClass => dndClass.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return classes.value
  return classes.value.filter(dndClass => classMatches(dndClass, q))
})

// Si la recherche matche un trait précis (et non le nom/la caractéristique clé, déjà
// visibles dans l'en-tête), on affiche un aperçu de ce trait directement sur la carte
// plutôt que de forcer à déplier les sections pour comprendre pourquoi la classe matche.
function findMatchedTrait(dndClass, q) {
  const feature = (dndClass.features || []).find(f =>
    stripAccents(f.name.toLowerCase()).includes(q) || stripAccents(f.description.toLowerCase()).includes(q)
  )
  if (feature) return { name: feature.name, description: feature.description, source: dndClass.name }
  for (const sc of dndClass.subclasses || []) {
    const trait = (sc.traits || []).find(t =>
      stripAccents(t.name.toLowerCase()).includes(q) || stripAccents(t.description.toLowerCase()).includes(q)
    )
    if (trait) return { name: trait.name, description: trait.description, source: `${dndClass.name} · ${sc.name}` }
  }
  return null
}

const traitPreviews = computed(() => {
  const q = stripAccents(query.value.trim().toLowerCase())
  const map = {}
  if (!q) return map
  for (const dndClass of filteredClasses.value) {
    if (stripAccents(dndClass.name.toLowerCase()).includes(q)) continue
    if (stripAccents((dndClass.primary_ability || '').toLowerCase()).includes(q)) continue
    const trait = findMatchedTrait(dndClass, q)
    if (trait) map[dndClass.slug] = trait
  }
  return map
})

// Niveaux où une classe gagne au moins un trait (les niveaux "vides" ne sont pas affichés
// dans la progression condensée, seul le bonus de maîtrise progresse entre deux paliers).
function levelsWithFeatures(dndClass) {
  return (dndClass.levels || []).filter(l => l.features && l.features.length > 0)
}

function spellSlotsLabel(row) {
  if (!row) return ''
  if (row.slot_count !== undefined) {
    // Magie de pacte (Occultiste) : N emplacements d'un niveau donné
    return row.slot_count > 0 ? `${row.slot_count} emplacement(s) de niveau ${row.slot_level}` : '—'
  }
  const slots = row.slots || []
  const parts = slots
    .map((n, i) => (n > 0 ? `${n}×niv.${i + 1}` : null))
    .filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

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
// (CommandPalette.vue) ou bouton "Voir la classe" d'AbilitySearch.vue, qui naviguent
// directement vers /admin/classes avec ces query params. Rejoué à l'activation car ce
// composant reste monté en permanence via <KeepAlive> (voir SpellSearch.vue).
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
    <h2 class="section-title"><AppIcon icon="game-icons:vitruvian-man" size="0.9em" /> Classes</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, trait, sous-classe, caractéristique…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les classes.</p>
    </div>

    <div v-else-if="filteredClasses.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucune classe trouvée pour « {{ query }} »</p>
    </div>

    <div v-else class="results-info">
      <template v-if="exactSlugFilter">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>{{ filteredClasses.length }} classe(s)</template>
    </div>

    <div class="results-grid">
      <div v-for="dndClass in filteredClasses" :key="dndClass.slug" class="class-card">
        <div class="class-header">
          <AppIcon :icon="dndClass.icon" size="1.6rem" class="class-icon" />
          <div class="class-header-main">
            <h3 class="class-name">{{ dndClass.name }}</h3>
            <span class="stat-badge">Dé de vie {{ dndClass.hit_die }}</span>
            <span class="stat-badge">{{ dndClass.primary_ability }}</span>
            <span v-if="dndClass.spellcasting" class="stat-badge stat-badge-spell">
              <AppIcon icon="lucide:sparkles" size="0.7em" /> Lanceur ({{ dndClass.spellcasting.ability }})
            </span>
          </div>
        </div>

        <div class="class-attrs">
          <span class="class-attr"><AppIcon icon="lucide:shield-check" size="0.75em" /> JS : {{ dndClass.saving_throws.join(', ') }}</span>
          <span class="class-attr"><AppIcon icon="lucide:shirt" size="0.75em" /> {{ dndClass.armor_proficiencies.length ? dndClass.armor_proficiencies.join(', ') : 'Aucune armure' }}</span>
          <span class="class-attr"><AppIcon icon="game-icons:crossed-swords" size="0.75em" /> {{ dndClass.weapon_proficiencies.join(', ') }}</span>
          <span v-if="dndClass.tool_proficiencies?.length" class="class-attr"><AppIcon icon="lucide:hammer" size="0.75em" /> {{ dndClass.tool_proficiencies.join(', ') }}</span>
          <span class="class-attr"><AppIcon icon="lucide:sparkle" size="0.75em" /> Compétences : {{ dndClass.skill_choices.count }} parmi {{ dndClass.skill_choices.options.join(', ') }}</span>
        </div>

        <p class="starting-equipment"><AppIcon icon="lucide:backpack" size="0.8em" /> {{ dndClass.starting_equipment }}</p>

        <!-- Aperçu du trait qui matche la recherche -->
        <div v-if="traitPreviews[dndClass.slug]" class="matched-trait-preview">
          <div class="matched-trait-head">
            <AppIcon icon="lucide:search" size="0.75em" />
            <span class="matched-trait-name">{{ traitPreviews[dndClass.slug].name }}</span>
            <span class="matched-trait-source">{{ traitPreviews[dndClass.slug].source }}</span>
          </div>
          <p class="matched-trait-desc">{{ traitPreviews[dndClass.slug].description }}</p>
        </div>

        <!-- Traits -->
        <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, 'features')">
          <AppIcon :icon="isExpanded(dndClass.slug, 'features') ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
          Traits de classe ({{ dndClass.features.length }})
        </button>
        <ul v-if="isExpanded(dndClass.slug, 'features')" class="trait-list">
          <li v-for="trait in dndClass.features" :key="trait.name" class="trait-item">
            <span class="trait-name">{{ trait.name }}</span>
            <span class="trait-level">niv. {{ trait.level }}</span>
            <span class="trait-desc">{{ trait.description }}</span>
          </li>
        </ul>

        <!-- Progression 1-20 -->
        <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, 'levels')">
          <AppIcon :icon="isExpanded(dndClass.slug, 'levels') ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
          Progression (niveaux 1-20)
        </button>
        <div v-if="isExpanded(dndClass.slug, 'levels')" class="level-table">
          <div v-for="row in levelsWithFeatures(dndClass)" :key="row.level" class="level-row">
            <span class="level-num">Niv. {{ row.level }}</span>
            <span class="level-prof">Maîtrise +{{ row.proficiency_bonus }}</span>
            <span class="level-features">{{ row.features.join(', ') }}</span>
          </div>
        </div>

        <!-- Emplacements de sorts -->
        <template v-if="dndClass.spellcasting">
          <div class="section-toggle-row">
            <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, 'spells')">
              <AppIcon :icon="isExpanded(dndClass.slug, 'spells') ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
              Emplacements de sorts
            </button>
            <button class="spells-link-btn" type="button" @click="goToClassSpells(dndClass)">
              <AppIcon icon="lucide:sparkles" size="0.75em" /> Voir les sorts de cette classe
            </button>
          </div>
          <div v-if="isExpanded(dndClass.slug, 'spells')" class="spell-section">
            <p class="spell-notes">{{ dndClass.spellcasting.notes }}</p>
            <div class="level-table">
              <div v-for="row in dndClass.spellcasting.slots_table" :key="row.level" class="level-row">
                <span class="level-num">Niv. {{ row.level }}</span>
                <span class="level-prof">{{ row.cantrips }} sort(s) mineur(s)</span>
                <span class="level-features">{{ spellSlotsLabel(row) }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Sous-classes -->
        <div v-if="dndClass.subclasses.length" class="subclass-list">
          <div v-for="subclass in dndClass.subclasses" :key="subclass.name" class="subclass-card">
            <button class="section-toggle" type="button" @click="toggleSection(dndClass.slug, `sub:${subclass.name}`)">
              <AppIcon :icon="isExpanded(dndClass.slug, `sub:${subclass.name}`) ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
              {{ subclass.name }} <span class="subclass-unlock">(dès le niveau {{ subclass.unlocked_at_level }})</span>
            </button>
            <ul v-if="isExpanded(dndClass.slug, `sub:${subclass.name}`)" class="trait-list">
              <li v-for="trait in subclass.traits" :key="trait.name" class="trait-item">
                <span class="trait-name">{{ trait.name }}</span>
                <span class="trait-level">niv. {{ trait.level }}</span>
                <span class="trait-desc">{{ trait.description }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="class-footer">
          <span class="class-source"><AppIcon icon="lucide:library" size="0.8em" /> {{ dndClass.source }}</span>
          <a :href="dndClass.detail_url" target="_blank" class="class-link">Voir sur AideDD ↗</a>
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

.class-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.2s;
}
.class-card:hover { border-color: var(--color-gold-dark); }

.class-header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.class-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.class-header-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.class-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.stat-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
}
.stat-badge-spell {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.class-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}
.class-attr {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
}

.starting-equipment {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.78rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.5;
}

.matched-trait-preview {
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.matched-trait-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--color-gold-dark);
}
.matched-trait-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-gold-bright);
}
.matched-trait-source {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  color: var(--color-text-dim);
  margin-left: auto;
}
.matched-trait-desc {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-dim);
  line-height: 1.5;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0.2rem 0;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  color: var(--color-gold-dark);
  cursor: pointer;
  text-align: left;
}
.section-toggle:hover { color: var(--color-gold-bright); }

.section-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.spells-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none;
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.6rem;
  color: var(--color-gold-dark);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.2s;
}
.spells-link-btn:hover { color: var(--color-gold-bright); background: var(--surface-gold-soft); }

.trait-list {
  list-style: none;
  margin: 0;
  padding: 0 0 0 0.2rem;
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
.trait-level {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  color: var(--color-text-dim);
  opacity: 0.7;
  margin-right: 0.4rem;
}
.trait-desc { color: var(--color-text-dim); }

.level-table {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-left: 0.2rem;
}
.level-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.75rem;
  padding: 0.2rem 0;
  border-bottom: 1px dashed var(--color-border);
}
.level-num {
  font-family: var(--font-heading), sans-serif;
  color: var(--color-gold-dark);
  min-width: 3.5rem;
}
.level-prof { color: var(--color-text-dim); min-width: 6rem; }
.level-features { color: var(--color-parchment); flex: 1; }

.spell-section { display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.2rem; }
.spell-notes { font-size: 0.78rem; color: var(--color-text-dim); margin: 0; line-height: 1.5; }

.subclass-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-top: 1px dashed var(--color-border);
  padding-top: 0.6rem;
}
.subclass-card {
  background: var(--surface-ghost);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.subclass-unlock {
  font-size: 0.6rem;
  color: var(--color-text-dim);
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: none;
}

.class-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.class-source {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  opacity: 0.7;
}
.class-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.class-link:hover { color: var(--color-gold-bright); }
</style>
