const STORAGE_KEY = 'cf_theme_preferences'
const VALID_THEMES = new Set(['dark', 'light', 'sceau'])
// Secours si --color-bg n'est pas résolvable (ex. tests sans style.css chargé) —
// la source de vérité reste --color-bg dans style.css ; garder synchronisé si modifié.
const THEME_META_COLORS_FALLBACK = {
  dark: '#181411',
  light: '#f5f1e8',
  sceau: '#ffffff',
}

// Ordre de cycle du bouton de bascule (voir toggleTheme() dans AdminView/HomeView/
// PlayerJoinView/PlayerInboxView, et AdminHeader.vue) — un clic avance d'une position.
export const THEME_ORDER = ['dark', 'light', 'sceau']

const THEME_META = {
  dark: { label: 'Sombre', icon: 'lucide:moon' },
  light: { label: 'Clair', icon: 'lucide:sun' },
  sceau: { label: 'Sceau', icon: 'lucide:store' },
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function normalizeScope(scope) {
  return String(scope || '').trim().toLowerCase()
}

function normalizeTheme(theme, fallback = 'dark') {
  return VALID_THEMES.has(theme) ? theme : fallback
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
  root.style.colorScheme = safeTheme

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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage may be full or unavailable
  }
}

export function getLastUsedTheme(fallback = 'dark') {
  const all = readAll()
  return normalizeTheme(all['_last'], normalizeTheme(fallback))
}

export function getNextTheme(theme) {
  const idx = THEME_ORDER.indexOf(normalizeTheme(theme))
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length]
}

export function getThemeMeta(theme) {
  return THEME_META[normalizeTheme(theme)]
}
