<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '../stores/auth.js'
import AppIcon from '../components/AppIcon.vue'
import ReleaseNotesBell from '../components/ReleaseNotesBell.vue'
import { releaseNotesStore } from '../stores/releaseNotes.js'
import { applyTheme, getLastUsedTheme, setThemePreference } from '../utils/themePreferences.js'

const router = useRouter()
import { BACKEND_URL } from '@/config.js'
const theme = ref(getLastUsedTheme('dark'))
const isLightTheme = computed(() => theme.value === 'light')

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  setThemePreference('admin', theme.value)
  setThemePreference('tv', theme.value)
  applyTheme(theme.value)
}

const showModal = ref(false)
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const demoEnabled = ref(false)
const demoUsername = ref('')
const demoPassword = ref('')

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  releaseNotesStore.load()
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`)
    if (res.ok) {
      const cfg = await res.json()
      demoEnabled.value = cfg.demoEnabled
      demoUsername.value = cfg.demoUsername || ''
      demoPassword.value = cfg.demoPassword || ''
    }
  } catch { /* silently ignore */ }
})

async function openModal() {
  showModal.value = true
  error.value = ''
  username.value = ''
  password.value = ''

  if (window.PasswordCredential && navigator.credentials) {
    try {
      const cred = await navigator.credentials.get({ password: true, mediation: 'optional' })
      if (cred) {
        username.value = cred.id
        password.value = cred.password
      }
    } catch { /* silently ignore */ }
  }
}

function closeModal() {
  if (loading.value) return
  showModal.value = false
}

function onBackdropClick(e) {
  if (e.target === e.currentTarget) closeModal()
}

function onKeydown(e) {
  if (e.key === 'Escape') closeModal()
}

onUnmounted(() => window.removeEventListener('keydown', onKeydown))

async function login() {
  if (!username.value || !password.value) {
    error.value = 'Veuillez remplir tous les champs.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Identifiants incorrects.'
      loading.value = false
      return
    }
    if (window.PasswordCredential && navigator.credentials) {
      try {
        const cred = new PasswordCredential({ id: username.value, password: password.value, name: username.value })
        await navigator.credentials.store(cred)
      } catch { /* silently ignore */ }
    }
    authStore.login(data.token, data.admin)
    window.location.href = '/admin'
    // loading reste true pendant le rechargement de la page
  } catch {
    error.value = 'Erreur de connexion au serveur.'
    loading.value = false
  }
}
</script>

<template>
  <div class="home-wrapper">
    <header class="home-header">
      <button class="theme-toggle-btn" @click="toggleTheme">
        <AppIcon :icon="isLightTheme ? 'lucide:moon' : 'lucide:sun'" size="0.9em" />
        {{ isLightTheme ? 'Sombre' : 'Clair' }}
      </button>
      <h1 class="app-title">DM <span class="title-accent">Toolkit</span></h1>
      <p class="app-subtitle">Votre compagnon pour vos sessions de JDR !</p>
    </header>

    <main class="home-main">
      <div class="home-buttons">
        <button class="home-btn mj-btn" @click="openModal" data-testid="dm-login-button">
          <span class="btn-icon"><AppIcon icon="game-icons:dice-six-faces-five" size="2rem" /></span>
          <div class="btn-text">
            <span class="btn-label">Je suis MJ</span>
            <span class="btn-sub">Accéder à l'administration</span>
          </div>
        </button>
        <button class="home-btn player-btn" @click="router.push('/join')" data-testid="player-login-button">
          <span class="btn-icon"><AppIcon icon="game-icons:crossed-swords" size="2rem" /></span>
          <div class="btn-text">
            <span class="btn-label">Je suis Joueur</span>
            <span class="btn-sub">Rejoindre une session</span>
          </div>
        </button>
      </div>
    </main>

    <footer class="home-footer">
      <ReleaseNotesBell variant="banner" role="admin" />
      <a href="/docs/" class="docs-link" target="_blank" rel="noopener">
        <AppIcon icon="lucide:book-open" size="0.85em" />
        Documentation
      </a>
    </footer>

    <!-- Login modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showModal" class="modal-backdrop" @click="onBackdropClick" data-testid="login-modal">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button class="modal-close" :disabled="loading" @click="closeModal" aria-label="Fermer">
              <AppIcon icon="lucide:x" size="1em" />
            </button>

            <div class="modal-header">
              <AppIcon icon="game-icons:dice-six-faces-five" size="1.6rem" class="modal-icon" />
              <h2 id="modal-title" class="modal-title">Connexion <span class="title-accent">MJ</span></h2>
              <p class="modal-subtitle">Maître du Jeu</p>
            </div>

            <form class="modal-form" @submit.prevent="login">
              <!-- Demo hint -->
              <div v-if="demoEnabled" class="demo-hint">
                <AppIcon icon="lucide:info" size="0.85em" class="demo-hint-icon" />
                <span>
                  Compte démo disponible —
                  <strong>{{ demoUsername }}</strong> / <strong>{{ demoPassword }}</strong>
                </span>
              </div>
              <div class="form-group">
                <label class="form-label" for="login-username">Nom d'utilisateur</label>
                <input
                  id="login-username"
                  v-model="username"
                  type="text"
                  class="form-input"
                  placeholder="admin"
                  autocomplete="username"
                  autofocus
                  data-testid="username-input"
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="login-password">Mot de passe</label>
                <input
                  id="login-password"
                  v-model="password"
                  type="password"
                  class="form-input"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  data-testid="password-input"
                />
              </div>

              <Transition name="error-fade">
                <p v-if="error" class="form-error">
                  <AppIcon icon="lucide:alert-circle" size="0.9em" /> {{ error }}
                </p>
              </Transition>

              <button type="submit" class="submit-btn" :disabled="loading" data-testid="login-submit">
                <AppIcon v-if="!loading" icon="lucide:log-in" size="0.9em" />
                <span>{{ loading ? 'Connexion…' : 'Se connecter' }}</span>
              </button>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.home-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.home-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  max-width: 340px;
  width: 100%;
  margin: 0 auto;
}

.docs-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  text-decoration: none;
  transition: color 0.2s;
}
.docs-link:hover { color: var(--color-gold); }

.home-header {
  text-align: center;
  padding: 3rem 1.5rem 2rem;
  position: relative;
}

.app-title {
  font-family: var(--font-title);
  font-size: 2.8rem;
  line-height: 1.15;
  color: var(--color-parchment);
  text-shadow: var(--text-shadow-emphasis);
  margin: 0.5rem 0 0.3rem;
}

.title-accent {
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
}

.app-subtitle {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.25em;
  color: var(--color-text-dim);
  text-transform: uppercase;
  margin: 0.5rem 0 0;
}

.home-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.home-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 340px;
}

.home-btn {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: left;
  border: 1px solid var(--color-border);
  background: linear-gradient(160deg, var(--color-surface-soft), var(--color-surface));
  color: var(--color-parchment);
  font-family: var(--font-heading);
}

.btn-text { display: flex; flex-direction: column; }

.mj-btn {
  border-color: var(--color-gold-dark);
  background: var(--gradient-accent-action);
}
.mj-btn:hover {
  border-color: var(--color-gold);
  box-shadow: var(--shadow-soft);
  transform: translateY(-2px);
}

.player-btn {
  border-color: var(--color-success-border);
  background: var(--gradient-success-action);
}
.player-btn:hover {
  border-color: var(--color-success);
  box-shadow: var(--shadow-soft);
  transform: translateY(-2px);
}

.btn-icon { font-size: 2rem; flex-shrink: 0; }
.btn-label { font-size: 1.1rem; font-weight: 600; }
.btn-sub {
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin-top: 0.2rem;
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1.5rem;
}

.modal-card {
  position: relative;
  background: var(--gradient-panel);
  border: 1px solid var(--color-gold-dark);
  border-radius: 18px;
  padding: 2rem;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(201, 162, 39, 0.1);
}

.modal-close {
  position: absolute;
  top: 0.85rem;
  right: 0.85rem;
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 6px;
  line-height: 1;
  transition: color 0.15s;
}
.modal-close:hover { color: var(--color-parchment); }
.modal-close:disabled { opacity: 0.4; cursor: not-allowed; }

.modal-header {
  text-align: center;
  margin-bottom: 1.75rem;
}
.modal-icon {
  color: var(--color-gold-dark);
  margin-bottom: 0.5rem;
}
.modal-title {
  font-family: var(--font-title);
  font-size: 1.7rem;
  color: var(--color-parchment);
  margin: 0 0 0.2rem;
}
.modal-subtitle {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.form-group { display: flex; flex-direction: column; gap: 0.4rem; }

.form-label {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.form-input {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-text-dim); font-style: italic; }

.form-error {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--color-danger);
  font-family: var(--font-body);
  font-size: 0.85rem;
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  margin: 0;
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.85rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.25rem;
}
.submit-btn:hover:not(:disabled) {
  background: var(--gradient-accent-action-hover);
  box-shadow: var(--shadow-soft);
}
.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Demo hint ──────────────────────────────────────────────────────────── */
.demo-hint {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: rgba(201, 162, 39, 0.08);
  border: 1px solid rgba(201, 162, 39, 0.25);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--color-text-dim);
  line-height: 1.4;
}
.demo-hint-icon {
  color: var(--color-gold-dark);
  flex-shrink: 0;
}
.demo-hint strong {
  color: var(--color-gold-bright);
  font-weight: 600;
}

/* ── Transitions ────────────────────────────────────────────────────────── */
.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.modal-enter-active .modal-card {
  animation: modalSlideIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-leave-active .modal-card {
  animation: modalSlideOut 0.15s ease forwards;
}
@keyframes modalSlideIn {
  from { transform: translateY(18px) scale(0.97); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes modalSlideOut {
  to { transform: translateY(10px) scale(0.97); opacity: 0; }
}

.error-fade-enter-active, .error-fade-leave-active { transition: all 0.2s ease; }
.error-fade-enter-from, .error-fade-leave-to { opacity: 0; transform: translateY(-4px); }

.theme-toggle-btn {
  position: absolute;
  top: 1.25rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.theme-toggle-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
</style>
