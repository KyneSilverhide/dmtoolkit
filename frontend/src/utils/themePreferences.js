const STORAGE_KEY = 'cf_theme_preferences'
const VALID_THEMES = new Set(['dark', 'light'])
const THEME_META_COLORS = {
  dark: '#120d04',
  light: '#f5f1e8',
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
    metaThemeColor.setAttribute('content', THEME_META_COLORS[safeTheme])
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
