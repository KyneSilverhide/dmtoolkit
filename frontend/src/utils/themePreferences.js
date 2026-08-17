const STORAGE_KEY = 'cf_theme_preferences'
// Le thème 'light' (crème parcheminé chaud) a été supprimé lors de la refonte UI : il
// faisait doublon avec 'sceau' et 'nacre', déjà clairs. Voir docs/refonte-ui.md §3.1.1.
const VALID_THEMES = new Set(['dark', 'sceau', 'arcane', 'nacre'])
// Préférences stockées pointant sur un thème retiré : on les remappe explicitement plutôt
// que de laisser normalizeTheme() retomber sur le fallback 'dark' — un utilisateur sur un
// thème clair se retrouverait brutalement en quasi-noir.
const RETIRED_THEMES = { light: 'sceau' }
// Secours si --color-bg n'est pas résolvable (ex. tests sans style.css chargé) —
// la source de vérité reste --color-bg dans style.css ; garder synchronisé si modifié.
const THEME_META_COLORS_FALLBACK = {
  dark: '#181411',
  sceau: '#ffffff',
  arcane: '#0f0f12',
  nacre: '#f4f3f7',
}

// Ordre d'affichage dans le sélecteur de thème (components/ThemePicker.vue). Depuis la
// refonte, le choix est explicite — un clic, une entrée — au lieu d'un bouton de cycle qui
// demandait jusqu'à 4 clics à l'aveugle pour atteindre un thème donné.
export const THEME_ORDER = ['dark', 'sceau', 'arcane', 'nacre']

const THEME_META = {
  dark: { label: 'Braise', icon: 'lucide:flame' },
  sceau: { label: 'Sceau', icon: 'lucide:store' },
  arcane: { label: 'Arcane', icon: 'lucide:gem' },
  nacre: { label: 'Nacre', icon: 'lucide:shell' },
}

// ── Densité ────────────────────────────────────────────────────────────────────
// Pilotée par `data-density` sur <html>, en parallèle de `data-theme`. Ne modifie que
// l'espacement, deux paliers de typo et la cible tactile (voir styles/tokens.derive.css) :
// jamais la palette ni la mise en page. Stockée dans la MÊME clé scopée que le thème.
const VALID_DENSITIES = new Set(['compact', 'confortable'])
export const DENSITY_ORDER = ['compact', 'confortable']
const DENSITY_META = {
  compact: { label: 'Compact', icon: 'lucide:rows-3' },
  confortable: { label: 'Confortable', icon: 'lucide:rows-2' },
}
const DENSITY_PREFIX = 'density:'

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage may be full or unavailable
  }
}

function normalizeScope(scope) {
  return String(scope || '').trim().toLowerCase()
}

function normalizeTheme(theme, fallback = 'dark') {
  if (VALID_THEMES.has(theme)) return theme
  if (RETIRED_THEMES[theme]) return RETIRED_THEMES[theme]
  return VALID_THEMES.has(fallback) ? fallback : 'dark'
}

export function getThemePreference(scope, fallback = 'dark') {
  const safeScope = normalizeScope(scope)
  const safeFallback = normalizeTheme(fallback)
  if (!safeScope) return safeFallback
  const all = readAll()
  const value = all[safeScope]
  return normalizeTheme(value, safeFallback)
}

export function applyTheme(theme, fallback = 'dark') {
  const safeTheme = normalizeTheme(theme, normalizeTheme(fallback))
  if (typeof document === 'undefined') return safeTheme

  const root = document.documentElement
  root.setAttribute('data-theme', safeTheme)
  root.style.colorScheme = safeTheme === 'dark' || safeTheme === 'arcane' ? 'dark' : 'light'

  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    const resolved = getComputedStyle(root).getPropertyValue('--color-bg').trim()
    metaThemeColor.setAttribute('content', resolved || THEME_META_COLORS_FALLBACK[safeTheme])
  }

  return safeTheme
}

export function applyStoredTheme(scope, fallback = 'dark') {
  return applyTheme(getThemePreference(scope, fallback), fallback)
}

export function setThemePreference(scope, theme) {
  const safeScope = normalizeScope(scope)
  if (!safeScope || !VALID_THEMES.has(theme)) return
  const all = readAll()
  all[safeScope] = theme
  all['_last'] = theme
  writeAll(all)
}

export function getLastUsedTheme(fallback = 'dark') {
  const all = readAll()
  return normalizeTheme(all['_last'], normalizeTheme(fallback))
}

// Conservé pour le cyclage au clavier et les bascules compactes ; le sélecteur explicite
// (ThemePicker) appelle setThemePreference() directement avec le thème choisi.
export function getNextTheme(theme) {
  const idx = THEME_ORDER.indexOf(normalizeTheme(theme))
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length]
}

export function getThemeMeta(theme) {
  return THEME_META[normalizeTheme(theme)]
}

// ── API densité (même schéma scopé que le thème) ───────────────────────────────

function normalizeDensity(density, fallback = 'compact') {
  if (VALID_DENSITIES.has(density)) return density
  return VALID_DENSITIES.has(fallback) ? fallback : 'compact'
}

export function getDensityPreference(scope, fallback = 'compact') {
  const safeScope = normalizeScope(scope)
  const safeFallback = normalizeDensity(fallback)
  if (!safeScope) return safeFallback
  return normalizeDensity(readAll()[DENSITY_PREFIX + safeScope], safeFallback)
}

export function setDensityPreference(scope, density) {
  const safeScope = normalizeScope(scope)
  if (!safeScope || !VALID_DENSITIES.has(density)) return
  const all = readAll()
  all[DENSITY_PREFIX + safeScope] = density
  writeAll(all)
}

export function applyDensity(density, fallback = 'compact') {
  const safeDensity = normalizeDensity(density, fallback)
  if (typeof document === 'undefined') return safeDensity
  document.documentElement.setAttribute('data-density', safeDensity)
  return safeDensity
}

export function applyStoredDensity(scope, fallback = 'compact') {
  return applyDensity(getDensityPreference(scope, fallback), fallback)
}

export function getDensityMeta(density) {
  return DENSITY_META[normalizeDensity(density)]
}
