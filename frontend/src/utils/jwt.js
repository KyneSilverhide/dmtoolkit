// Décodage JWT côté client (payload uniquement, pas de vérification de signature —
// le backend reste seul juge de la validité réelle du token). Sert uniquement à une
// vérification proactive d'expiration avant navigation (voir router/index.js).
export function isTokenExpired(token) {
  if (!token) return true
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return !decoded.exp || decoded.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}
