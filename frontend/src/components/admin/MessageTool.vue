<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'

import { BACKEND_URL } from '@/config.js'
import { apiFetch } from '@/utils/apiFetch.js'

// Valeurs hexadécimales réelles requises : alimentent <input type="color"> (natif,
// n'accepte pas var()) et sont envoyées telles quelles au serveur/joueur via le socket.
// Valeurs centralisées dans style.css (--msg-swatch-*) à titre de référence/cohérence
// pour les autres usages CSS statiques (ex. MessageCard.vue), mais gardées littérales ici.
const COLOR_PALETTE = [
  { value: '#d4af37', label: 'Or' },
  { value: '#60a5fa', label: 'Azur' },
  { value: '#f87171', label: 'Sang' },
  { value: '#34d399', label: 'Émeraude' },
  { value: '#c084fc', label: 'Arcane' },
  { value: '#fb923c', label: 'Braise' },
  { value: '#e2e8f0', label: 'Argent' },
]

const selectedPlayerId = ref('all')
const messageText = ref('')
const authorName = ref('')
const authorColor = ref('#d4af37')
const imageFile = ref(null)
const messageType = ref('text')
const textEffect = ref('none')
const sending = ref(false)
const feedback = ref('')

// Conversations : l'historique vit dans sessionStore.messageThreads (persisté en base, hydraté
// et tenu à jour par AdminView.vue, toujours monté) — ce composant n'est instancié qu'à la
// première visite de l'onglet (KeepAlive ne pré-monte rien), il ne fait que lire. Le fil affiché
// est piloté par `selectedPlayerId` ('all' = diffusions, sinon l'id d'un joueur). Voir CLAUDE.md.
const threadPane = ref(null)
// KeepAlive laisse les watchers d'un composant désactivé tourner : sans ce garde, un message
// arrivé pendant que le MJ est sur un autre onglet serait marqué lu par erreur.
const isActive = ref(false)

const imageSource = ref('gallery')   // 'gallery' | 'pc'
const galleryImages = ref([])
const selectedGalleryUrl = ref(null)

const isCustomColor = computed(() => !COLOR_PALETTE.some(c => c.value === authorColor.value))

const hasSession = computed(() => !!sessionStore.activeSession)
const hasConnectedPlayers = computed(() => sessionStore.players.length > 0)
const canSend = computed(() => {
  if (!hasSession.value || !hasConnectedPlayers.value || sending.value) return false
  if (messageType.value === 'text') return !!messageText.value.trim()
  if (messageType.value === 'image') {
    return imageSource.value === 'gallery' ? !!selectedGalleryUrl.value : !!imageFile.value
  }
  return false
})

function handleSendError(data) {
  feedback.value = data?.message || "Erreur lors de l'envoi."
}

const threadKey = computed(() => String(selectedPlayerId.value || 'all'))

const threadChips = computed(() => [
  { key: 'all', label: 'Tous', unread: 0 },
  ...sessionStore.players.map(p => ({
    key: String(p.id),
    label: p.player_name,
    unread: sessionStore.threadUnread(String(p.id)),
    hasHistory: (sessionStore.messageThreads[String(p.id)] || []).length > 0,
  })),
])

// Messages du fil + jets cachés de ce joueur (live-only), triés chronologiquement.
const threadEntries = computed(() => {
  const msgs = (sessionStore.messageThreads[threadKey.value] || []).map(m => ({ ...m, entryKind: 'message' }))
  const rolls = threadKey.value === 'all' ? [] : sessionStore.hiddenRolls
    .filter(r => String(r.playerId) === threadKey.value)
    .map(r => ({ ...r, entryKind: 'roll', sentAt: r.receivedAt }))
  return [...msgs, ...rolls].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
})

function markCurrentThreadRead() {
  const key = threadKey.value
  if (!isActive.value || key === 'all' || sessionStore.threadUnread(key) === 0) return
  sessionStore.markThreadRead(key)
  getSocket(authStore.token).emit('mark-thread-read', {
    sessionId: sessionStore.activeSession.id,
    playerId: parseInt(key),
  })
}

function scrollThreadToEnd() {
  nextTick(() => { if (threadPane.value) threadPane.value.scrollTop = threadPane.value.scrollHeight })
}

function selectThread(key) {
  selectedPlayerId.value = key === 'all' ? 'all' : parseInt(key)
}

function consumeRequestedThread() {
  const key = sessionStore.requestedThreadKey
  if (!key) return
  sessionStore.requestedThreadKey = null
  selectThread(key)
}

function formatInboxTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${time}`
}

function entryPreview(m) {
  if (m.type === 'image') return '🖼 Image'
  if (m.type === 'content') return '📜 Fiche envoyée'
  return m.content
}

watch(threadKey, (key) => {
  sessionStore.openThreadKey = key
  markCurrentThreadRead()
  scrollThreadToEnd()
}, { immediate: true })
watch(() => sessionStore.threadUnread(threadKey.value), markCurrentThreadRead)
watch(() => threadEntries.value.length, scrollThreadToEnd)
watch(() => sessionStore.requestedThreadKey, consumeRequestedThread)

onActivated(() => {
  isActive.value = true
  sessionStore.openThreadKey = threadKey.value
  consumeRequestedThread()
  markCurrentThreadRead()
  scrollThreadToEnd()
})
onDeactivated(() => { isActive.value = false })

async function loadGalleryImages() {
  if (!sessionStore.activeSession) return
  try {
    const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/images?type=image`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) galleryImages.value = await res.json()
  } catch (err) { console.error(err) }
}

function imageFullUrl(url) {
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

watch(messageType, (val) => {
  if (val === 'image') loadGalleryImages()
})

watch(hasConnectedPlayers, (isConnected) => {
  if (!isConnected) {
    selectedPlayerId.value = ''
    return
  }
  if (!selectedPlayerId.value) {
    selectedPlayerId.value = 'all'
  }
}, { immediate: true })

onMounted(() => {
  const socket = getSocket(authStore.token)
  socket.on('send-error', handleSendError)
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('send-error', handleSendError)
})

function onFileChange(e) {
  imageFile.value = e.target.files[0] || null
}

async function sendMessage() {
  if (!hasSession.value) {
    feedback.value = 'Aucune session active.'
    return
  }
  if (!hasConnectedPlayers.value) {
    feedback.value = 'Aucun joueur connecté.'
    return
  }
  if (messageType.value === 'text' && !messageText.value.trim()) {
    feedback.value = 'Message vide.'
    return
  }
  sending.value = true
  feedback.value = ''

  try {
    let content = messageText.value

    if (messageType.value === 'image') {
      if (imageSource.value === 'gallery' && selectedGalleryUrl.value) {
        content = selectedGalleryUrl.value
      } else if (imageSource.value === 'pc' && imageFile.value) {
        const formData = new FormData()
        formData.append('file', imageFile.value)
        const res = await apiFetch(`/api/uploads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authStore.token}` },
          body: formData,
        })
        const data = await res.json()
        content = data.url
      }
    }

    const socket = getSocket(authStore.token)
    socket.emit('send-message', {
      sessionId: sessionStore.activeSession.id,
      toPlayerId: selectedPlayerId.value === 'all' ? null : parseInt(selectedPlayerId.value),
      type: messageType.value,
      content,
      textEffect: textEffect.value,
      authorName: authorName.value.trim() || null,
      authorColor: authorColor.value,
    })

    feedback.value = 'Message envoyé !'
    messageText.value = ''
    imageFile.value = null
    selectedGalleryUrl.value = null
    setTimeout(() => { feedback.value = '' }, 3000)
  } catch {
    feedback.value = "Erreur lors de l'envoi."
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="message-tool">
    <h2 class="section-title">✦ Messages</h2>

    <!-- ── Conversations ─────────────────────────────────────────────────── -->
    <div v-if="hasSession" class="threads" data-testid="message-threads">
      <div class="thread-chips" role="tablist" aria-label="Conversations">
        <button
          v-for="chip in threadChips"
          :key="chip.key"
          type="button"
          role="tab"
          class="thread-chip"
          :class="{ active: threadKey === chip.key, 'has-unread': chip.unread > 0 }"
          :aria-selected="threadKey === chip.key"
          :data-testid="`thread-chip-${chip.key}`"
          @click="selectThread(chip.key)"
        >
          {{ chip.label }}
          <span v-if="chip.unread > 0" class="inbox-badge" data-testid="thread-unread-badge">{{ chip.unread }}</span>
        </button>
      </div>
      <div ref="threadPane" class="thread-pane" data-testid="thread-pane">
        <div v-if="threadEntries.length === 0" class="inbox-empty">
          {{ threadKey === 'all' ? 'Aucune diffusion envoyée.' : 'Aucun échange — écrivez le premier message ci-dessous.' }}
        </div>
        <div
          v-for="(m, idx) in threadEntries"
          :key="m.id ?? `r${idx}`"
          class="thread-msg"
          :class="[m.entryKind === 'roll' ? 'from-roll' : (m.fromPlayer ? 'from-player' : 'from-dm')]"
          data-testid="thread-message"
        >
          <div class="thread-msg-header">
            <span class="thread-msg-name">{{ m.entryKind === 'roll' ? m.playerName : m.fromName }}</span>
            <span class="thread-msg-time">{{ formatInboxTime(m.sentAt) }}</span>
          </div>
          <p v-if="m.entryKind === 'roll'" class="thread-msg-content dice-roll">
            <AppIcon icon="lucide:eye-off" size="0.75em" />
            {{ m.diceCount }}d{{ m.diceType }}<template v-if="m.modifier !== 0">{{ m.modifier > 0 ? '+' : '' }}{{ m.modifier }}</template>
            <template v-if="m.rollType !== 'normal'"> ({{ m.rollType === 'advantage' ? 'avantage' : 'désavantage' }})</template>
            = <strong>{{ m.total }}</strong>
          </p>
          <img v-else-if="m.type === 'image'" :src="imageFullUrl(m.content)" alt="Image envoyée" class="thread-msg-image" />
          <p v-else class="thread-msg-content">{{ entryPreview(m) }}</p>
        </div>
      </div>
    </div>

    <div v-if="!hasSession" class="no-session">
      <p>Aucune session active. Créez ou sélectionnez une session d'abord.</p>
    </div>

    <template v-else>
      <div class="form-group">
        <label class="form-label">Auteur <HelpTip id="message.author-color" /></label>
        <div class="author-row">
          <input
            v-model="authorName"
            type="text"
            class="form-select author-input"
            placeholder="Laisser vide pour utiliser votre login"
          />
          <div class="color-palette">
            <button
              v-for="c in COLOR_PALETTE"
              :key="c.value"
              class="color-swatch"
              :class="{ active: authorColor === c.value }"
              :style="{ background: c.value }"
              :title="c.label"
              @click="authorColor = c.value"
            />
            <div
              class="color-swatch custom-swatch"
              :class="{ active: isCustomColor }"
              :style="isCustomColor ? { background: authorColor } : {}"
              title="Couleur personnalisée"
            >
              <input type="color" v-model="authorColor" class="hidden-color" />
              <span v-if="!isCustomColor" class="custom-icon">✦</span>
            </div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Destinataire</label>
        <select v-model="selectedPlayerId" class="form-select" :disabled="!hasConnectedPlayers">
          <option v-if="hasConnectedPlayers" value="all">Tous les joueurs</option>
          <option v-else value="" disabled>Aucun joueur connecté</option>
          <option v-for="p in sessionStore.players" :key="p.id" :value="p.id">
            {{ p.player_name }}{{ sessionStore.threadUnread(String(p.id)) > 0 ? ` (${sessionStore.threadUnread(String(p.id))} non lu)` : '' }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Type</label>
        <div class="type-toggle">
          <button
            class="toggle-btn"
            :class="{ active: messageType === 'text' }"
            @click="messageType = 'text'"
          >Texte</button>
          <button
            class="toggle-btn"
            :class="{ active: messageType === 'image' }"
            @click="messageType = 'image'"
          >Image</button>
        </div>
      </div>

      <div class="form-group" v-if="messageType === 'text'">
        <label class="form-label">Effet <HelpTip id="message.effect" /></label>
        <div class="type-toggle effects-toggle">
          <button class="toggle-btn" :class="{ active: textEffect === 'none' }" @click="textEffect = 'none'">Aucun</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'slow' }" @click="textEffect = 'slow'"><AppIcon icon="lucide:hourglass" size="0.85em" /> Lent</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'glitch' }" @click="textEffect = 'glitch'"><AppIcon icon="lucide:activity" size="0.85em" /> Glitch</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'typewriter' }" @click="textEffect = 'typewriter'">⌨ Frappe</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'shake' }" @click="textEffect = 'shake'"><AppIcon icon="lucide:move" size="0.85em" /> Tremblement</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'glow' }" @click="textEffect = 'glow'"><AppIcon icon="lucide:sparkles" size="0.85em" /> Lueur</button>
        </div>
      </div>

      <div class="form-group" v-if="messageType === 'text'">
        <label class="form-label">Message</label>
        <textarea
          v-model="messageText"
          class="form-textarea"
          placeholder="Votre message…"
          rows="4"
        ></textarea>
      </div>

      <div class="form-group" v-else>
        <label class="form-label">Image</label>
        <div class="type-toggle img-source-toggle">
          <button class="toggle-btn" :class="{ active: imageSource === 'gallery' }" @click="imageSource = 'gallery'; selectedGalleryUrl = null">
            <AppIcon icon="lucide:images" size="0.85em" /> Galerie
          </button>
          <button class="toggle-btn" :class="{ active: imageSource === 'pc' }" @click="imageSource = 'pc'; imageFile = null">
            <AppIcon icon="lucide:upload" size="0.85em" /> PC
          </button>
        </div>

        <!-- Galerie session -->
        <div v-if="imageSource === 'gallery'" class="gallery-picker">
          <div v-if="galleryImages.length === 0" class="gallery-empty">
            Aucune image dans la session — utilisez l'onglet Images.
          </div>
          <div v-else class="gallery-grid">
            <div
              v-for="img in galleryImages"
              :key="img.id"
              class="gallery-pick-item"
              :class="{ selected: selectedGalleryUrl === img.url }"
              :title="img.original_name || img.url.split('/').pop()"
              @click="selectedGalleryUrl = img.url"
            >
              <img :src="imageFullUrl(img.thumbnail_url || img.url)" class="gallery-pick-thumb" :alt="img.original_name" />
            </div>
          </div>
        </div>

        <!-- Upload PC -->
        <input v-else type="file" accept="image/*" @change="onFileChange" class="form-file" />
      </div>

      <p v-if="feedback" class="feedback" :class="{ error: feedback.includes('Erreur') }">
        {{ feedback }}
      </p>

      <button class="send-btn" data-testid="message-send-btn" @click="sendMessage" :disabled="!canSend">
        {{ sending ? 'Envoi…' : '' }}<AppIcon v-if="!sending" icon="lucide:mail" size="0.9em" /> {{ sending ? '' : 'Envoyer' }}
      </button>
      <p v-if="!hasConnectedPlayers" class="feedback error">Aucun joueur connecté dans cette session.</p>
    </template>
  </div>
</template>

<style scoped>
.message-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.no-session {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text-dim);
  text-align: center;
  padding: var(--space-8) 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-label {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.form-select,
.form-textarea {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--space-3) var(--space-4);
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-md);
  outline: none;
  transition: border-color 0.2s;
}

.form-select:focus,
.form-textarea:focus { border-color: var(--color-gold-dark); }

.form-textarea { resize: vertical; }

.form-file {
  color: var(--color-text-dim);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-base);
}

/* ── Author row with color palette ───────────────────── */
.author-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.author-input {
  flex: 1;
  min-width: 0;
}

.color-palette {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-shrink: 0;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  flex-shrink: 0;
}

.color-swatch:hover {
  transform: scale(1.2);
}

.color-swatch.active {
  border-color: var(--color-parchment);
  box-shadow: 0 0 0 1px var(--color-gold-dark);
}

.custom-swatch {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
  border-color: var(--color-border);
  overflow: hidden;
}

.custom-swatch.active {
  border-color: var(--color-parchment);
}

.hidden-color {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  padding: 0;
  border: none;
}

.custom-icon {
  font-size: var(--text-xs);
  color: var(--color-text-dim);
  pointer-events: none;
  line-height: 1;
}

/* ── Toggles ─────────────────────────────────────────── */
.type-toggle {
  display: flex;
  gap: var(--space-2);
}

.effects-toggle {
  flex-wrap: wrap;
}

.toggle-btn {
  flex: 1;
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.toggle-btn.active {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: var(--admin-gold-bg, var(--surface-gold-soft));
}

.img-source-toggle { margin-bottom: var(--space-2); }

.gallery-picker {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.gallery-empty {
  padding: var(--space-4);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  text-align: center;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}

.gallery-pick-item {
  cursor: pointer;
  border-radius: 4px;
  border: 2px solid transparent;
  overflow: hidden;
  transition: border-color 0.15s;
}
.gallery-pick-item:hover { border-color: var(--color-gold-dark); }
.gallery-pick-item.selected { border-color: var(--color-gold-bright); }

.gallery-pick-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  display: block;
}

.feedback {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-base);
  color: var(--admin-success-text, var(--color-success));
  text-align: center;
}

.feedback.error { color: var(--admin-danger-text, var(--color-danger)); }

.send-btn {
  width: 100%;
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

.send-btn:hover:not(:disabled) {
  background: var(--gradient-accent-action-hover);
  box-shadow: var(--shadow-soft);
}

.send-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── Conversations ───────────────────────────────────────── */
.threads {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.thread-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.thread-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-sm);
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
}
.thread-chip:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.thread-chip.active {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: var(--admin-gold-bg, var(--surface-gold-soft));
}
.thread-chip.has-unread { border-color: var(--color-gold-bright); }

.inbox-badge {
  background: var(--color-gold-dark);
  color: var(--color-bg);
  border-radius: 10px;
  font-size: var(--text-xs);
  padding: 0.05rem var(--space-2);
  font-weight: 700;
  min-width: 1.3rem;
  text-align: center;
}

.thread-pane {
  max-height: 320px;
  min-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
}

.inbox-empty {
  padding: var(--space-4);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  color: var(--color-text-dim);
  text-align: center;
}

.thread-msg {
  max-width: 85%;
  padding: var(--space-2) var(--space-3);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.thread-msg.from-dm { align-self: flex-end; border-color: var(--color-gold-dark); }
.thread-msg.from-player { align-self: flex-start; border-left: 3px solid var(--msg-swatch-arcane); }
.thread-msg.from-roll { align-self: flex-start; border-left: 3px solid var(--msg-swatch-arcane); opacity: 0.9; }

.thread-msg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.thread-msg-name {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.thread-msg-time {
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-xs);
  color: var(--color-text-dim);
}

.thread-msg-content {
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-base);
  color: var(--color-parchment);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.thread-msg-content.dice-roll {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--msg-swatch-arcane);
}

.thread-msg-image {
  max-width: 100%;
  max-height: 160px;
  border-radius: 6px;
  object-fit: contain;
}
</style>
