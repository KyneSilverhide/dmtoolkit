import { sessionStore } from '../stores/session.js'

// Construit une cible de route pour l'onglet admin `tab`, en conservant le code de
// session dans l'URL (route nommée `admin-session`) si une session est active — sinon
// retombe sur la route `admin` sans code (onglets "Contenu", consultables hors session).
// Centralisé ici car AdminView et CommandPalette naviguent tous les deux vers les onglets.
export function adminTabRoute(tab, query) {
  const code = sessionStore.activeSession?.code
  if (code) return { name: 'admin-session', params: { code, tab }, query }
  return { name: 'admin', params: { tab }, query }
}
