import { ref } from 'vue'
import { BACKEND_URL } from '@/config.js'

// Catalogues « petits » (races/classes/origines/aptitudes/services) chargés en une fois et
// mis en cache au niveau du module — utilisés par PlayerCommandPalette.vue pour filtrer
// localement sans requête serveur à chaque frappe (contrairement aux sorts/objets, trop
// volumineux, qui restent recherchés côté serveur via /api/*/public/search).
const races = ref([])
const classes = ref([])
const backgrounds = ref([])
const abilities = ref([])
const services = ref([])
let loaded = false
let loadPromise = null

async function fetchJson(path) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`)
    return res.ok ? await res.json() : []
  } catch (err) {
    console.error(err)
    return []
  }
}

export function usePlayerContentCatalogs() {
  async function load() {
    if (loaded) return
    if (loadPromise) return loadPromise
    loadPromise = Promise.all([
      fetchJson('/api/races/public/full'),
      fetchJson('/api/classes/public/full'),
      fetchJson('/api/backgrounds/public'),
      fetchJson('/api/classes/abilities/public'),
      fetchJson('/api/services/public'),
    ]).then(([r, c, b, a, s]) => {
      races.value = r
      classes.value = c
      backgrounds.value = b
      abilities.value = a
      services.value = s
      loaded = true
    })
    return loadPromise
  }

  return { races, classes, backgrounds, abilities, services, load }
}
