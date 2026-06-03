<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'

import { BACKEND_URL } from '@/config.js'

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

async function loadGalleryImages() {
  if (!sessionStore.activeSession) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images?type=image`, {
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
        const res = await fetch(`${BACKEND_URL}/api/uploads`, {
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
    <h2 class="section-title">✦ Envoyer un Message</h2>

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
            {{ p.player_name }}
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
  gap: 1rem;
}

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.no-session {
  font-family: var(--font-body), sans-serif;
  color: var(--color-text-dim);
  text-align: center;
  padding: 2rem 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.form-select,
.form-textarea {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.65rem 1rem;
  color: var(--color-parchment);
  font-family: var(--font-body), sans-serif;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-select:focus,
.form-textarea:focus { border-color: var(--color-gold-dark); }

.form-textarea { resize: vertical; }

.form-file {
  color: var(--color-text-dim);
  font-family: var(--font-body), sans-serif;
  font-size: 0.9rem;
}

/* ── Author row with color palette ───────────────────── */
.author-row {
  display: flex;
  gap: 0.5rem;
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
  font-size: 0.65rem;
  color: var(--color-text-dim);
  pointer-events: none;
  line-height: 1;
}

/* ── Toggles ─────────────────────────────────────────── */
.type-toggle {
  display: flex;
  gap: 0.5rem;
}

.effects-toggle {
  flex-wrap: wrap;
}

.toggle-btn {
  flex: 1;
  padding: 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
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

.img-source-toggle { margin-bottom: 0.4rem; }

.gallery-picker {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.gallery-empty {
  padding: 1rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
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
  font-size: 0.9rem;
  color: var(--admin-success-text, var(--color-success));
  text-align: center;
}

.feedback.error { color: var(--admin-danger-text, var(--color-danger)); }

.send-btn {
  width: 100%;
  padding: 0.6rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.8rem;
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
</style>
