import { ref } from 'vue'
import { BACKEND_URL } from '@/config.js'
import { CONDITION_STYLES } from '@/utils/conditions.js'

// Fusionne la config de présentation locale (icône/couleur/id, voir utils/conditions.js) avec
// le contenu de règles servi par le backend (nom, description, lien AideDD — source unique :
// backend/src/data/dnd_conditions.json). Endpoint public (pas de JWT) car consommé par l'écran
// TV et l'écran joueur, ni l'un ni l'autre authentifiés en tant qu'admin.
//
// Le fetch est partagé (une seule requête réseau) et mis en cache au niveau du module : les 15
// états ne changent jamais en cours de session, inutile de le refaire par composant/onglet.

function fallbackList() {
  return CONDITION_STYLES.map(style => ({ ...style, label: style.fallbackLabel, description: '', detail_url: null }))
}

const conditions = ref(fallbackList())
const loaded = ref(false)
let fetchPromise = null

async function fetchOnce() {
  if (fetchPromise) return fetchPromise
  fetchPromise = fetch(`${BACKEND_URL}/api/conditions/public`)
    .then(res => (res.ok ? res.json() : []))
    .catch(err => { console.error(err); return [] })
  const backendConditions = await fetchPromise
  const bySlug = Object.fromEntries(backendConditions.map(c => [c.slug, c]))
  conditions.value = CONDITION_STYLES.map(style => {
    const match = bySlug[style.slug]
    return {
      ...style,
      label: match?.name || style.fallbackLabel,
      description: match?.description || '',
      detail_url: match?.detail_url || null,
    }
  })
  loaded.value = true
  return fetchPromise
}

export function useConditions() {
  return { conditions, loaded, load: fetchOnce }
}
