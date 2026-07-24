<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { authStore } from '@/stores/auth.js'
import AppIcon from '../AppIcon.vue'
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  // Pré-remplissage déclenché depuis la palette de commande globale :
  // { query, token }. `token` doit changer à chaque nouvelle requête pour
  // que le watcher se déclenche même si `query` est identique à la dernière fois.
  prefill: { type: Object, default: null },
})

const query = ref('')
const backgrounds = ref([])
const loading = ref(false)
const loadError = ref(false)
// Slug exact ciblé depuis la palette de commande (Ctrl+K) : si renseigné, la liste est
// réduite à cette seule origine plutôt qu'à toutes celles correspondant au texte recherché.
const exactSlugFilter = ref(null)
let suppressQueryWatch = false

// Sections dépliées par origine : `${slug}:personality` -> true
const expanded = reactive({})
function togglePersonality(slug) {
  expanded[slug] = !expanded[slug]
}

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function loadBackgrounds() {
  loading.value = true
  loadError.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/api/backgrounds`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      backgrounds.value = await res.json()
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

onMounted(loadBackgrounds)

function backgroundMatches(background, q) {
  if (stripAccents(background.name.toLowerCase()).includes(q)) return true
  if ((background.skill_proficiencies || []).some(s => stripAccents(s.toLowerCase()).includes(q))) return true
  if ((background.tool_proficiencies || []).some(t => stripAccents(t.toLowerCase()).includes(q))) return true
  if (background.feature && (stripAccents(background.feature.name.toLowerCase()).includes(q) || stripAccents(background.feature.description.toLowerCase()).includes(q))) return true
  if (stripAccents((background.description || '').toLowerCase()).includes(q)) return true
  return ['personality_traits', 'ideals', 'bonds', 'flaws'].some(key =>
    (background[key] || []).some(entry => stripAccents(entry.toLowerCase()).includes(q))
  )
}

const filteredBackgrounds = computed(() => {
  if (exactSlugFilter.value) return backgrounds.value.filter(background => background.slug === exactSlugFilter.value)
  const q = stripAccents(query.value.trim().toLowerCase())
  if (!q) return backgrounds.value
  return backgrounds.value.filter(background => backgroundMatches(background, q))
})

watch(query, () => {
  if (suppressQueryWatch) { suppressQueryWatch = false; return }
  exactSlugFilter.value = null
})

// Pré-remplissage depuis la palette de commande globale (voir CommandPalette.vue).
// `immediate: true` est nécessaire pour que le tout premier accès à cet onglet depuis
// la palette fonctionne (voir SpellSearch.vue pour le détail du raisonnement).
watch(() => props.prefill?.token, (token) => {
  if (!token) return
  suppressQueryWatch = true
  query.value = props.prefill.query || ''
  exactSlugFilter.value = props.prefill.exactSlug || null
}, { immediate: true })

function clearExactMatch() {
  exactSlugFilter.value = null
}
</script>

<template>
  <div class="search-tool">
    <h2 class="section-title"><AppIcon icon="game-icons:scroll-unfurled" size="0.9em" /> Origines</h2>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, compétence, capacité, trait de personnalité…"
      />
    </div>

    <div v-if="loading" class="search-loading">
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
      <span class="loading-dot">●</span>
    </div>

    <div v-else-if="loadError" class="no-results">
      <p class="no-results-text">Impossible de charger les origines.</p>
    </div>

    <div v-else-if="filteredBackgrounds.length === 0" class="no-results">
      <p class="no-results-icon"><AppIcon icon="lucide:mail-x" size="2.5rem" color="var(--color-text-dim)" /></p>
      <p class="no-results-text">Aucune origine trouvée pour « {{ query }} »</p>
    </div>

    <div v-else class="results-info">
      <template v-if="exactSlugFilter">
        Correspondance exacte
        <button class="clear-filter-btn" type="button" @click="clearExactMatch">
          <AppIcon icon="lucide:x" size="0.7em" /> Voir tous les résultats
        </button>
      </template>
      <template v-else>{{ filteredBackgrounds.length }} origine(s)</template>
    </div>

    <div class="results-grid">
      <div v-for="background in filteredBackgrounds" :key="background.slug" class="bg-card">
        <div class="bg-header">
          <AppIcon :icon="background.icon" size="1.6rem" class="bg-icon" />
          <div class="bg-header-main">
            <h3 class="bg-name">{{ background.name }}</h3>
            <span v-for="skill in background.skill_proficiencies" :key="skill" class="skill-badge">{{ skill }}</span>
          </div>
        </div>

        <p v-if="background.description" class="bg-desc">{{ background.description }}</p>

        <div class="bg-attrs">
          <span v-if="background.tool_proficiencies?.length" class="bg-attr">
            <AppIcon icon="lucide:hammer" size="0.75em" /> {{ background.tool_proficiencies.join(', ') }}
          </span>
          <span v-if="background.languages_count" class="bg-attr">
            <AppIcon icon="lucide:languages" size="0.75em" /> {{ background.languages_count }} langue(s) au choix
          </span>
          <span v-if="background.languages_note" class="bg-attr">{{ background.languages_note }}</span>
        </div>

        <p class="bg-equipment"><AppIcon icon="lucide:backpack" size="0.8em" /> {{ background.equipment }}</p>

        <div v-if="background.feature" class="feature-block">
          <span class="feature-name"><AppIcon icon="lucide:star" size="0.75em" /> {{ background.feature.name }}</span>
          <p class="feature-desc">{{ background.feature.description }}</p>
        </div>

        <!-- Personnalité suggérée -->
        <button class="section-toggle" type="button" @click="togglePersonality(background.slug)">
          <AppIcon :icon="expanded[background.slug] ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="0.8em" />
          Personnalité suggérée
        </button>
        <div v-if="expanded[background.slug]" class="personality-section">
          <div class="personality-group">
            <h4 class="personality-label">Traits (d8)</h4>
            <ol class="personality-list">
              <li v-for="(entry, i) in background.personality_traits" :key="i">{{ entry }}</li>
            </ol>
          </div>
          <div class="personality-group">
            <h4 class="personality-label">Idéaux (d6)</h4>
            <ol class="personality-list">
              <li v-for="(entry, i) in background.ideals" :key="i">{{ entry }}</li>
            </ol>
          </div>
          <div class="personality-group">
            <h4 class="personality-label">Liens (d6)</h4>
            <ol class="personality-list">
              <li v-for="(entry, i) in background.bonds" :key="i">{{ entry }}</li>
            </ol>
          </div>
          <div class="personality-group">
            <h4 class="personality-label">Défauts (d6)</h4>
            <ol class="personality-list">
              <li v-for="(entry, i) in background.flaws" :key="i">{{ entry }}</li>
            </ol>
          </div>
        </div>

        <div class="bg-footer">
          <span class="bg-source"><AppIcon icon="lucide:library" size="0.8em" /> {{ background.source }}</span>
          <a :href="background.detail_url" target="_blank" class="bg-link">Voir sur AideDD ↗</a>
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

.bg-card {
  background: var(--gradient-panel-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.2s;
}
.bg-card:hover { border-color: var(--color-gold-dark); }

.bg-header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.bg-icon { color: var(--color-gold-dark); flex-shrink: 0; }
.bg-header-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.bg-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  color: var(--color-parchment);
  margin: 0;
}

.skill-badge {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-gold-bright);
  background: var(--surface-gold-soft-strong);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
}

.bg-desc {
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.55;
  margin: 0;
}

.bg-attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}
.bg-attr {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  color: var(--color-text-dim);
}

.bg-equipment {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.78rem;
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.5;
}

.feature-block {
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.feature-name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-gold-bright);
}
.feature-desc {
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

.personality-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  padding-left: 0.2rem;
}
.personality-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.personality-label {
  margin: 0;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}
.personality-list {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  line-height: 1.45;
}

.bg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.bg-source {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--color-text-dim);
  opacity: 0.7;
}
.bg-link {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  text-decoration: none;
  transition: color 0.2s;
}
.bg-link:hover { color: var(--color-gold-bright); }
</style>
