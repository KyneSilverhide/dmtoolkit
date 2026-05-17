<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { authStore } from '../stores/auth.js'
import AppIcon from '../components/AppIcon.vue'
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const showModal = ref(false)
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

function openModal() {
  showModal.value = true
  error.value = ''
  username.value = ''
  password.value = ''
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

onMounted(() => window.addEventListener('keydown', onKeydown))
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
  padding-bottom: 2rem;
}

.home-header {
  text-align: center;
  padding: 3rem 1.5rem 2rem;
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
.form-input::placeholder { color: var(--color-border); }

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
</style>
