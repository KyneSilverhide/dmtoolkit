<script setup>
import { ref, onMounted, watch } from 'vue'
import { authStore } from '../../stores/auth.js'
import { sessionStore } from '../../stores/session.js'
import AppIcon from '../AppIcon.vue'

import { BACKEND_URL } from '@/config.js'

const sessionName = ref('')
const loading = ref(false)
const error = ref('')
const qrCodeUrl = ref(null)
const joinUrl = ref('')
const tvUrl = ref('')
const tvCopied = ref(false)

const renamingId = ref(null)
const renameValue = ref('')
const renameLoading = ref(false)

function startRename(session) {
  renamingId.value = session.id
  renameValue.value = session.name
}

function cancelRename() {
  renamingId.value = null
  renameValue.value = ''
}

async function saveRename(id) {
  if (!renameValue.value.trim()) return
  renameLoading.value = true
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${id}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({ name: renameValue.value.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { error.value = data.error || 'Erreur lors du renommage.'; return }
    if (sessionStore.activeSession?.id === id) sessionStore.setActiveSession(data)
    await loadSessions()
    cancelRename()
  } catch {
    error.value = 'Erreur réseau lors du renommage.'
  } finally {
    renameLoading.value = false
  }
}

async function loadSessionQrCode(sessionId) {
  const cached = sessionStore.getQrCode(sessionId)
  if (cached) {
    qrCodeUrl.value = cached
    return
  }

  const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/qrcode`, {
    headers: { Authorization: `Bearer ${authStore.token}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Erreur lors du chargement du QR code.')
  }

  qrCodeUrl.value = data.qrCodeDataUrl
  sessionStore.setQrCode(sessionId, data.qrCodeDataUrl)
}

async function createSession() {
  if (!sessionName.value.trim()) {
    error.value = 'Veuillez saisir un nom de session.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ name: sessionName.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Erreur lors de la création.'
      return
    }
    sessionStore.setActiveSession(data.session)
    qrCodeUrl.value = data.qrCodeDataUrl
    sessionStore.setQrCode(data.session.id, data.qrCodeDataUrl)
    joinUrl.value = `${window.location.origin}/join/${data.session.code}`
    tvUrl.value = `${window.location.origin}/tv/${data.session.code}`
    sessionName.value = ''
    await loadSessions()
  } catch {
    error.value = 'Erreur de connexion au serveur.'
  } finally {
    loading.value = false
  }
}

async function deleteSession(id) {
  const selected = sessionStore.sessions.find(s => s.id === id)
  const label = selected?.name || `#${id}`
  const confirmed = window.confirm(`Supprimer définitivement la session "${label}" ?\n\nCette action est irréversible.`)
  if (!confirmed) return

  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      error.value = data.error || 'Erreur lors de la suppression.'
      return
    }

    if (sessionStore.activeSession?.id === id) {
      sessionStore.setActiveSession(null)
      qrCodeUrl.value = null
      joinUrl.value = ''
      tvUrl.value = ''
    }
    await loadSessions()
  } catch {
    error.value = 'Erreur réseau lors de la suppression.'
  }
}

async function loadSessions() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json()
    if (res.ok) sessionStore.setSessions(data)
  } catch {}
}

async function reopenSession(id) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${id}/reopen`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      error.value = data.error || 'Erreur lors de la réouverture.'
      return
    }
    await loadSessions()
  } catch {
    error.value = 'Erreur réseau lors de la réouverture.'
  }
}

async function closeSession(id) {
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${id}/close`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (sessionStore.activeSession?.id === id) {
      sessionStore.setActiveSession(null)
      qrCodeUrl.value = null
    }
    await loadSessions()
  } catch {}
}

function selectSession(session) {
  sessionStore.setActiveSession(session)
  joinUrl.value = `${window.location.origin}/join/${session.code}`
  tvUrl.value = `${window.location.origin}/tv/${session.code}`
}

async function copyTvUrl() {
  try {
    await navigator.clipboard.writeText(tvUrl.value)
    tvCopied.value = true
    setTimeout(() => { tvCopied.value = false }, 2000)
  } catch {}
}

watch(
  () => sessionStore.activeSession,
  (session) => {
    if (!session) {
      qrCodeUrl.value = null
      joinUrl.value = ''
      return
    }
    joinUrl.value = `${window.location.origin}/join/${session.code}`
    tvUrl.value = `${window.location.origin}/tv/${session.code}`
    loadSessionQrCode(session.id).catch(() => {
      qrCodeUrl.value = null
    })
  },
  { immediate: true }
)

onMounted(loadSessions)
</script>

<template>
  <div class="session-manager">
    <section class="create-section">
      <h2 class="section-title">✦ Nouvelle Session</h2>
      <div class="create-form">
        <input
          v-model="sessionName"
          type="text"
          class="form-input"
          placeholder="Nom de la session…"
          @keyup.enter="createSession"
        />
        <button class="create-btn" @click="createSession" :disabled="loading">
          {{ loading ? '…' : 'Créer' }}
        </button>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
    </section>

    <section v-if="sessionStore.activeSession" class="active-session">
      <h2 class="section-title">✦ Session Active</h2>
      <div class="session-card active">
        <div class="session-name-row">
          <template v-if="renamingId === sessionStore.activeSession.id">
            <input
              v-model="renameValue"
              class="rename-input"
              @keyup.enter="saveRename(sessionStore.activeSession.id)"
              @keyup.escape="cancelRename"
              autofocus
            />
            <button class="rename-save-btn" :disabled="renameLoading" @click="saveRename(sessionStore.activeSession.id)">
              <AppIcon icon="lucide:check" size="0.85em" />
            </button>
            <button class="rename-cancel-btn" @click="cancelRename">
              <AppIcon icon="lucide:x" size="0.85em" />
            </button>
          </template>
          <template v-else>
            <p class="session-name">{{ sessionStore.activeSession.name }}</p>
            <button class="rename-icon-btn" @click="startRename(sessionStore.activeSession)" title="Renommer">
              <AppIcon icon="lucide:pencil" size="0.8em" />
            </button>
          </template>
        </div>
        <div class="big-code">{{ sessionStore.activeSession.code }}</div>
        <p class="join-url">
          <a :href="joinUrl" target="_blank">{{ joinUrl }}</a>
        </p>
        <div v-if="qrCodeUrl" class="qr-section">
          <img :src="qrCodeUrl" alt="QR Code" class="qr-code" />
          <p class="qr-hint">Scannez pour rejoindre</p>
        </div>

        <!-- TV Screen link -->
        <div class="tv-section">
          <div class="tv-header">
            <span class="tv-label"><AppIcon icon="lucide:monitor" size="0.85em" /> Écran TV</span>
            <a :href="tvUrl" target="_blank" class="tv-open-btn">Ouvrir →</a>
          </div>
          <div class="tv-url-row">
            <span class="tv-url">{{ tvUrl }}</span>
            <button class="tv-copy-btn" @click="copyTvUrl">
              {{ tvCopied ? '✓ Copié' : '' }}<AppIcon v-if="!tvCopied" icon="lucide:clipboard" size="0.85em" /> {{ tvCopied ? '' : 'Copier' }}
            </button>
          </div>
          <p class="tv-hint">Ouvrez ce lien sur votre TV ou second écran.</p>
        </div>

        <button class="close-btn" @click="closeSession(sessionStore.activeSession.id)">
          Fermer la session
        </button>
        <button class="delete-btn" @click="deleteSession(sessionStore.activeSession.id)">
          <AppIcon icon="lucide:trash-2" size="0.85em" /> Supprimer définitivement
        </button>
      </div>
    </section>

    <section v-if="sessionStore.sessions.length" class="sessions-list">
      <h2 class="section-title">✦ Sessions</h2>
      <div
        v-for="s in sessionStore.sessions"
        :key="s.id"
        class="session-card"
        :class="{ active: sessionStore.activeSession?.id === s.id, closed: s.status === 'closed' }"
        @click="s.status === 'active' && selectSession(s)"
      >
        <div class="session-card-inner">
          <div class="session-info">
            <template v-if="renamingId === s.id">
              <input
                v-model="renameValue"
                class="rename-input"
                @keyup.enter="saveRename(s.id)"
                @keyup.escape="cancelRename"
                @click.stop
                autofocus
              />
            </template>
            <p v-else class="session-name">{{ s.name }}</p>
            <p class="session-code">{{ s.code }}</p>
          </div>
          <div class="session-actions-right">
            <template v-if="renamingId === s.id">
              <button class="rename-save-btn" :disabled="renameLoading" @click.stop="saveRename(s.id)"><AppIcon icon="lucide:check" size="0.85em" /></button>
              <button class="rename-cancel-btn" @click.stop="cancelRename"><AppIcon icon="lucide:x" size="0.85em" /></button>
            </template>
            <template v-else>
              <span class="session-status" :class="s.status">{{ s.status }}</span>
              <button class="rename-icon-btn" @click.stop="startRename(s)" title="Renommer"><AppIcon icon="lucide:pencil" size="0.8em" /></button>
              <button v-if="s.status === 'closed'" class="reopen-mini-btn" @click.stop="reopenSession(s.id)" title="Réouvrir"><AppIcon icon="lucide:undo-2" size="0.85em" /></button>
              <button class="delete-mini-btn" @click.stop="deleteSession(s.id)"><AppIcon icon="lucide:trash-2" size="0.85em" /></button>
            </template>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.session-manager {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.75rem;
}

.create-form {
  display: flex;
  gap: 0.5rem;
}

.form-input {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.65rem 1rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.95rem;
  outline: none;
}

.form-input:focus { border-color: var(--color-gold-dark); }
.form-input::placeholder { color: var(--color-border); }

.create-btn {
  padding: 0.65rem 1.25rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.create-btn:hover:not(:disabled) {
  background: var(--gradient-accent-action-hover);
}

.create-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.form-error {
  color: var(--admin-danger-text, var(--color-danger));
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.session-card {
  background: linear-gradient(160deg, var(--color-surface), var(--color-surface));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.session-card.active {
  border-color: var(--color-gold-dark);
  cursor: default;
}

.session-card.closed {
  opacity: 0.5;
  cursor: not-allowed;
}

.session-card:not(.active):not(.closed):hover {
  border-color: var(--color-gold-dark);
}

.session-card-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.session-name {
  font-family: var(--font-heading);
  font-size: 0.95rem;
  color: var(--color-parchment);
}

.big-code {
  font-family: var(--font-title);
  font-size: 2.5rem;
  color: var(--color-gold-bright);
  text-shadow: var(--text-shadow-accent);
  letter-spacing: 0.2em;
  text-align: center;
  padding: 0.5rem 0;
}

.session-code {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin-top: 0.2rem;
}

.session-status {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 20px;
}

.session-status.active {
  color: var(--admin-success-text, var(--color-success));
  background: var(--admin-success-bg, var(--color-success-soft));
  border: 1px solid var(--admin-success-border, var(--color-success-border));
}

.session-status.closed {
  color: var(--color-text-dim);
  background: var(--admin-control-bg-muted, var(--surface-ghost));
  border: 1px solid var(--color-border);
}

.join-url {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-gold);
  margin: 0.5rem 0;
  word-break: break-all;
}

.join-url a { color: var(--color-gold); }

.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1rem 0;
  gap: 0.5rem;
}

.qr-code {
  width: 180px;
  height: 180px;
  border: 3px solid var(--color-gold-dark);
  border-radius: 8px;
  background: white;
  padding: 4px;
}

.qr-hint {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.close-btn {
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.6rem;
  background: none;
  border: 1px solid var(--admin-danger-border, var(--color-danger-border));
  border-radius: 6px;
  color: var(--admin-danger-text, var(--color-danger));
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--admin-danger-bg, var(--color-danger-soft));
}

.tv-section {
  margin-top: 0.75rem;
  background: var(--admin-panel-highlight-bg, var(--gradient-panel-soft));
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tv-label {
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold);
}

.tv-open-btn {
  font-family: var(--font-heading);
  font-size: 0.65rem;
  color: var(--color-gold);
  text-decoration: none;
  border: 1px solid var(--color-gold-dark);
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  transition: all 0.2s;
}
.tv-open-btn:hover { background: var(--admin-gold-bg, var(--surface-gold-soft)); color: var(--color-gold-bright); }

.tv-url-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tv-url {
  flex: 1;
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--color-text-dim);
  word-break: break-all;
}

.tv-copy-btn {
  padding: 0.2rem 0.55rem;
  background: var(--admin-gold-bg, var(--surface-gold-soft));
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.tv-copy-btn:hover { background: var(--admin-gold-bg-strong, var(--surface-gold-soft-strong)); color: var(--color-gold-bright); }

.tv-hint {
  font-family: var(--font-body);
  font-size: 0.7rem;
  color: var(--color-text-dim);
}

.session-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.session-info { flex: 1; min-width: 0; }

.rename-input {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.9rem;
  outline: none;
  min-width: 0;
  width: 100%;
}

.rename-icon-btn {
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s;
}
.rename-icon-btn:hover { color: var(--color-gold-dark); }

.rename-save-btn {
  border: 1px solid var(--color-success-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-success);
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  line-height: 1;
}
.rename-save-btn:hover:not(:disabled) { background: var(--color-success-soft); }
.rename-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.rename-cancel-btn {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-dim);
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  line-height: 1;
}
.rename-cancel-btn:hover { background: var(--surface-ghost); }

.session-actions-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.delete-btn {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.6rem;
  background: var(--admin-danger-bg, var(--color-danger-soft));
  border: 1px solid var(--admin-danger-border, var(--color-danger-border));
  border-radius: 6px;
  color: var(--admin-danger-text, var(--color-danger));
  font-family: var(--font-heading);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: opacity 0.2s;
}
.delete-btn:hover { opacity: 0.8; }

.reopen-mini-btn {
  border: 1px solid var(--admin-success-border, var(--color-success-border));
  border-radius: 6px;
  background: transparent;
  color: var(--admin-success-text, var(--color-success));
  font-size: 0.85rem;
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  line-height: 1;
}
.reopen-mini-btn:hover { background: var(--admin-success-bg, var(--color-success-soft)); }

.delete-mini-btn {
  border: 1px solid var(--admin-danger-border, var(--color-danger-border));
  border-radius: 6px;
  background: transparent;
  color: var(--admin-danger-text, var(--color-danger));
  font-size: 0.85rem;
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  line-height: 1;
}
.delete-mini-btn:hover { background: var(--admin-danger-bg, var(--color-danger-soft)); }
</style>
