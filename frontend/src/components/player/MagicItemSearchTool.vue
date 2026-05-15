<script setup>
import { ref, watch, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const query = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const searchCache = new Map()
const MIN_AUTO_SEARCH_LENGTH = 3
let autoSearchTimer = null

function descriptionHtml(item) {
  if (item.description_html) return item.description_html
  if (!item.description) return ''
  // Escape plain text so it is safe to insert as HTML
  const escaped = item.description
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
  return `<p>${escaped}</p>`
}

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
    const res = await fetch(`${BACKEND_URL}/api/magic-items/public/search?q=${encodeURIComponent(q)}`)
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
  <div class="magic-item-search-tool">
    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="Nom, type, rareté, description…"
        @keydown.enter="search"
      />
      <button class="search-btn" :disabled="loading || !query.trim()" @click="search">
        <AppIcon v-if="!loading" icon="lucide:search" size="0.85em" /> {{ loading ? '…' : 'Chercher' }}
      </button>
    </div>

    <p v-if="searched && results.length === 0 && !loading" class="no-results">
      Aucun objet trouvé pour « {{ query }} »
    </p>

    <div class="item-list">
      <article v-for="item in results" :key="item.slug" class="item-card">
        <div class="item-head">
          <h4 class="item-name">{{ item.name }}</h4>
          <div class="item-badges">
            <span v-if="item.source_category === 'standard'" class="item-badge-standard">Standard</span>
            <span v-if="item.requires_attunement" class="item-attunement">Harmonisation</span>
          </div>
        </div>
        <p class="item-meta">
          <span class="item-type">{{ item.item_type }}</span>
          <span
            class="item-rarity"
            :style="{ color: rarityColor(item.rarity) }"
          > • {{ item.rarity }}</span>
        </p>
        <div
          v-if="item.description_html || item.description"
          class="item-desc"
          v-html="descriptionHtml(item)"
        />
        <a :href="item.detail_url" target="_blank" class="item-link">Voir sur AideDD ↗</a>
      </article>
    </div>
  </div>
</template>

<style scoped>
.magic-item-search-tool { display: flex; flex-direction: column; gap: 0.75rem; }
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
.item-list { display: flex; flex-direction: column; gap: 0.6rem; }
.item-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  background: var(--player-control-bg-muted, var(--surface-ghost));
}
.item-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.item-name { margin: 0; font-size: 0.95rem; font-family: var(--font-heading); color: var(--color-parchment); }
.item-badges { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
.item-badge-standard {
  font-size: 0.6rem;
  color: var(--color-gold-dark);
  background: rgba(180, 140, 60, 0.12);
  border: 1px solid var(--color-gold-dark);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  font-family: var(--font-heading);
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.item-attunement {
  font-size: 0.6rem;
  color: var(--color-info-bright);
  background: var(--color-info-soft);
  border: 1px solid var(--color-info-border);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  font-family: var(--font-heading);
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.item-meta { margin: 0.15rem 0 0; font-size: 0.76rem; }
.item-type { color: var(--color-gold-dark); font-family: var(--font-heading); }
.item-rarity { font-family: var(--font-heading); }
.item-desc {
  margin: 0.15rem 0 0;
  color: var(--color-text-dim);
  font-size: 0.76rem;
  line-height: 1.45;
}
.item-desc :deep(p) { margin: 0.3rem 0; }
.item-desc :deep(p:first-child) { margin-top: 0; }
.item-desc :deep(br) { display: block; content: ''; margin-top: 0.2rem; }
.item-desc :deep(strong),
.item-desc :deep(b) { color: var(--color-parchment); font-weight: 600; }
.item-desc :deep(em),
.item-desc :deep(i) { font-style: italic; }
.item-desc :deep(ul),
.item-desc :deep(ol) { margin: 0.3rem 0; padding-left: 1.2rem; }
.item-desc :deep(li) { margin: 0.1rem 0; }
.item-desc :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
  font-size: 0.73rem;
}
.item-desc :deep(th),
.item-desc :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.25rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.item-desc :deep(th) {
  background: var(--surface-raised, rgba(255,255,255,0.05));
  color: var(--color-gold-dark);
  font-family: var(--font-heading);
  font-weight: 600;
}
.item-desc :deep(tbody tr:hover) {
  background: rgba(255, 255, 255, 0.03);
}
.item-link { display: inline-block; margin-top: 0.35rem; font-size: 0.65rem; color: var(--color-gold-dark); text-decoration: none; font-family: var(--font-heading); }
</style>
