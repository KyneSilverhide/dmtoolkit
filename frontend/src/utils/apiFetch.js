import { BACKEND_URL } from '@/config.js'
import { authStore } from '@/stores/auth.js'
import { resetSocket } from '@/socket.js'
import router from '@/router/index.js'

// Wrapper fetch pour les appels admin authentifiés. Injecte automatiquement
// Authorization: Bearer <token> si l'appelant ne l'a pas déjà mis dans options.headers
// (les headers explicites restent prioritaires). Sur un 401 (token absent/invalide/
// expiré — voir middleware/auth.js), déconnecte et redirige vers le login avec un
// message. Retourne la Response normale sinon : res.ok/res.json() inchangés côté
// appelant.
export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (authStore.token && !headers.Authorization) headers.Authorization = `Bearer ${authStore.token}`
  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers })
  if (res.status === 401 && authStore.token) {
    authStore.logout()
    resetSocket()
    router.push({ path: '/', query: { expired: '1' } })
  }
  return res
}
