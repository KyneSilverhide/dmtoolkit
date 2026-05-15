import { reactive } from 'vue'

const stored = localStorage.getItem('auth')
let initial = { token: null, admin: null }
try {
  if (stored) initial = JSON.parse(stored)
} catch {
  localStorage.removeItem('auth')
}

export const authStore = reactive({
  token: initial.token,
  admin: initial.admin,

  login(token, admin) {
    this.token = token
    this.admin = admin
    localStorage.setItem('auth', JSON.stringify({ token, admin }))
  },

  logout() {
    this.token = null
    this.admin = null
    localStorage.removeItem('auth')
  }
})
