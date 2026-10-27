<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import InteractiveStage from '../InteractiveStage.vue'
import {
  SHOW_PUZZLE, CLOSE_PUZZLE, PUZZLE_CELL_CLICKED, PUZZLE_RESYNC,
  SHOW_INTERACTIVE, CLOSE_INTERACTIVE, INTERACTIVE_STATE, INTERACTIVE_CLICK,
} from '@/socket-events.js'
import { BACKEND_URL } from '@/config.js'
import { apiFetch } from '@/utils/apiFetch.js'
import { bridgePlayers } from '@/utils/interactiveBridge.js'

// Onglet « Pages interactives » : deux types de page HTML autonome.
//  - puzzle : les joueurs cliquent, chacun sur son écran (relais de clics, voir socket.js) ;
//  - interactive : le MJ seul clique ici, la TV recopie, les joueurs ne voient rien.
const props = defineProps({
  activePuzzle: { type: Object, default: null },
  activeInteractive: { type: Object, default: null },
})

const emit = defineEmits(['puzzle-started', 'puzzle-closed', 'interactive-state', 'interactive-click'])

const KINDS = {
  interactive: { label: 'Page MJ', hint: 'Vous seul cliquez, la TV recopie' },
  puzzle: { label: 'Puzzle', hint: 'Les joueurs cliquent sur leur écran' },
}

const puzzles = ref([])
const uploadKind = ref('interactive')
const uploading = ref(false)
const uploadError = ref('')
const previewIframeRef = ref(null)
const pendingPuzzleClicks = ref([])
const dragOver = ref(false)
// Bumped on each applied resync to cache-bust the preview iframe src and force a reload — see
// handlePuzzleResync. lastPuzzleClickCount tracks the click count already applied locally.
const puzzleResyncNonce = ref(0)
const lastPuzzleClickCount = ref(0)

const sessionId = computed(() => sessionStore.activeSession?.id)

watch(() => props.activePuzzle, (puzzle) => {
  pendingPuzzleClicks.value = puzzle?.puzzleClicks ? [...puzzle.puzzleClicks] : []
  lastPuzzleClickCount.value = pendingPuzzleClicks.value.length
}, { immediate: true })

async function loadPuzzles() {
  if (!sessionId.value) return
  try {
    const token = authStore.token
    const lists = await Promise.all(['interactive', 'puzzle'].map(async type => {
      const res = await apiFetch(`/api/sessions/${sessionId.value}/images?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    }))
    puzzles.value = lists.flat()
  } catch (err) {
    console.error('[PuzzleManager] loadPuzzles:', err)
  }
}

async function uploadFile(file) {
  if (!file || !sessionId.value) return
  uploadError.value = ''
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('session_id', String(sessionId.value))
    formData.append('file', file)
    const res = await apiFetch(`/api/uploads/${uploadKind.value}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.token}` },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) { uploadError.value = data.error || 'Erreur upload.'; return }
    await loadPuzzles()
  } catch (err) {
    uploadError.value = 'Erreur réseau.'
  } finally {
    uploading.value = false
  }
}

function uploadPuzzle(event) {
  const file = event.target.files?.[0]
  uploadFile(file)
  event.target.value = ''
}

function onDragOver(e) {
  if (uploading.value || !sessionId.value) return
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = false
}

function onDrop(e) {
  e.preventDefault()
  dragOver.value = false
  if (uploading.value || !sessionId.value) return
  const file = Array.from(e.dataTransfer.files).find(f => /\.html?$/i.test(f.name))
  if (file) uploadFile(file)
}

function showPuzzle(puzzle) {
  const socket = getSocket()
  const event = puzzle.type === 'interactive' ? SHOW_INTERACTIVE : SHOW_PUZZLE
  socket.emit(event, { sessionId: sessionId.value, imageId: puzzle.id })
}

function closeInteractive() {
  getSocket().emit(CLOSE_INTERACTIVE, { sessionId: sessionId.value })
}

const anythingActive = computed(() => !!props.activePuzzle || !!props.activeInteractive)

function isActive(puzzle) {
  return puzzle.type === 'interactive'
    ? props.activeInteractive?.imageId === puzzle.id
    : props.activePuzzle?.puzzleImageId === puzzle.id
}

const interactiveSrc = computed(() => {
  const ai = props.activeInteractive
  if (!ai?.imageId || !ai?.seed) return ''
  return `${BACKEND_URL}/api/interactive/serve/${ai.imageId}?seed=${ai.seed}`
})

// Lue au chargement de la page seulement (dmt:init) : pas de resynchronisation ensuite.
const interactivePlayers = computed(() => bridgePlayers(sessionStore.players, BACKEND_URL))

function onInteractiveState(state) {
  getSocket().emit(INTERACTIVE_STATE, { sessionId: sessionId.value, state })
  emit('interactive-state', state)
}

function onInteractiveClick(path) {
  getSocket().emit(INTERACTIVE_CLICK, { sessionId: sessionId.value, path })
  emit('interactive-click', path)
}

function closePuzzle() {
  const socket = getSocket()
  socket.emit(CLOSE_PUZZLE, { sessionId: sessionId.value })
}

async function deletePuzzle(puzzle) {
  if (!confirm(`Supprimer "${puzzle.original_name || `Page #${puzzle.id}`}" ?`)) return
  try {
    const res = await apiFetch(`/api/sessions/${sessionId.value}/images/${puzzle.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) await loadPuzzles()
  } catch (err) {
    console.error('[PuzzleManager] deletePuzzle:', err)
  }
}

function puzzleServeUrl(puzzle, seed) {
  if (!puzzle || !seed) return ''
  return `${BACKEND_URL}/api/puzzles/serve/${puzzle.id}?seed=${seed}&r=${puzzleResyncNonce.value}`
}

function onPreviewLoad() {
  const win = previewIframeRef.value?.contentWindow
  if (!win) return
  for (const path of pendingPuzzleClicks.value) {
    win.postMessage({ type: 'puzzle-remote-click', path }, '*')
  }
  pendingPuzzleClicks.value = []
}

// Forward clicks received from socket to the preview iframe
function handleRemoteClick({ path }) {
  previewIframeRef.value?.contentWindow?.postMessage({ type: 'puzzle-remote-click', path }, '*')
}

// Périodique (~20s), pas de lock sur puzzle-click : si le compte de clics a grandi depuis le
// dernier resync, on recharge l'aperçu depuis zéro (nonce dans puzzleServeUrl) et on rejoue tout
// l'historique canonique dans l'ordre serveur.
function handlePuzzleResync({ puzzleClicks: clicks }) {
  if (!props.activePuzzle) return
  const list = Array.isArray(clicks) ? clicks : []
  if (list.length === lastPuzzleClickCount.value) return
  lastPuzzleClickCount.value = list.length
  pendingPuzzleClicks.value = [...list]
  puzzleResyncNonce.value++
}

onMounted(() => {
  loadPuzzles()
  const socket = getSocket()
  socket.on(PUZZLE_CELL_CLICKED, handleRemoteClick)
  socket.on(PUZZLE_RESYNC, handlePuzzleResync)
})

onUnmounted(() => {
  const socket = getSocket()
  if (socket) {
    socket.off(PUZZLE_CELL_CLICKED, handleRemoteClick)
    socket.off(PUZZLE_RESYNC, handlePuzzleResync)
  }
})
</script>

<template>
  <div
    class="puzzle-manager"
    :class="{ 'drag-active': dragOver }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="dragOver" class="drop-overlay">
      <AppIcon icon="lucide:file-code" size="2rem" color="var(--color-gold-bright)" />
      <span>Déposer la page HTML ici ({{ KINDS[uploadKind].label }})</span>
    </div>

    <div class="puzzle-upload-section">
      <div class="kind-picker" role="radiogroup" aria-label="Type de page à importer">
        <button
          v-for="(kind, key) in KINDS"
          :key="key"
          type="button"
          role="radio"
          class="kind-option"
          :class="{ selected: uploadKind === key }"
          :aria-checked="uploadKind === key"
          :title="kind.hint"
          :data-testid="`upload-kind-${key}`"
          @click="uploadKind = key"
        >
          {{ kind.label }}
        </button>
      </div>
      <label class="upload-label">
        <AppIcon icon="lucide:upload" size="1em" />
        Importer une page HTML
        <input
          type="file"
          accept=".html,.htm"
          style="display:none"
          :disabled="uploading"
          @change="uploadPuzzle"
        />
      </label>
      <HelpTip :id="uploadKind === 'interactive' ? 'interactive.html' : 'puzzle.html'" />
      <span v-if="uploading" class="upload-status">Envoi…</span>
      <span v-if="uploadError" class="upload-error">{{ uploadError }}</span>
    </div>

    <!-- Active puzzle preview (read-only) -->
    <div v-if="activePuzzle" class="active-puzzle-section">
      <div class="active-puzzle-header">
        <span class="active-label"><AppIcon icon="lucide:puzzle" size="1em" /> Puzzle actif</span>
        <button class="close-btn" @click="closePuzzle">
          <AppIcon icon="lucide:x" size="1em" /> Fermer
        </button>
      </div>
      <iframe
        ref="previewIframeRef"
        :src="puzzleServeUrl({ id: activePuzzle.puzzleImageId }, activePuzzle.puzzleSeed)"
        class="puzzle-preview-iframe"
        sandbox="allow-scripts"
        title="Aperçu puzzle (lecture seule)"
        style="pointer-events: none"
        @load="onPreviewLoad"
      />
    </div>

    <!-- Active interactive page (MJ only: clickable here, mirrored on the TV) -->
    <div v-if="activeInteractive && interactiveSrc" class="active-puzzle-section active-interactive-section">
      <div class="active-puzzle-header">
        <span class="active-label"><AppIcon icon="lucide:monitor-play" size="1em" /> Page interactive — vous seul cliquez</span>
        <button class="close-btn" data-testid="interactive-close" @click="closeInteractive">
          <AppIcon icon="lucide:x" size="1em" /> Fermer
        </button>
      </div>
      <InteractiveStage
        :src="interactiveSrc"
        role="gm"
        :players="interactivePlayers"
        :state="activeInteractive.state"
        :clicks="activeInteractive.clicks"
        @state="onInteractiveState"
        @click="onInteractiveClick"
      />
    </div>

    <!-- Puzzle list -->
    <div v-if="puzzles.length" class="puzzle-list">
      <div
        v-for="puzzle in puzzles"
        :key="puzzle.id"
        class="puzzle-item"
        :class="{ active: isActive(puzzle) }"
        :data-kind="puzzle.type"
      >
        <span class="puzzle-name">
          <AppIcon :icon="puzzle.type === 'interactive' ? 'lucide:monitor-play' : 'lucide:puzzle'" size="1em" />
          {{ puzzle.original_name || `Page #${puzzle.id}` }}
          <span class="kind-badge" :class="puzzle.type">{{ KINDS[puzzle.type]?.label }}</span>
        </span>
        <div class="puzzle-actions">
          <button
            class="show-btn"
            :disabled="anythingActive"
            @click="showPuzzle(puzzle)"
          >
            <AppIcon icon="lucide:monitor-play" size="1em" />
            Afficher
          </button>
          <button
            class="delete-btn"
            title="Supprimer"
            :disabled="isActive(puzzle)"
            @click="deletePuzzle(puzzle)"
          >
            <AppIcon icon="lucide:trash-2" size="1em" />
          </button>
        </div>
      </div>
    </div>
    <p v-else-if="!uploading" class="empty-hint">
      Aucune page importée. Chargez un fichier HTML autonome : une page MJ (vous seul cliquez, la TV recopie) ou un puzzle (les joueurs cliquent).
    </p>
  </div>
</template>

<style scoped>
.puzzle-manager {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-2) 0;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: var(--overlay-scrim);
  border: 2px dashed var(--color-gold-dark);
  border-radius: 10px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: var(--text-base);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
}

.drag-active > *:not(.drop-overlay) { opacity: 0.35; pointer-events: none; }

.puzzle-upload-section {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.upload-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--text-base);
  color: var(--color-text-on-accent);
  transition: opacity 0.15s;
}
.upload-label:hover { opacity: 0.85; }

.kind-picker {
  display: inline-flex;
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  overflow: hidden;
}
.kind-option {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  background: transparent;
  border: none;
  color: var(--color-text);
  cursor: pointer;
}
.kind-option + .kind-option { border-left: 1px solid var(--color-gold-dark); }
.kind-option.selected { background: var(--surface-highlight); color: var(--color-gold-bright); font-weight: 600; }

.kind-badge {
  flex-shrink: 0;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border, #444);
  color: var(--color-text-muted);
}
.kind-badge.interactive { border-color: var(--color-gold-dark); color: var(--color-gold-bright); }

.upload-status { font-size: var(--text-sm); color: var(--color-text-muted); }
.upload-error { font-size: var(--text-sm); color: var(--color-danger, #e55); }

.active-puzzle-section {
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  overflow: hidden;
}

.active-puzzle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-highlight);
  font-size: var(--text-base);
}

.active-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  color: var(--color-gold, #d4af37);
}

.close-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  background: transparent;
  border: 1px solid var(--color-border, #444);
  border-radius: 4px;
  color: var(--color-text);
  cursor: pointer;
}
.close-btn:hover { background: var(--surface-raised); }

.puzzle-preview-iframe {
  width: 100%;
  height: 400px;
  border: none;
  background: var(--color-invariant-white);
}

.puzzle-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.puzzle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-raised);
  border: 1px solid var(--color-border, #444);
  border-radius: 6px;
  gap: var(--space-2);
}
.puzzle-item.active {
  border-color: var(--color-gold-dark);
}

.puzzle-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.show-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 4px;
  color: var(--color-text-on-accent);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.show-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.puzzle-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1) var(--space-2);
  background: transparent;
  border: 1px solid var(--color-border, #444);
  border-radius: 4px;
  color: var(--color-danger, #e55);
  cursor: pointer;
}
.delete-btn:hover { background: var(--surface-raised); border-color: var(--color-danger, #e55); }
.delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-4) 0;
}
</style>
