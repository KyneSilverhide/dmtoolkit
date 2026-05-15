<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { sessionStore } from '../../stores/session.js'
import { authStore } from '../../stores/auth.js'
import { getSocket } from '../../socket.js'
import AppIcon from '../AppIcon.vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const selectedPlayerId = ref('all')
const messageText = ref('')
const authorName = ref('')
const imageFile = ref(null)
const messageType = ref('text')
const voiceStyle = ref('normal')
const textEffect = ref('none')
const sending = ref(false)
const feedback = ref('')

const hasSession = computed(() => !!sessionStore.activeSession)
const hasConnectedPlayers = computed(() => sessionStore.players.length > 0)
const canSend = computed(() => hasSession.value && hasConnectedPlayers.value && !sending.value)

function handleSendError(data) {
  feedback.value = data?.message || "Erreur lors de l'envoi."
}

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

    if (messageType.value === 'image' && imageFile.value) {
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

    const socket = getSocket(authStore.token)
    socket.emit('send-message', {
      sessionId: sessionStore.activeSession.id,
      toPlayerId: selectedPlayerId.value === 'all' ? null : parseInt(selectedPlayerId.value),
      type: messageType.value,
      content,
      voiceStyle: voiceStyle.value,
      textEffect: textEffect.value,
      authorName: authorName.value.trim() || null,
    })

    feedback.value = 'Message envoyé !'
    messageText.value = ''
    imageFile.value = null
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
        <label class="form-label">Auteur (affiché aux joueurs)</label>
        <input
          v-model="authorName"
          type="text"
          class="form-select"
          placeholder="Laisser vide pour utiliser votre login"
        />
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
        <label class="form-label">Voix</label>
        <div class="type-toggle">
          <button class="toggle-btn" :class="{ active: voiceStyle === 'normal' }" @click="voiceStyle = 'normal'">Normale</button>
          <button class="toggle-btn voice-god" :class="{ active: voiceStyle === 'god' }" @click="voiceStyle = 'god'"><AppIcon icon="lucide:zap" size="0.85em" /> Dieu</button>
          <button class="toggle-btn voice-whisper" :class="{ active: voiceStyle === 'whisper' }" @click="voiceStyle = 'whisper'"><AppIcon icon="lucide:wind" size="0.85em" /> Murmure</button>
          <button class="toggle-btn voice-demon" :class="{ active: voiceStyle === 'demon' }" @click="voiceStyle = 'demon'"><AppIcon icon="game-icons:imp" size="0.85em" /> Démon</button>
        </div>
      </div>

      <div class="form-group" v-if="messageType === 'text'">
        <label class="form-label">Effet</label>
        <div class="type-toggle">
          <button class="toggle-btn" :class="{ active: textEffect === 'none' }" @click="textEffect = 'none'">Aucun</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'slow' }" @click="textEffect = 'slow'"><AppIcon icon="lucide:hourglass" size="0.85em" /> Lent</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'glitch' }" @click="textEffect = 'glitch'"><AppIcon icon="lucide:activity" size="0.85em" /> Glitch</button>
          <button class="toggle-btn" :class="{ active: textEffect === 'typewriter' }" @click="textEffect = 'typewriter'">⌨ Frappe</button>
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
        <input type="file" accept="image/*" @change="onFileChange" class="form-file" />
      </div>

      <p v-if="feedback" class="feedback" :class="{ error: feedback.includes('Erreur') }">
        {{ feedback }}
      </p>

      <button class="send-btn" @click="sendMessage" :disabled="!canSend">
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
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
}

.no-session {
  font-family: var(--font-body);
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
  font-family: var(--font-heading);
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
  font-family: var(--font-body);
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-select:focus,
.form-textarea:focus { border-color: var(--color-gold-dark); }

.form-textarea { resize: vertical; }

.form-file {
  color: var(--color-text-dim);
  font-family: var(--font-body);
  font-size: 0.9rem;
}

.type-toggle {
  display: flex;
  gap: 0.5rem;
}

.toggle-btn {
  flex: 1;
  padding: 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading);
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: var(--admin-gold-bg, var(--surface-gold-soft));
}

.toggle-btn.voice-god.active {
  border-color: var(--color-gold-dark);
  color: var(--color-gold-bright);
  background: var(--admin-gold-bg, var(--surface-gold-soft));
}
.toggle-btn.voice-whisper.active {
  border-color: var(--admin-info-border, var(--color-info-border));
  color: var(--admin-info-text, var(--color-info-bright));
  background: var(--admin-info-bg, var(--color-info-soft));
}
.toggle-btn.voice-demon.active {
  border-color: var(--admin-danger-border, var(--color-danger-border));
  color: var(--admin-danger-text, var(--color-danger));
  background: var(--admin-danger-bg, var(--color-danger-soft));
}

.feedback {
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--admin-success-text, var(--color-success));
  text-align: center;
}

.feedback.error { color: var(--admin-danger-text, var(--color-danger)); }

.send-btn {
  padding: 0.85rem;
  background: var(--gradient-info-action);
  border: 1px solid var(--admin-info-border, var(--color-info-border));
  border-radius: 8px;
  color: var(--color-parchment);
  font-family: var(--font-heading);
  font-size: 0.9rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: var(--gradient-info-action-hover);
  box-shadow: var(--shadow-soft);
}

.send-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
