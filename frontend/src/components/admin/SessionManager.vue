<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import AppIcon from '../AppIcon.vue'

import { BACKEND_URL } from '@/config.js'

const sessionName = ref('')
const loading = ref(false)
const error = ref('')
const qrCodeUrl = ref(null)
const joinUrl = ref('')
const tvUrl = ref('')
const tvCopied = ref(false)
const joinCopied = ref(false)

const otherSessions = computed(() =>
  sessionStore.sessions.filter(s => s.id !== sessionStore.activeSession?.id)
)

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

async function copyJoinUrl() {
  try {
    await navigator.clipboard.writeText(joinUrl.value)
    joinCopied.value = true
    setTimeout(() => { joinCopied.value = false }, 2000)
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
        <!-- En-tête : nom + badge code -->
        <div class="session-header-row">
          <div class="session-name-area">
            <template v-if="renamingId === sessionStore.activeSession.id">
              <input
                v-model="renameValue"
                class="rename-input"
                @keyup.enter="saveRename(sessionStore.activeSession.id)"
                @keyup.esc="cancelRename"
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
          <div class="code-badge">{{ sessionStore.activeSession.code }}</div>
        </div>

        <!-- Corps à deux colonnes -->
        <div class="session-two-col">
          <!-- Colonne Joueurs -->
          <div class="session-col">
            <p class="col-label"><AppIcon icon="game-icons:wizard-staff" size="0.8em" /> Joueurs</p>
            <div v-if="qrCodeUrl" class="col-qr">
              <img :src="qrCodeUrl" alt="QR Code" class="qr-code" />
            </div>
            <div class="col-url-row">
              <a :href="joinUrl" target="_blank" class="col-url">{{ joinUrl }}</a>
            </div>
            <button class="col-copy-btn" @click="copyJoinUrl">
              <AppIcon v-if="!joinCopied" icon="lucide:clipboard" size="0.8em" />
              {{ joinCopied ? '✓ Copié' : 'Copier le lien' }}
            </button>
          </div>

          <!-- Colonne TV -->
          <div class="session-col">
            <p class="col-label"><AppIcon icon="lucide:monitor" size="0.8em" /> Écran TV</p>
            <div class="col-url-row">
              <span class="col-url">{{ tvUrl }}</span>
            </div>
            <div class="col-tv-actions">
              <button class="col-copy-btn" @click="copyTvUrl">
                <AppIcon v-if="!tvCopied" icon="lucide:clipboard" size="0.8em" />
                {{ tvCopied ? '✓ Copié' : 'Copier' }}
              </button>
              <a :href="tvUrl" target="_blank" class="col-open-btn">
                <AppIcon icon="lucide:external-link" size="0.8em" /> Ouvrir
              </a>
            </div>
            <p class="col-hint">Ouvrez sur votre TV ou second écran.</p>
          </div>
        </div>

        <!-- Pied : actions destructives -->
        <div class="session-danger-footer">
          <button class="close-btn" @click="closeSession(sessionStore.activeSession.id)">
            Fermer la session
          </button>
          <button class="delete-btn" @click="deleteSession(sessionStore.activeSession.id)">
            <AppIcon icon="lucide:trash-2" size="0.85em" /> Supprimer
          </button>
        </div>
      </div>
    </section>

    <section v-if="otherSessions.length" class="sessions-list">
      <h2 class="section-title">✦ Sessions</h2>
      <div
        v-for="s in otherSessions"
        :key="s.id"
        class="session-card"
        :class="{ closed: s.status === 'closed' }"
        @click="s.status === 'active' && selectSession(s)"
      >
        <div class="session-card-inner">
          <div class="session-info">
            <template v-if="renamingId === s.id">
              <input
                v-model="renameValue"
                class="rename-input"
                @keyup.enter="saveRename(s.id)"
                @keyup.esc="cancelRename"
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
  font-family: var(--font-heading), sans-serif;
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
  font-family: var(--font-body), sans-serif;
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
  font-family: var(--font-heading), sans-serif;
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

/* ── En-tête session active ────────────────────────────────── */
.session-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.session-name-area {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
}

.code-badge {
  font-family: var(--font-title), sans-serif;
  font-size: 1.25rem;
  color: var(--color-gold-bright);
  letter-spacing: 0.15em;
  background: var(--admin-gold-bg, var(--surface-gold-soft));
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  padding: 0.2rem 0.75rem;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Corps deux colonnes ────────────────────────────────────── */
.session-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

@media (max-width: 480px) {
  .session-two-col {
    grid-template-columns: 1fr;
  }
}

.session-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem;
}

.col-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold);
  margin: 0 0 0.25rem;
}

.col-qr {
  display: flex;
  justify-content: center;
}

.col-url-row {
  overflow: hidden;
}

.col-url {
  display: block;
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--color-gold);
  word-break: break-all;
  line-height: 1.4;
  text-decoration: none;
}
.col-url:hover {
  text-decoration: underline;
}

.col-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  background: var(--admin-gold-bg, var(--surface-gold-soft));
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.col-copy-btn:hover {
  background: var(--admin-gold-bg-strong, var(--surface-gold-soft-strong));
  color: var(--color-gold-bright);
}

.col-tv-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.col-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  color: var(--color-gold);
  text-decoration: none;
  border: 1px solid var(--color-gold-dark);
  padding: 0.3rem 0.65rem;
  border-radius: 6px;
  transition: all 0.18s;
  white-space: nowrap;
}
.col-open-btn:hover {
  background: var(--admin-gold-bg, var(--surface-gold-soft));
  color: var(--color-gold-bright);
}

.col-hint {
  font-family: var(--font-body), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  margin: 0;
  margin-top: auto;
}

/* ── Pied danger ──────────────────────────────────────────── */
.session-danger-footer {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  margin-top: 0.25rem;
}

.session-card-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.session-name {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.95rem;
  color: var(--color-parchment);
  margin: 0;
}

.session-code {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin-top: 0.2rem;
}

.session-status {
  font-family: var(--font-heading), sans-serif;
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

.qr-code {
  width: 130px;
  height: 130px;
  border: 2px solid var(--color-gold-dark);
  border-radius: 6px;
  background: white;
  padding: 3px;
}

.close-btn {
  flex: 1;
  padding: 0.6rem;
  background: none;
  border: 1px solid var(--admin-danger-border, var(--color-danger-border));
  border-radius: 6px;
  color: var(--admin-danger-text, var(--color-danger));
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--admin-danger-bg, var(--color-danger-soft));
}

.session-info { flex: 1; min-width: 0; }

.rename-input {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  color: var(--color-parchment);
  font-family: var(--font-heading), sans-serif;
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
  padding: 0.6rem 0.9rem;
  background: var(--admin-danger-bg, var(--color-danger-soft));
  border: 1px solid var(--admin-danger-border, var(--color-danger-border));
  border-radius: 6px;
  color: var(--admin-danger-text, var(--color-danger));
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: opacity 0.2s;
  white-space: nowrap;
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
