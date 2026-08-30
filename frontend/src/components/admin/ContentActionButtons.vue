<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import { SHOW_CONTENT, SEND_MESSAGE } from '@/socket-events.js'

// Hauteur maximale du picker, doit rester alignée avec `.ca-picker { max-height }` plus bas —
// utilisée pour décider s'il faut le retourner au-dessus du bouton (surestimation volontaire :
// le picker peut être plus court, jamais plus haut, donc jamais un retournement inutile qui le
// ferait sortir de l'écran par le haut).
const PICKER_MAX_HEIGHT = 220
const PICKER_WIDTH = 180

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
const triggerRef = ref(null)
const pickerStyle = ref({})

// Le picker est téléporté vers <body> (voir template) et positionné en `fixed` à partir du
// rect du bouton déclencheur — un `position: absolute` ancré à un wrapper en flux normal se
// faisait couper par l'`overflow-y: auto` de `.admin-content-area` (AdminView.vue) dès que la
// carte de contenu était proche du bas de la liste de résultats, rendant le menu invisible/
// inaccessible (voir CLAUDE.md). Repris du calcul déjà utilisé par RefLink.vue/HtmlSpanTooltip.vue
// pour le même problème géométrique, en plus simple (un menu sous un bouton, pas une bulle
// latérale) : à droite du bouton par défaut, retourné au-dessus s'il n'y a pas la place en dessous.
function computePickerPosition() {
  const rect = triggerRef.value?.getBoundingClientRect()
  if (!rect) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.max(8, Math.min(vw - PICKER_WIDTH - 8, rect.right - PICKER_WIDTH))
  const fitsBelow = rect.bottom + 6 + PICKER_MAX_HEIGHT <= vh
  const top = fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - 6 - PICKER_MAX_HEIGHT)
  pickerStyle.value = { top: `${top}px`, left: `${left}px` }
}

function closePicker() {
  pickerOpen.value = false
  window.removeEventListener('scroll', closePicker, true)
  window.removeEventListener('resize', closePicker)
}

function togglePicker() {
  if (!hasSession.value || !hasConnectedPlayers.value) return
  if (pickerOpen.value) { closePicker(); return }
  computePickerPosition()
  pickerOpen.value = true
  // Le picker est en position fixed calculée une fois à l'ouverture — si la liste de résultats
  // (ou la fenêtre) scrolle pendant qu'il est ouvert, il se détacherait visuellement du bouton ;
  // plus simple et plus sûr de le refermer que de recalculer sa position en continu.
  window.addEventListener('scroll', closePicker, true)
  window.addEventListener('resize', closePicker)
}
function sendTo(playerId) {
  const socket = getSocket(authStore.token)
  socket.emit(SEND_MESSAGE, {
    sessionId: sessionStore.activeSession.id,
    toPlayerId: playerId === 'all' ? null : playerId,
    type: 'content',
    content: JSON.stringify({ contentType: props.contentType, item: props.item }),
  })
  closePicker()
  sent.value = true
  setTimeout(() => { sent.value = false }, 1600)
}

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
        ref="triggerRef"
        type="button"
        class="ca-btn"
        :class="{ 'ca-btn-active': sent }"
        :disabled="!hasSession || !hasConnectedPlayers"
        :title="hasConnectedPlayers ? 'Envoyer à un joueur' : 'Aucun joueur connecté'"
        aria-haspopup="true"
        :aria-expanded="pickerOpen"
        @click="togglePicker"
      >
        <AppIcon :icon="sent ? 'lucide:check' : 'lucide:send'" size="0.8em" />
        {{ sent ? 'Envoyé' : 'Envoyer' }}
      </button>

      <!-- Téléporté vers <body> : un menu en `position: fixed` ancré au bouton (voir
           computePickerPosition) plutôt qu'en flux normal, pour échapper à l'overflow-y: auto
           de la liste de résultats qui le coupait — voir CLAUDE.md. -->
      <Teleport to="body">
        <div v-if="pickerOpen" class="ca-picker" :style="pickerStyle">
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
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.content-actions {
  display: flex;
  gap: var(--space-2);
}
.ca-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 0.25rem var(--space-3);
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.18s;
}
.ca-btn:hover:not(:disabled) { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }
.ca-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ca-btn-active { border-color: var(--color-success-border); color: var(--color-success); }

.ca-picker-wrap { position: relative; }
/* Téléporté vers <body> (voir template) : position: fixed calculée en JS (computePickerPosition),
   pas relative à .ca-picker-wrap — width fixe pour que le calcul JS (PICKER_WIDTH) reste exact,
   max-height doit rester alignée avec la constante JS (PICKER_MAX_HEIGHT). */
.ca-picker {
  position: fixed;
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: 180px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-medium);
  padding: var(--space-1);
}
.ca-picker-item {
  background: none;
  border: none;
  text-align: left;
  padding: var(--space-2) var(--space-2);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-body), sans-serif;
  font-size: var(--text-sm);
  cursor: pointer;
}
.ca-picker-item:hover { background: var(--surface-raised); color: var(--color-gold-bright); }
.ca-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}
</style>
