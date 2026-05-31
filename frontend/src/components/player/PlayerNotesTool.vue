<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { sessionStore } from '@/stores/session.js'
import AppIcon from '../AppIcon.vue'

const notesText = ref('')
const drawColor = ref('')
const drawLineWidth = ref(2)
const drawEnabled = ref(true)
const CANVAS_DIMENSION_FALLBACK = 1

const canvasRef = ref(null)
let ctx = null
let drawing = false
let lastPoint = null
let saveTimer = null

const storageKey = computed(() => {
  const sessionId = sessionStore.activeSession?.id ?? 'none'
  const playerId = sessionStore.playerInfo?.id ?? 'none'
  return `player-notes:${sessionId}:${playerId}`
})

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const canvas = canvasRef.value
    if (!canvas) return
    const payload = {
      text: notesText.value,
      image: canvas.toDataURL('image/png'),
    }
    localStorage.setItem(storageKey.value, JSON.stringify(payload))
  }, 150)
}

function resolveThemeColor(variableName, fallback) {
  if (typeof window === 'undefined') return fallback
  const source = canvasRef.value || document.documentElement
  const value = source ? getComputedStyle(source).getPropertyValue(variableName).trim() : ''
  return value || fallback
}

function clearCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  scheduleSave()
}
function clearAll() {
  notesText.value = ''
  clearCanvas()
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const previous = document.createElement('canvas')
  previous.width = Math.max(CANVAS_DIMENSION_FALLBACK, canvas.width)
  previous.height = Math.max(CANVAS_DIMENSION_FALLBACK, canvas.height)
  const previousCtx = previous.getContext('2d')
  previousCtx.drawImage(canvas, 0, 0)

  const width = Math.max(280, Math.floor(canvas.clientWidth))
  const height = Math.max(180, Math.floor(canvas.clientHeight))
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)

  ctx.fillStyle = resolveThemeColor('--notes-canvas-bg', 'transparent')
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(previous, 0, 0, width, height)
}

function getPoint(event) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function beginDraw(event) {
  if (!drawEnabled.value || !ctx) return
  drawing = true
  lastPoint = getPoint(event)
}

function moveDraw(event) {
  if (!drawing || !drawEnabled.value || !ctx || !lastPoint) return
  const p = getPoint(event)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = drawColor.value
  ctx.lineWidth = drawLineWidth.value
  ctx.beginPath()
  ctx.moveTo(lastPoint.x, lastPoint.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  lastPoint = p
}

function endDraw() {
  if (!drawing) return
  drawing = false
  lastPoint = null
  scheduleSave()
}

function loadSavedNotes() {
  const raw = localStorage.getItem(storageKey.value)
  if (!raw) {
    notesText.value = ''
    clearCanvas()
    return
  }
  try {
    const parsed = JSON.parse(raw)
    notesText.value = parsed.text || ''
    clearCanvas()
    if (parsed.image) {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.value
        if (!canvas || !ctx) return
        ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight)
      }
      img.src = parsed.image
    }
  } catch {
    notesText.value = ''
    clearCanvas()
  }
}

watch(notesText, () => scheduleSave())
watch(storageKey, () => loadSavedNotes())

onMounted(() => {
  drawColor.value = resolveThemeColor('--notes-draw-color', resolveThemeColor('--color-parchment', 'currentColor'))
  resizeCanvas()
  loadSavedNotes()
  window.addEventListener('resize', resizeCanvas)
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <div class="notes-tool">
    <textarea
      v-model="notesText"
      class="notes-textarea"
      placeholder="Notes rapides de combat, rappels, actions..."
      rows="6"
    />

    <div class="draw-toolbar">
      <label class="toolbar-item">
        <AppIcon icon="lucide:pencil" size="0.85em" /> Couleur
        <input v-model="drawColor" type="color" class="color-input" />
      </label>
      <label class="toolbar-item">
        Épaisseur
        <input v-model.number="drawLineWidth" type="range" min="1" max="8" />
      </label>
      <button class="tool-btn" @click="drawEnabled = !drawEnabled">
        <AppIcon :icon="drawEnabled ? 'lucide:lock' : 'lucide:pencil'" size="0.85em" />
        {{ drawEnabled ? 'Verrouiller dessin' : 'Activer dessin' }}
      </button>
      <button class="tool-btn danger" @click="clearAll">
        <AppIcon icon="lucide:eraser" size="0.85em" /> Effacer
      </button>
    </div>

    <canvas
      ref="canvasRef"
      class="notes-canvas"
      @pointerdown.prevent="beginDraw"
      @pointermove.prevent="moveDraw"
      @pointerup.prevent="endDraw"
      @pointerleave.prevent="endDraw"
      @pointercancel.prevent="endDraw"
    />
    <p class="hint">Compatible tactile/stylet (tablette) — glissez pour écrire à la main.</p>
  </div>
</template>

<style scoped>
.notes-tool { display: flex; flex-direction: column; gap: 0.6rem; }
.notes-textarea {
  width: 100%;
  resize: vertical;
  min-height: 120px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--player-control-bg, var(--surface-raised));
  color: var(--color-parchment);
  padding: 0.7rem;
  font-family: var(--font-body), sans-serif;
  line-height: 1.45;
}
.notes-textarea:focus { outline: none; border-color: var(--color-gold-dark); }
.draw-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.toolbar-item { font-size: 0.7rem; color: var(--color-text-dim); display: inline-flex; gap: 0.35rem; align-items: center; }
.color-input { width: 30px; height: 24px; padding: 0; border: 1px solid var(--color-border); background: transparent; border-radius: 6px; }
.tool-btn {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--player-control-bg, var(--surface-raised));
  color: var(--color-parchment);
  padding: 0.35rem 0.55rem;
  font-size: 0.68rem;
  cursor: pointer;
  font-family: var(--font-heading), sans-serif;
}
.tool-btn.danger { border-color: var(--player-danger-border, var(--color-danger-border)); color: var(--player-danger-text, var(--color-danger)); }
.notes-canvas {
  width: 100%;
  min-height: 220px;
  height: 28dvh;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--surface-ghost);
  touch-action: none;
  display: block;
}
.hint { margin: 0; font-size: 0.7rem; color: var(--color-text-dim); }
</style>
