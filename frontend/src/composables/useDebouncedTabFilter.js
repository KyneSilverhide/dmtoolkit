import { ref, watch, onUnmounted } from 'vue'

// Filtre texte + « correspondance exacte » d'un onglet Contenu qui filtre une liste
// préchargée en mémoire (Races/Classes/Origines/États/Services/Aptitudes), synchronisé
// avec la query string (?q=&slug=) via useContentTabQuery. La correspondance exacte
// vient d'un deep-link (palette de commande ⌘K ou RefLink) qui cible un slug précis
// plutôt qu'un texte de recherche — voir ConditionSearch.vue pour le cas d'usage complet.
// Spell/Item, qui interrogent une route /search côté serveur au lieu de filtrer en
// mémoire, gèrent leur propre debounce et n'utilisent pas ce composable.
export function useDebouncedTabFilter(tabQuery, { debounceMs = 250 } = {}) {
  const query = ref('')
  const exactMatch = ref(null)
  let writeTimer = null
  let suppressQueryWatch = false
  let lastAppliedKey = ''

  function writeRouteQuery(q, slug) {
    lastAppliedKey = `${q || ''}|${slug || ''}`
    tabQuery.setParams({ q: q || null, slug: slug || null })
  }

  watch(query, () => {
    if (suppressQueryWatch) { suppressQueryWatch = false; return }
    exactMatch.value = null
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(() => writeRouteQuery(query.value.trim(), ''), debounceMs)
  })

  function applyFromRoute() {
    const q = tabQuery.param('q')
    const slug = tabQuery.param('slug')
    const key = `${q}|${slug}`
    if (key === lastAppliedKey) return
    lastAppliedKey = key
    if (!q && !slug) return
    suppressQueryWatch = true
    query.value = q
    exactMatch.value = slug || null
  }
  tabQuery.onRouteParamsChange(applyFromRoute)

  function clearExactMatch() {
    exactMatch.value = null
    writeRouteQuery(query.value.trim(), '')
  }

  onUnmounted(() => {
    if (writeTimer) clearTimeout(writeTimer)
  })

  return { query, exactMatch, clearExactMatch }
}
