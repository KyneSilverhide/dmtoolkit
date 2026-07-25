import { watch, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Synchronise l'état de recherche d'un onglet "Contenu" (Sorts/Objets/Races/Classes/
// Origines/Aptitudes) avec la query string de /admin/:tab, uniquement quand cet onglet
// est actif dans l'URL. Ces composants restent montés en permanence via <KeepAlive>
// dans AdminView — sans ce garde-fou, leurs watchers réagiraient aussi aux navigations
// déclenchées par les AUTRES onglets.
export function useContentTabQuery(tabKey) {
  const route = useRoute()
  const router = useRouter()

  function isActive() {
    return (route.params.tab || 'players') === tabKey
  }

  function param(name) {
    return isActive() ? (route.query[name] || '') : ''
  }

  function setParams(patch) {
    if (!isActive()) return
    const query = { ...route.query }
    for (const [key, value] of Object.entries(patch)) {
      if (value) query[key] = value
      else delete query[key]
    }
    router.replace({ query })
  }

  // Appelle `callback` immédiatement puis à chaque changement de route. Couvre à la
  // fois un changement d'onglet (KeepAlive réactive ce composant via onActivated) et
  // une navigation vers CE MÊME onglet avec des query params différents (ex : deux
  // résultats de CommandPalette cliqués sans changer d'onglet — onActivated seul ne se
  // redéclencherait pas dans ce cas).
  function onRouteParamsChange(callback) {
    callback()
    watch(() => route.fullPath, callback)
    onActivated(callback)
  }

  return { isActive, param, setParams, onRouteParamsChange }
}
