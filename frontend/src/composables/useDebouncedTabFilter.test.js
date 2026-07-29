import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, createApp, h } from 'vue'
import { useDebouncedTabFilter } from './useDebouncedTabFilter.js'

// Fake useContentTabQuery(): mémorise les query params comme le ferait la vraie query
// string de l'URL, sans dépendre de vue-router (voir useContentTabQuery.js).
function makeFakeTabQuery() {
  const params = {}
  return {
    params,
    setParams: vi.fn((patch) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value) params[key] = value
        else delete params[key]
      }
    }),
    param: vi.fn((name) => params[name] || ''),
    onRouteParamsChange: vi.fn((cb) => cb()),
  }
}

describe('useDebouncedTabFilter', () => {
  let scope

  beforeEach(() => {
    vi.useFakeTimers()
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('ne réécrit pas la query string tant que le debounce (250ms) n’est pas écoulé', async () => {
    const tabQuery = makeFakeTabQuery()
    const { query } = scope.run(() => useDebouncedTabFilter(tabQuery))

    query.value = 'elfe'
    await nextTick()
    expect(tabQuery.setParams).not.toHaveBeenCalled()
    vi.advanceTimersByTime(249)
    expect(tabQuery.setParams).not.toHaveBeenCalled()
  })

  it('réécrit q dans la query string après 250ms de silence', async () => {
    const tabQuery = makeFakeTabQuery()
    const { query } = scope.run(() => useDebouncedTabFilter(tabQuery))

    query.value = 'elfe'
    await nextTick()
    vi.advanceTimersByTime(250)
    expect(tabQuery.setParams).toHaveBeenCalledWith({ q: 'elfe', slug: null })
  })

  it('redémarre le debounce à chaque frappe (pas d’écriture avant la dernière frappe + 250ms)', async () => {
    const tabQuery = makeFakeTabQuery()
    const { query } = scope.run(() => useDebouncedTabFilter(tabQuery))

    query.value = 'e'
    await nextTick()
    vi.advanceTimersByTime(200)
    query.value = 'el'
    await nextTick()
    vi.advanceTimersByTime(200)
    expect(tabQuery.setParams).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(tabQuery.setParams).toHaveBeenCalledTimes(1)
    expect(tabQuery.setParams).toHaveBeenCalledWith({ q: 'el', slug: null })
  })

  it('efface exactMatch dès que la query texte change (recherche libre prioritaire)', async () => {
    const tabQuery = makeFakeTabQuery()
    const { query, exactMatch } = scope.run(() => useDebouncedTabFilter(tabQuery))

    exactMatch.value = 'humain'
    query.value = 'nain'
    await nextTick()
    expect(exactMatch.value).toBeNull()
  })

  it('applyFromRoute() pré-remplit query+exactMatch depuis ?q=&slug= sans redéclencher setParams', () => {
    const tabQuery = makeFakeTabQuery()
    tabQuery.params.q = 'Humain'
    tabQuery.params.slug = 'humain'

    const { query, exactMatch } = scope.run(() => useDebouncedTabFilter(tabQuery))

    expect(query.value).toBe('Humain')
    expect(exactMatch.value).toBe('humain')
    // Le seul setParams autorisé ici est celui, implicite, qui a posé params au départ
    // (fait à la main dans ce test) -- le composable lui-même ne doit pas avoir réécrit
    // l'URL pendant son pré-remplissage.
    expect(tabQuery.setParams).not.toHaveBeenCalled()
  })

  it('ne réapplique pas applyFromRoute si les params n’ont pas changé (garde-fou lastAppliedKey)', async () => {
    const tabQuery = makeFakeTabQuery()
    tabQuery.params.q = 'Humain'
    tabQuery.params.slug = 'humain'
    let applyFromRoute
    tabQuery.onRouteParamsChange = vi.fn((cb) => { applyFromRoute = cb; cb() })

    const { query, exactMatch } = scope.run(() => useDebouncedTabFilter(tabQuery))
    expect(query.value).toBe('Humain')
    // Laisse le watch(query) déclenché par le pré-remplissage d'applyFromRoute() se
    // résoudre (il se contente de consommer suppressQueryWatch) avant de simuler une
    // frappe utilisateur distincte -- comme en usage réel, où ces deux événements sont
    // toujours séparés par au moins un tick (une frappe clavier n'arrive jamais dans le
    // même flush Vue que le pré-remplissage synchrone à l'activation du composant).
    await nextTick()

    // L'utilisateur tape par-dessus la correspondance exacte pré-remplie : le watch(query)
    // efface exactMatch (recherche libre reprend la main).
    query.value = 'Nain'
    await nextTick()
    expect(exactMatch.value).toBeNull()

    // Simule une 2e navigation SANS changement de q/slug dans l'URL (ex: re-clic du même
    // RefLink, ou <KeepAlive> qui réactive le composant) : applyFromRoute() est rejoué
    // (comportement de useContentTabQuery.onRouteParamsChange), mais le garde-fou
    // lastAppliedKey doit l'empêcher d'écraser ce que l'utilisateur vient de taper.
    applyFromRoute()
    expect(query.value).toBe('Nain')
    expect(exactMatch.value).toBeNull()
  })

  it('clearExactMatch() vide exactMatch et réécrit immédiatement la query string (pas de debounce)', async () => {
    const tabQuery = makeFakeTabQuery()
    const { query, exactMatch, clearExactMatch } = scope.run(() => useDebouncedTabFilter(tabQuery))

    exactMatch.value = 'humain'
    query.value = 'hum'
    await nextTick()
    // annule le watch(query) qui vient de se déclencher, pour isoler le test de clearExactMatch
    tabQuery.setParams.mockClear()

    clearExactMatch()
    expect(exactMatch.value).toBeNull()
    expect(tabQuery.setParams).toHaveBeenCalledWith({ q: 'hum', slug: null })
  })

  it('annule le timer de debounce en attente quand le composant est démonté (onUnmounted)', async () => {
    // onUnmounted() est un hook de cycle de vie de composant : il ne s'accroche PAS à
    // effectScope.stop() (contrairement à watch/computed). Il faut donc un vrai montage de
    // composant ici pour tester le nettoyage, comme useDebouncedTabFilter() l'est réellement
    // dans les 6 *Search.vue qui l'utilisent (appelé depuis leur propre <script setup>).
    const tabQuery = makeFakeTabQuery()
    let query
    const TestComponent = {
      setup() {
        ;({ query } = useDebouncedTabFilter(tabQuery))
        return () => h('div')
      },
    }
    const container = document.createElement('div')
    const app = createApp(TestComponent)
    app.mount(container)

    query.value = 'elfe'
    await nextTick() // laisse le watch(query) programmer son setTimeout avant de démonter
    app.unmount()
    vi.advanceTimersByTime(1000)
    expect(tabQuery.setParams).not.toHaveBeenCalled()
  })
})
