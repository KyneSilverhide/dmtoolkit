const STORAGE_KEY = 'cf_player_profiles'

/**
 * Returns all stored player profiles.
 * @returns {Record<string, { dndClass: string, avatarUrl: string|null, displayName: string }>}
 */
export function getAllProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Returns the stored profile for a given player name (case-insensitive key).
 * @param {string} name
 * @returns {{ dndClass: string, avatarUrl: string|null, displayName: string } | null}
 */
export function getProfile(name) {
  if (!name || !name.trim()) return null
  const profiles = getAllProfiles()
  return profiles[name.trim().toLowerCase()] || null
}

/**
 * Saves (or updates) a player profile.
 * @param {string} name
 * @param {{ dndClass: string, avatarUrl: string|null }} profile
 */
export function saveProfile(name, profile) {
  if (!name || !name.trim()) return
  const profiles = getAllProfiles()
  profiles[name.trim().toLowerCase()] = {
    dndClass: profile.dndClass || '',
    avatarUrl: profile.avatarUrl || null,
    displayName: name.trim(),
    hp: profile.hp ?? null,
    ac: profile.ac ?? null,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    // localStorage may be full or unavailable
  }
}

/**
 * Removes the stored profile for a given player name.
 * @param {string} name
 */
export function removeProfile(name) {
  if (!name || !name.trim()) return
  const profiles = getAllProfiles()
  delete profiles[name.trim().toLowerCase()]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {}
}
