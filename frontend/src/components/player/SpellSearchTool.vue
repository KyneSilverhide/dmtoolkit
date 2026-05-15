<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'

function descriptionHtml(spell) {
  if (spell.description_html) {
    return spell.description_html
  }
  if (!spell.description) return ''
  const escaped = spell.description
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
  return `<p>${escaped}</p>`
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const query = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const searchCache = new Map()
const MIN_AUTO_SEARCH_LENGTH = 3
let autoSearchTimer = null

const enrichedResults = computed(() =>
  results.value.map(spell => ({
    ...spell,
    parsedEcole: parseEcole(spell.attributes?.ecole),
  }))
)

function parseEcole(ecole) {
  if (!ecole) return { level: null, school: '', ritual: false }
  const rituel = ecole.toLowerCase().includes('rituel')
  const match = ecole.match(/niveau\s+(\d+)\s*[-–]\s*(.+)/i)
  if (match) {
    let school = match[2].replace(/\s*\(rituel\)/i, '').trim()
    school = school.charAt(0).toUpperCase() + school.slice(1)
    return { level: parseInt(match[1]), school, ritual: rituel }
  }
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

function shortComponent(composantes) {
  if (!composantes) return ''
  const m = composantes.match(/Composantes\s*:\s*(.+)/i)
  return m ? m[1] : composantes
}

async function search() {
  const q = query.value.trim()
  if (!q) return
  if (searchCache.has(q)) {
    results.value = searchCache.get(q)
    searched.value = true
    return
  }
  loading.value = true
  searched.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/api/spells/public/search?q=${encodeURIComponent(q)}`)
    if (res.ok) {
      const data = await res.json()
      results.value = data
      searchCache.set(q, data)
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
  <div class="spell-search-tool">
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

    <p v-if="searched && results.length === 0 && !loading" class="no-results">
      Aucun sort trouvé pour « {{ query }} »
    </p>

    <div class="spell-list">
      <article v-for="spell in enrichedResults" :key="spell.slug" class="spell-card">
        <div class="spell-head">
          <h4 class="spell-name">{{ spell.name }}</h4>
          <span class="spell-level">{{ levelLabel(spell.parsedEcole.level) }}</span>
        </div>
        <p class="spell-school">
          {{ spell.parsedEcole.school }}
          <span v-if="spell.parsedEcole.ritual"> • Rituel</span>
        </p>
        <p v-if="spell.attributes?.temps_incantation" class="spell-meta">
          <AppIcon icon="lucide:timer" size="0.8em" /> {{ spell.attributes.temps_incantation.replace(/^Temps d'incantation\s*:\s*/i, '') }}
        </p>
        <p v-if="spell.attributes?.portee" class="spell-meta">
          <AppIcon icon="lucide:crosshair" size="0.8em" /> {{ spell.attributes.portee.replace(/^Portée\s*:\s*/i, '') }}
        </p>
        <p v-if="spell.attributes?.duree" class="spell-meta">
          <AppIcon icon="lucide:hourglass" size="0.8em" /> {{ spell.attributes.duree.replace(/^Durée\s*:\s*/i, '') }}
        </p>
        <p v-if="spell.attributes?.composantes" class="spell-meta">
          <AppIcon icon="lucide:flask-conical" size="0.8em" /> {{ shortComponent(spell.attributes.composantes) }}
        </p>
        <div
          v-if="spell.description_html || spell.description"
          class="spell-desc"
          v-html="descriptionHtml(spell)"
        />
        <a :href="spell.detail_url" target="_blank" class="spell-link">Voir sur AideDD ↗</a>
      </article>
    </div>
  </div>
</template>

<style scoped>
.spell-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
.search-bar { display: flex; gap: 0.45rem; }
.search-input {
  flex: 1;
  background: var(--player-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  color: var(--color-parchment);
  outline: none;
}
.search-input:focus { border-color: var(--color-gold-dark); }
.search-btn {
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  background: var(--player-gold-bg, var(--surface-gold-soft));
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  cursor: pointer;
}
.search-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.no-results { margin: 0; color: var(--color-text-dim); font-size: 0.85rem; }
.spell-list { display: flex; flex-direction: column; gap: 0.6rem; }
.spell-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
}
.spell-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
.spell-name { margin: 0; font-size: 0.95rem; font-family: var(--font-heading); color: var(--color-parchment); }
.spell-level { font-size: 0.62rem; color: var(--color-gold-dark); font-family: var(--font-heading); text-transform: uppercase; letter-spacing: 0.08em; }
.spell-school, .spell-meta { margin: 0.15rem 0 0; color: var(--color-text-dim); font-size: 0.76rem; }
.spell-desc {
  margin: 0.15rem 0 0;
  color: var(--color-text-dim);
  font-size: 0.76rem;
  line-height: 1.45;
}
.spell-desc :deep(p) { margin: 0.3rem 0; }
.spell-desc :deep(p:first-child) { margin-top: 0; }
.spell-desc :deep(br) { display: block; content: ''; margin-top: 0.2rem; }
.spell-desc :deep(strong),
.spell-desc :deep(b) { color: var(--color-parchment); font-weight: 600; }
.spell-desc :deep(em),
.spell-desc :deep(i) { font-style: italic; }
.spell-desc :deep(ul),
.spell-desc :deep(ol) { margin: 0.3rem 0; padding-left: 1.2rem; }
.spell-desc :deep(li) { margin: 0.1rem 0; }
.spell-desc :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
  font-size: 0.73rem;
}
.spell-desc :deep(th),
.spell-desc :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.25rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.spell-desc :deep(th) {
  background: var(--surface-raised, rgba(255,255,255,0.05));
  color: var(--color-gold-dark);
  font-family: var(--font-heading);
  font-weight: 600;
}
.spell-desc :deep(tbody tr:hover) {
  background: rgba(255, 255, 255, 0.03);
}
.spell-link { display: inline-block; margin-top: 0.35rem; font-size: 0.65rem; color: var(--color-gold-dark); text-decoration: none; font-family: var(--font-heading); }
</style>
