import { reactive } from 'vue'

let initial = { token: null, admin: null }
try {
  const stored = localStorage.getItem('auth')
  const parsed = stored ? JSON.parse(stored) : null
  if (parsed && typeof parsed === 'object') initial = parsed
  else if (stored) localStorage.removeItem('auth')
} catch {
  // Stockage indisponible (données de site bloquées) ou JSON corrompu : session vide.
  try { localStorage.removeItem('auth') } catch { /* indisponible */ }
}

function persist(value) {
  try { localStorage.setItem('auth', JSON.stringify(value)) } catch { /* indisponible */ }
}

export const authStore = reactive({
  token: initial.token,
  admin: initial.admin,

  login(token, admin) {
    this.token = token
    this.admin = admin
    persist({ token, admin })
  },

  // Met à jour l'objet admin en place (ex: must_change_password passé à false après un
  // changement de mot de passe) sans toucher au token.
  updateAdmin(admin) {
    this.admin = { ...this.admin, ...admin }
    persist({ token: this.token, admin: this.admin })
  },

  logout() {
    this.token = null
    this.admin = null
    try { localStorage.removeItem('auth') } catch { /* indisponible */ }
  }
})
