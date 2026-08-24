<script setup>
import { ref, onMounted } from 'vue'
import { apiFetch } from '../../utils/apiFetch.js'
import { authStore } from '../../stores/auth.js'
import AppIcon from '../AppIcon.vue'

const admins = ref([])
const loadingList = ref(false)
const listError = ref('')

const username = ref('')
const password = ref('')
const creating = ref(false)
const createError = ref('')
const createErrorField = ref('')
const createSuccess = ref('')

async function loadAdmins() {
  loadingList.value = true
  listError.value = ''
  try {
    const res = await apiFetch('/api/auth/admins')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      listError.value = data.error || 'Impossible de charger les comptes admin.'
      return
    }
    admins.value = await res.json()
  } catch {
    listError.value = 'Erreur de connexion au serveur.'
  } finally {
    loadingList.value = false
  }
}

async function createAdmin() {
  createError.value = ''
  createErrorField.value = ''
  createSuccess.value = ''
  if (!username.value.trim() || !password.value) {
    createError.value = 'Nom d\'utilisateur et mot de passe requis.'
    return
  }
  creating.value = true
  try {
    const res = await apiFetch('/api/auth/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value.trim(), password: password.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      createError.value = data.error || 'Erreur lors de la création du compte.'
      createErrorField.value = data.field || ''
      return
    }
    admins.value = [...admins.value, data]
    createSuccess.value = `Compte « ${data.username} » créé. Communiquez-lui son mot de passe — il devra le changer à sa première connexion.`
    username.value = ''
    password.value = ''
  } catch {
    createError.value = 'Erreur de connexion au serveur.'
  } finally {
    creating.value = false
  }
}

onMounted(loadAdmins)
</script>

<template>
  <div class="accounts-manager">
    <template v-if="authStore.admin?.is_owner">
      <div class="section">
        <p class="section-label"><AppIcon icon="lucide:user-plus" size="0.85rem" color="var(--color-gold-bright)" /> Créer un compte admin</p>
        <form class="create-form" @submit.prevent="createAdmin">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="admin-username">Nom d'utilisateur</label>
              <input
                id="admin-username"
                v-model="username"
                type="text"
                class="form-input"
                :class="{ 'field-error': createErrorField === 'username' }"
                autocomplete="off"
                data-testid="new-admin-username"
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="admin-password">Mot de passe initial</label>
              <input
                id="admin-password"
                v-model="password"
                type="text"
                class="form-input"
                :class="{ 'field-error': createErrorField === 'password' }"
                autocomplete="off"
                data-testid="new-admin-password"
              />
            </div>
          </div>
          <p class="create-hint">
            <AppIcon icon="lucide:info" size="0.8em" /> Ce mot de passe est temporaire : le nouvel admin devra en choisir un autre dès sa première connexion.
          </p>
          <p v-if="createError" class="create-error" data-testid="new-admin-error">
            <AppIcon icon="lucide:alert-circle" size="0.9em" /> {{ createError }}
          </p>
          <p v-if="createSuccess" class="create-success" data-testid="new-admin-success">
            <AppIcon icon="lucide:check-circle" size="0.9em" /> {{ createSuccess }}
          </p>
          <button type="submit" class="create-btn" :disabled="creating" data-testid="new-admin-submit">
            <AppIcon icon="lucide:user-plus" size="0.9em" />
            <span>{{ creating ? 'Création…' : 'Créer le compte' }}</span>
          </button>
        </form>
      </div>

      <div class="section">
        <p class="section-label"><AppIcon icon="lucide:users" size="0.85rem" color="var(--color-gold-bright)" /> Comptes admin</p>
        <p v-if="loadingList" class="hint-text">Chargement…</p>
        <p v-else-if="listError" class="create-error">{{ listError }}</p>
        <ul v-else class="admin-list">
          <li v-for="a in admins" :key="a.id" class="admin-row" :data-testid="`admin-row-${a.id}`">
            <span class="admin-username">{{ a.username }}</span>
            <span class="admin-badges">
              <span v-if="a.is_owner" class="badge badge-owner">Propriétaire</span>
              <span v-if="a.is_demo" class="badge badge-demo">Démo</span>
              <span v-if="a.must_change_password" class="badge badge-pending">Doit changer son mot de passe</span>
            </span>
          </li>
        </ul>
      </div>
    </template>

    <p v-else class="hint-text">
      <AppIcon icon="lucide:lock" size="0.85em" /> Réservé à l'administrateur principal.
    </p>
  </div>
</template>

<style scoped>
.accounts-manager {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section-label {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.form-row {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-width: 200px;
}

.form-label {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.form-input {
  background: var(--admin-control-bg, var(--surface-raised));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-base);
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--color-gold-dark); }
.form-input.field-error { border-color: var(--color-danger-border); }

.create-hint {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  margin: 0;
}

.create-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-danger);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
  margin: 0;
}

.create-success {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-success);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-3);
  margin: 0;
}

.create-btn {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-text-on-accent);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}
.create-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.create-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.admin-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--admin-control-bg, var(--surface-raised));
  flex-wrap: wrap;
}

.admin-username {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-parchment);
}

.admin-badges {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.badge {
  border-radius: 20px;
  padding: 0.15rem var(--space-2);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid var(--color-border);
  color: var(--color-text-dim);
}
.badge-owner { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.badge-demo { border-color: var(--color-border); color: var(--color-text-dim); }
.badge-pending { border-color: var(--color-warning); color: var(--color-warning); }

.hint-text {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text-dim);
  font-size: var(--text-base);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) 0;
}
</style>
