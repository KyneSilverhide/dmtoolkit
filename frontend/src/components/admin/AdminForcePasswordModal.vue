<script setup>
import { ref } from 'vue'
import { apiFetch } from '../../utils/apiFetch.js'
import { authStore } from '../../stores/auth.js'
import AppIcon from '../AppIcon.vue'

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    error.value = 'Veuillez remplir tous les champs.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Les deux mots de passe ne correspondent pas.'
    return
  }
  if (newPassword.value === currentPassword.value) {
    error.value = 'Le nouveau mot de passe doit être différent de l\'actuel.'
    return
  }
  loading.value = true
  try {
    const res = await apiFetch('/api/auth/me/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Erreur lors du changement de mot de passe.'
      loading.value = false
      return
    }
    authStore.updateAdmin(data)
    // pas de loading = false : le modal se démonte, must_change_password est passé à false
  } catch {
    error.value = 'Erreur de connexion au serveur.'
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fp-backdrop" data-testid="force-password-modal">
      <div class="fp-card" role="dialog" aria-modal="true" aria-labelledby="fp-title">
        <div class="fp-header">
          <AppIcon icon="lucide:key-round" size="1.6rem" class="fp-icon" />
          <h2 id="fp-title" class="fp-title">Nouveau mot de passe requis</h2>
          <p class="fp-subtitle">Votre compte vient d'être créé — choisissez votre propre mot de passe avant de continuer.</p>
        </div>

        <form class="fp-form" @submit.prevent="submit">
          <div class="form-group">
            <label class="form-label" for="fp-current">Mot de passe actuel</label>
            <input
              id="fp-current"
              v-model="currentPassword"
              type="password"
              class="form-input"
              autocomplete="current-password"
              autofocus
              data-testid="force-password-current"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="fp-new">Nouveau mot de passe</label>
            <input
              id="fp-new"
              v-model="newPassword"
              type="password"
              class="form-input"
              autocomplete="new-password"
              data-testid="force-password-new"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="fp-confirm">Confirmer le nouveau mot de passe</label>
            <input
              id="fp-confirm"
              v-model="confirmPassword"
              type="password"
              class="form-input"
              autocomplete="new-password"
              data-testid="force-password-confirm"
            />
          </div>

          <Transition name="fp-error-fade">
            <p v-if="error" class="fp-error">
              <AppIcon icon="lucide:alert-circle" size="0.9em" /> {{ error }}
            </p>
          </Transition>

          <button type="submit" class="fp-submit-btn" :disabled="loading" data-testid="force-password-submit">
            <AppIcon v-if="!loading" icon="lucide:check" size="0.9em" />
            <span>{{ loading ? 'Enregistrement…' : 'Valider le nouveau mot de passe' }}</span>
          </button>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fp-backdrop {
  position: fixed;
  inset: 0;
  background: var(--overlay-scrim);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--space-6);
}

.fp-card {
  position: relative;
  background: var(--gradient-panel);
  border: 1px solid var(--color-gold-dark);
  border-radius: 18px;
  padding: var(--space-8);
  width: 100%;
  max-width: 400px;
  box-shadow: 0 24px 60px var(--overlay-scrim), 0 0 0 1px var(--surface-gold-soft);
}

.fp-header {
  text-align: center;
  margin-bottom: var(--space-6);
}
.fp-icon {
  color: var(--color-gold-dark);
  margin-bottom: var(--space-2);
}
.fp-title {
  font-family: var(--font-title), sans-serif;
  font-size: 1.5rem;
  color: var(--color-parchment);
  margin: 0 0 var(--space-2);
}
.fp-subtitle {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  margin: 0;
  line-height: 1.4;
}

.fp-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-group { display: flex; flex-direction: column; gap: var(--space-2); }

.form-label {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.form-input {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--space-3) var(--space-4);
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-md);
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }

.fp-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-danger);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-base);
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
  margin: 0;
}

.fp-submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-base);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.25rem;
}
.fp-submit-btn:hover:not(:disabled) {
  background: var(--gradient-accent-action-hover);
  box-shadow: var(--shadow-soft);
}
.fp-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* noinspection CssUnusedSymbol */
.fp-error-fade-enter-active, .fp-error-fade-leave-active { transition: all 0.2s ease; }
/* noinspection CssUnusedSymbol */
.fp-error-fade-enter-from, .fp-error-fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
