<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import { SHOW_PUZZLE, CLOSE_PUZZLE, PUZZLE_CELL_CLICKED } from '@/socket-events.js'
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  activePuzzle: { type: Object, default: null },
})

const emit = defineEmits(['puzzle-started', 'puzzle-closed'])

const puzzles = ref([])
const uploading = ref(false)
const uploadError = ref('')
const previewIframeRef = ref(null)
const pendingPuzzleClicks = ref([])
const dragOver = ref(false)

const sessionId = computed(() => sessionStore.activeSession?.id)

watch(() => props.activePuzzle, (puzzle) => {
  pendingPuzzleClicks.value = puzzle?.puzzleClicks ? [...puzzle.puzzleClicks] : []
}, { immediate: true })

async function loadPuzzles() {
  if (!sessionId.value) return
  try {
    const token = authStore.token
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId.value}/images?type=puzzle`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    puzzles.value = Array.isArray(data) ? data : []
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
    const res = await fetch(`${BACKEND_URL}/api/uploads/puzzle`, {
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
  socket.emit(SHOW_PUZZLE, { sessionId: sessionId.value, imageId: puzzle.id })
}

function closePuzzle() {
  const socket = getSocket()
  socket.emit(CLOSE_PUZZLE, { sessionId: sessionId.value })
}

function puzzleServeUrl(puzzle, seed) {
  if (!puzzle || !seed) return ''
  return `${BACKEND_URL}/api/puzzles/serve/${puzzle.id}?seed=${seed}`
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

onMounted(() => {
  loadPuzzles()
  const socket = getSocket()
  socket.on(PUZZLE_CELL_CLICKED, handleRemoteClick)
})

onUnmounted(() => {
  const socket = getSocket()
  if (socket) socket.off(PUZZLE_CELL_CLICKED, handleRemoteClick)
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
      <span>Déposer le puzzle HTML ici</span>
    </div>

    <div class="puzzle-upload-section">
      <label class="upload-label">
        <AppIcon icon="lucide:upload" size="1em" />
        Importer un puzzle HTML
        <input
          type="file"
          accept=".html,.htm"
          style="display:none"
          :disabled="uploading"
          @change="uploadPuzzle"
        />
      </label>
      <HelpTip id="puzzle.html" />
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

    <!-- Puzzle list -->
    <div v-if="puzzles.length" class="puzzle-list">
      <div
        v-for="puzzle in puzzles"
        :key="puzzle.id"
        class="puzzle-item"
        :class="{ active: activePuzzle?.puzzleImageId === puzzle.id }"
      >
        <span class="puzzle-name">
          <AppIcon icon="lucide:file-code" size="1em" />
          {{ puzzle.original_name || `Puzzle #${puzzle.id}` }}
        </span>
        <button
          class="show-btn"
          :disabled="!!activePuzzle"
          @click="showPuzzle(puzzle)"
        >
          <AppIcon icon="lucide:monitor-play" size="1em" />
          Afficher
        </button>
      </div>
    </div>
    <p v-else-if="!uploading" class="empty-hint">
      Aucun puzzle importé. Chargez un fichier HTML autonome.
    </p>
  </div>
</template>

<style scoped>
.puzzle-manager {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background: rgba(0, 0, 0, 0.65);
  border: 2px dashed var(--color-gold-dark);
  border-radius: 10px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
}

.drag-active > *:not(.drop-overlay) { opacity: 0.35; pointer-events: none; }

.puzzle-upload-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.upload-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text);
  transition: opacity 0.15s;
}
.upload-label:hover { opacity: 0.85; }

.upload-status { font-size: 0.8rem; color: var(--color-text-muted); }
.upload-error { font-size: 0.8rem; color: var(--color-danger, #e55); }

.active-puzzle-section {
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
  overflow: hidden;
}

.active-puzzle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--surface-highlight);
  font-size: 0.85rem;
}

.active-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: var(--color-gold, #d4af37);
}

.close-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
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
  background: #fff;
}

.puzzle-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.puzzle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--surface-raised);
  border: 1px solid var(--color-border, #444);
  border-radius: 6px;
  gap: 0.5rem;
}
.puzzle-item.active {
  border-color: var(--color-gold-dark);
}

.puzzle-name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.show-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 4px;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.show-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-hint {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  text-align: center;
  padding: 1rem 0;
}
</style>
