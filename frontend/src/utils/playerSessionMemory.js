const STORAGE_KEY = 'cf_player_last_known_by_session'

function normalizeSessionCode(code) {
  return String(code || '').trim().toLowerCase()
}

function safeNumber(value, fallback) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getAllLastKnownPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getLastKnownPlayer(sessionCode) {
  const code = normalizeSessionCode(sessionCode)
  if (!code) return null
  const all = getAllLastKnownPlayers()
  return all[code] || null
}

export function saveLastKnownPlayer(sessionCode, player) {
  const code = normalizeSessionCode(sessionCode)
  const name = String(player?.name || '').trim()
  if (!code || !name) return

  const all = getAllLastKnownPlayers()
  all[code] = {
    name,
    ac: Math.max(1, safeNumber(player?.ac, 10)),
    hp: Math.max(1, safeNumber(player?.hp, 20)),
    maxHp: Math.max(1, safeNumber(player?.maxHp, player?.hp || 20)),
    dndClass: player?.dndClass || '',
    avatarUrl: player?.avatarUrl || null,
    updatedAt: new Date().toISOString(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage may be full or unavailable
  }
}

export function removeLastKnownPlayer(sessionCode) {
  const code = normalizeSessionCode(sessionCode)
  if (!code) return
  const all = getAllLastKnownPlayers()
  delete all[code]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {}
}
