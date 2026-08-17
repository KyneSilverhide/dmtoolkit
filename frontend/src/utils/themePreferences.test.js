import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getThemePreference, setThemePreference, applyTheme, getLastUsedTheme, getNextTheme, getThemeMeta,
  getDensityPreference, setDensityPreference, applyDensity, applyStoredDensity, getDensityMeta,
} from './themePreferences.js'

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value) }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-density')
  document.documentElement.style.colorScheme = ''
  document.head.innerHTML = ''
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  document.head.appendChild(meta)
})

describe('themePreferences', () => {
  it('returns fallback for missing scope', () => {
    expect(getThemePreference('player')).toBe('dark')
    expect(getThemePreference('player', 'nacre')).toBe('nacre')
  })

  it('stores and retrieves a valid theme per scope', () => {
    setThemePreference('player', 'nacre')
    setThemePreference('admin', 'dark')
    expect(getThemePreference('player')).toBe('nacre')
    expect(getThemePreference('admin')).toBe('dark')
  })

  it('ignores invalid themes', () => {
    setThemePreference('tv', 'blue')
    expect(getThemePreference('tv')).toBe('dark')
  })

  it('applies theme on document and updates theme-color meta', () => {
    applyTheme('sceau')
    expect(document.documentElement.getAttribute('data-theme')).toBe('sceau')
    expect(document.documentElement.style.colorScheme).toBe('light')
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#ffffff')
  })

  it('maps colorScheme to dark for dark-background themes', () => {
    applyTheme('arcane')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    applyTheme('nacre')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  // Le thème 'light' a été supprimé lors de la refonte UI (docs/refonte-ui.md §3.1.1).
  // Une préférence stockée doit être remappée vers 'sceau' — un autre thème CLAIR — et
  // surtout pas retomber sur le fallback 'dark', qui ferait passer l'utilisateur d'un
  // crème chaud à un quasi-noir.
  describe('thème "light" retiré', () => {
    it('remaps a stored light preference to sceau', () => {
      localStorage.setItem('cf_theme_preferences', JSON.stringify({ player: 'light', _last: 'light' }))
      expect(getThemePreference('player')).toBe('sceau')
      expect(getLastUsedTheme()).toBe('sceau')
    })

    it('remaps light even when an explicit fallback is given', () => {
      localStorage.setItem('cf_theme_preferences', JSON.stringify({ admin: 'light' }))
      expect(getThemePreference('admin', 'arcane')).toBe('sceau')
    })

    it('refuses to store light as a new preference', () => {
      setThemePreference('player', 'light')
      expect(getThemePreference('player')).toBe('dark')
    })

    it('applies sceau when asked to apply light', () => {
      applyTheme('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('sceau')
    })
  })

  describe('getLastUsedTheme', () => {
    it('returns fallback when no theme has been set', () => {
      expect(getLastUsedTheme()).toBe('dark')
      expect(getLastUsedTheme('nacre')).toBe('nacre')
    })

    it('returns the most recently set theme across scopes', () => {
      setThemePreference('admin', 'sceau')
      expect(getLastUsedTheme()).toBe('sceau')
      setThemePreference('player', 'dark')
      expect(getLastUsedTheme()).toBe('dark')
    })

    it('reflects last setThemePreference call regardless of scope', () => {
      setThemePreference('admin', 'dark')
      setThemePreference('player', 'arcane')
      setThemePreference('admin', 'dark')
      expect(getLastUsedTheme()).toBe('dark')
    })
  })

  describe('getNextTheme', () => {
    it('cycles dark -> sceau -> arcane -> nacre -> dark', () => {
      expect(getNextTheme('dark')).toBe('sceau')
      expect(getNextTheme('sceau')).toBe('arcane')
      expect(getNextTheme('arcane')).toBe('nacre')
      expect(getNextTheme('nacre')).toBe('dark')
    })

    it('normalizes an invalid theme to dark before advancing', () => {
      expect(getNextTheme('blue')).toBe('sceau')
    })

    it('advances from the remapped value for a retired theme', () => {
      expect(getNextTheme('light')).toBe('arcane') // light -> sceau -> arcane
    })
  })

  describe('getThemeMeta', () => {
    it('returns a label and icon for every valid theme', () => {
      for (const t of ['dark', 'sceau', 'arcane', 'nacre']) {
        const meta = getThemeMeta(t)
        expect(meta.label).toBeTruthy()
        expect(meta.icon).toBeTruthy()
      }
    })
  })
})

describe('densité', () => {
  it('defaults to compact', () => {
    expect(getDensityPreference('admin')).toBe('compact')
  })

  it('stores and retrieves per scope, independently of the theme', () => {
    setDensityPreference('admin', 'confortable')
    setThemePreference('admin', 'nacre')
    expect(getDensityPreference('admin')).toBe('confortable')
    expect(getDensityPreference('player')).toBe('compact')
    // Densité et thème cohabitent dans la MÊME clé de stockage sans se marcher dessus.
    expect(getThemePreference('admin')).toBe('nacre')
  })

  it('ignores invalid densities', () => {
    setDensityPreference('admin', 'enorme')
    expect(getDensityPreference('admin')).toBe('compact')
  })

  it('applies density on the document root', () => {
    applyDensity('confortable')
    expect(document.documentElement.getAttribute('data-density')).toBe('confortable')
  })

  it('applies the stored density for a scope', () => {
    setDensityPreference('player', 'confortable')
    applyStoredDensity('player')
    expect(document.documentElement.getAttribute('data-density')).toBe('confortable')
  })

  it('returns a label and icon for every density', () => {
    for (const d of ['compact', 'confortable']) {
      const meta = getDensityMeta(d)
      expect(meta.label).toBeTruthy()
      expect(meta.icon).toBeTruthy()
    }
  })
})
