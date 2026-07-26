<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import { SHOW_CONTENT, SEND_MESSAGE } from '@/socket-events.js'

// Boutons "Afficher sur la TV" / "Envoyer à un joueur" pour une fiche de contenu (sort,
// objet, race, origine, aptitude, service, état — jamais une classe, voir CLAUDE.md).
// `item` est l'objet brut tel que chargé par le composant de recherche appelant (déjà en
// mémoire côté client) — envoyé tel quel au serveur, qui ne le résout jamais lui-même
// (voir backend/src/socket.js `show-content`).
const props = defineProps({
  contentType: { type: String, required: true },
  item: { type: Object, required: true },
})

const hasSession = computed(() => !!sessionStore.activeSession)
const hasConnectedPlayers = computed(() => sessionStore.players.length > 0)

const shown = ref(false)
function showOnTv() {
  if (!hasSession.value) return
  const socket = getSocket(authStore.token)
  socket.emit(SHOW_CONTENT, {
    sessionId: sessionStore.activeSession.id,
    contentType: props.contentType,
    contentData: props.item,
  })
  shown.value = true
  setTimeout(() => { shown.value = false }, 1600)
}

const pickerOpen = ref(false)
const sent = ref(false)
function togglePicker() {
  if (!hasSession.value || !hasConnectedPlayers.value) return
  pickerOpen.value = !pickerOpen.value
}
function sendTo(playerId) {
  const socket = getSocket(authStore.token)
  socket.emit(SEND_MESSAGE, {
    sessionId: sessionStore.activeSession.id,
    toPlayerId: playerId === 'all' ? null : playerId,
    type: 'content',
    content: JSON.stringify({ contentType: props.contentType, item: props.item }),
  })
  pickerOpen.value = false
  sent.value = true
  setTimeout(() => { sent.value = false }, 1600)
}

function closePicker() { pickerOpen.value = false }
onUnmounted(closePicker)
</script>

<template>
  <div class="content-actions">
    <button
      type="button"
      class="ca-btn"
      :class="{ 'ca-btn-active': shown }"
      :disabled="!hasSession"
      :title="hasSession ? 'Afficher sur la TV' : 'Aucune session active'"
      @click="showOnTv"
    >
      <AppIcon :icon="shown ? 'lucide:check' : 'lucide:tv'" size="0.8em" />
      {{ shown ? 'Affiché' : 'TV' }}
    </button>

    <div class="ca-picker-wrap">
      <button
        type="button"
        class="ca-btn"
        :class="{ 'ca-btn-active': sent }"
        :disabled="!hasSession || !hasConnectedPlayers"
        :title="hasConnectedPlayers ? 'Envoyer à un joueur' : 'Aucun joueur connecté'"
        @click="togglePicker"
      >
        <AppIcon :icon="sent ? 'lucide:check' : 'lucide:send'" size="0.8em" />
        {{ sent ? 'Envoyé' : 'Envoyer' }}
      </button>

      <div v-if="pickerOpen" class="ca-picker">
        <button type="button" class="ca-picker-item" @click="sendTo('all')">Tous les joueurs</button>
        <button
          v-for="player in sessionStore.players"
          :key="player.id"
          type="button"
          class="ca-picker-item"
          @click="sendTo(player.id)"
        >{{ player.player_name }}</button>
      </div>
      <div v-if="pickerOpen" class="ca-picker-backdrop" @click="closePicker"></div>
    </div>
  </div>
</template>

<style scoped>
.content-actions {
  display: flex;
  gap: 0.4rem;
}
.ca-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 0.25rem 0.65rem;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.18s;
}
.ca-btn:hover:not(:disabled) { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.ca-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ca-btn-active { border-color: var(--color-success-border); color: var(--color-success); }

.ca-picker-wrap { position: relative; }
.ca-picker {
  position: absolute;
  top: calc(100% + 0.3rem);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-medium);
  padding: 0.3rem;
}
.ca-picker-item {
  background: none;
  border: none;
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-body), sans-serif;
  font-size: 0.8rem;
  cursor: pointer;
}
.ca-picker-item:hover { background: var(--surface-raised); color: var(--color-gold-bright); }
.ca-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}
</style>
