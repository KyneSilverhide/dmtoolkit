import { ref, computed } from 'vue'
import { BACKEND_URL } from '@/config.js'

// Charge une fois (par instance de composant) une liste de contenu depuis un endpoint public
// (sans JWT — voir les routes GET /api/*/public de races/classes/backgrounds/services), et
// expose un filtrage local insensible aux accents. Utilisé par les onglets de contenu de
// l'écran joueur (RaceSearchTool.vue, BackgroundSearchTool.vue, AbilitySearchTool.vue,
// ServiceSearchTool.vue) : ces catalogues sont petits (9 à ~900 entrées pour les aptitudes)
// et livrés en une fois, comme le fait déjà ConditionSearch.vue côté MJ pour les états.
//
// matchFn(item, normalizedQuery, normalizeFn) → boolean, appelé pour chaque item.
export function usePublicContentList(path, matchFn) {
  const items = ref([])
  const loading = ref(false)
  const error = ref(false)
  const query = ref('')
  let loaded = false
  let loadPromise = null

  function stripAccents(str) {
    return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  }
  function normalize(str) {
    return stripAccents(str).toLowerCase()
  }

  async function load() {
    if (loaded) return
    if (loadPromise) return loadPromise
    loading.value = true
    error.value = false
    loadPromise = (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}${path}`)
        if (res.ok) {
          items.value = await res.json()
          loaded = true
        } else {
          error.value = true
        }
      } catch (err) {
        console.error(err)
        error.value = true
      } finally {
        loading.value = false
      }
    })()
    return loadPromise
  }

  const filtered = computed(() => {
    const q = normalize(query.value.trim())
    if (!q) return items.value
    return items.value.filter(item => matchFn(item, q, normalize))
  })

  return { items, filtered, loading, error, query, load, normalize }
}
