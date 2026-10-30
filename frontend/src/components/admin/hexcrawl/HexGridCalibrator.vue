<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from '../../AppIcon.vue'
import HelpTip from '../../HelpTip.vue'
import { BACKEND_URL } from '@/config.js'
import { getCellAt, getCellCenter, getCellPolygon } from '@/utils/mapGrid.js'
import { calibrateGrid, hexLabel, labelOffsetsFor, parseHexCode } from '@/utils/hexcrawl.js'

// Étape « Hexagones » de l'assistant. Rien n'est enregistré ici : tout passe par `grid` / `labels`,
// l'assistant persiste au passage à l'étape suivante.
const props = defineProps({
  imageUrl: { type: String, required: true },
  grid: { type: Object, required: true },
  labels: { type: Object, required: true },
  detecting: { type: Boolean, default: false },
  detectMessage: { type: String, default: '' },
})
const emit = defineEmits(['update:grid', 'update:labels', 'detect'])

const canvasEl = ref(null)
const wrapEl = ref(null)
const image = ref(null)
const hoverCell = ref(-1)
const showCodes = ref(true)
// Calage en 2 clics : 'idle' | 'first' | 'second'
const pick = ref('idle')
const codeA = ref('A1')
const codeB = ref('')
const firstClick = ref(null)
const calibrateError = ref('')
let resizeObserver = null
let frame = null
let drag = null

const gridArgs = computed(() => {
  const g = props.grid
  return ['hex', g.cols, g.rows, g.orientation, g.offsetX, g.offsetY, g.cellW, g.cellH]
})

// Taille réelle d'une case, même quand elle est encore dérivée de cols/rows (cellW/H nuls).
const cellSize = computed(() => {
  const poly = getCellPolygon(0, ...gridArgs.value)
  const xs = poly.map(p => p.nx)
  const ys = poly.map(p => p.ny)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
})

const hoverLabel = computed(() => hexLabel(hoverCell.value, props.grid.cols, props.labels))

function patch(values) { emit('update:grid', { ...props.grid, ...values }) }

function layout() {
  const canvas = canvasEl.value
  const img = image.value
  if (!canvas || !img) return null
  const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h }
}

function tracePoly(ctx, poly, l) {
  ctx.beginPath()
  poly.forEach((p, i) => {
    const x = l.x + p.nx * l.w
    const y = l.y + p.ny * l.h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function draw() {
  frame = null
  const canvas = canvasEl.value
  const l = layout()
  if (!canvas || !l) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image.value, l.x, l.y, l.w, l.h)
  const g = props.grid
  ctx.strokeStyle = cssVar('--color-gold-bright')
  ctx.lineWidth = 1.2
  ctx.beginPath()
  const total = g.cols * g.rows
  for (let idx = 0; idx < total; idx++) {
    getCellPolygon(idx, ...gridArgs.value).forEach((p, i) => {
      const x = l.x + p.nx * l.w
      const y = l.y + p.ny * l.h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
  }
  ctx.closePath()
  ctx.stroke()
  if (hoverCell.value >= 0) {
    tracePoly(ctx, getCellPolygon(hoverCell.value, ...gridArgs.value), l)
    ctx.globalAlpha = 0.35
    ctx.fillStyle = cssVar('--color-gold-bright')
    ctx.fill()
    ctx.globalAlpha = 1
  }
  if (showCodes.value && cellSize.value.w * l.w >= 26) {
    ctx.font = `bold ${Math.max(9, Math.min(14, cellSize.value.w * l.w * 0.22))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillStyle = '#fff'
    for (let idx = 0; idx < total; idx++) {
      const c = getCellCenter(idx, ...gridArgs.value)
      const label = hexLabel(idx, g.cols, props.labels)
      ctx.strokeText(label, l.x + c.nx * l.w, l.y + c.ny * l.h)
      ctx.fillText(label, l.x + c.nx * l.w, l.y + c.ny * l.h)
    }
  }
  if (firstClick.value) {
    ctx.beginPath()
    ctx.arc(l.x + firstClick.value.nx * l.w, l.y + firstClick.value.ny * l.h, 6, 0, Math.PI * 2)
    ctx.fillStyle = cssVar('--color-danger')
    ctx.fill()
  }
}

function schedule() {
  if (frame == null) frame = requestAnimationFrame(draw)
}

function fitCanvas() {
  const wrap = wrapEl.value
  const canvas = canvasEl.value
  if (!wrap || !canvas) return
  const rect = wrap.getBoundingClientRect()
  canvas.width = Math.round(rect.width)
  canvas.height = Math.round(rect.height)
  // Redimensionner vide le canvas : redessiner tout de suite évite un flash noir.
  draw()
}

function eventToNorm(e) {
  const canvas = canvasEl.value
  const l = layout()
  if (!canvas || !l) return null
  const rect = canvas.getBoundingClientRect()
  return {
    nx: ((e.clientX - rect.left) - l.x) / l.w,
    ny: ((e.clientY - rect.top) - l.y) / l.h,
  }
}

function startCalibration() {
  calibrateError.value = ''
  firstClick.value = null
  if (!codeB.value) codeB.value = hexLabel(props.grid.cols * props.grid.rows - 1, props.grid.cols, { labelColOffset: 0, labelRowOffset: 0 })
  pick.value = 'first'
  canvasEl.value?.focus()
}

function finishCalibration(second) {
  const a = parseHexCode(codeA.value)
  const b = parseHexCode(codeB.value)
  if (!a || !b) {
    calibrateError.value = 'Codes illisibles : utilisez une lettre et un nombre, par exemple A1 et T14.'
    pick.value = 'idle'
    firstClick.value = null
    return
  }
  const solved = calibrateGrid(props.grid.orientation, { ...a, ...firstClick.value }, { ...b, ...second })
  pick.value = 'idle'
  firstClick.value = null
  if (!solved) {
    calibrateError.value = 'Ces deux cases ne suffisent pas : choisissez-les dans des colonnes et des lignes différentes, en haut à gauche puis en bas à droite.'
    return
  }
  // La case du bas à droite donne aussi l'étendue de la carte.
  emit('update:grid', {
    ...props.grid,
    cols: Math.max(a.col, b.col) + 1,
    rows: Math.max(a.row, b.row) + 1,
    cellW: solved.cellW,
    cellH: solved.cellH,
    offsetX: solved.offsetX,
    offsetY: solved.offsetY,
  })
  emit('update:labels', { labelColOffset: 0, labelRowOffset: 0 })
}

function onPointerDown(e) {
  if (e.button !== 0) return
  const norm = eventToNorm(e)
  if (!norm) return
  canvasEl.value?.focus()
  if (pick.value === 'first') {
    firstClick.value = norm
    pick.value = 'second'
    schedule()
    return
  }
  if (pick.value === 'second') {
    finishCalibration(norm)
    return
  }
  canvasEl.value.setPointerCapture(e.pointerId)
  drag = { x: norm.nx, y: norm.ny, offsetX: props.grid.offsetX, offsetY: props.grid.offsetY }
}

function onPointerMove(e) {
  const norm = eventToNorm(e)
  if (!norm) return
  if (drag) {
    patch({ offsetX: drag.offsetX + (norm.nx - drag.x), offsetY: drag.offsetY + (norm.ny - drag.y) })
    return
  }
  const cell = getCellAt(norm.nx, norm.ny, ...gridArgs.value)
  if (cell !== hoverCell.value) {
    hoverCell.value = cell
    schedule()
  }
}

function onPointerUp() { drag = null }
function onPointerLeave() {
  if (drag) return
  hoverCell.value = -1
  schedule()
}

// Molette : taille des cases autour du pointeur ; Maj/Alt : largeur ou hauteur seule.
function onWheel(e) {
  const norm = eventToNorm(e)
  if (!norm) return
  const factor = e.deltaY < 0 ? 1.004 : 1 / 1.004
  const g = props.grid
  const { cellW, cellH } = effectiveCell()
  const fx = e.altKey ? 1 : factor
  const fy = e.shiftKey ? 1 : factor
  patch({
    cellW: cellW * fx,
    cellH: cellH * fy,
    offsetX: norm.nx - (norm.nx - g.offsetX) * fx,
    offsetY: norm.ny - (norm.ny - g.offsetY) * fy,
  })
}

function effectiveCell() {
  return { cellW: cellSize.value.w, cellH: cellSize.value.h }
}

function onKeydown(e) {
  const step = e.shiftKey ? 0.005 : 0.0005
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const move = moves[e.key]
  if (!move) return
  e.preventDefault()
  patch({ offsetX: props.grid.offsetX + move[0], offsetY: props.grid.offsetY + move[1] })
}

// Échap annule le calage ou le renommage en cours, où que soit le focus, sans fermer l'assistant
// (qui écoute la même touche sur document, en phase de remontée).
function onEscapeCapture(e) {
  if (e.key !== 'Escape' || (pick.value === 'idle' && relabelCell.value < 0)) return
  e.preventDefault()
  relabelCell.value = -1
  pick.value = 'idle'
  firstClick.value = null
  schedule()
}

// Largeur/hauteur en % affichés : plus lisible que la valeur normalisée.
function setCellPercent(key, value) {
  const { cellW, cellH } = effectiveCell()
  patch({ cellW, cellH, [key]: Number(value) / 100 })
}

function fitToImage() {
  const g = props.grid
  if (g.orientation === 'pointy') {
    patch({ cellW: 1 / (g.cols + 0.5), cellH: 1 / (g.rows * 0.75 + 0.25), offsetX: 0, offsetY: 0 })
  } else {
    patch({ cellW: 1 / (g.cols * 0.75 + 0.25), cellH: 1 / (g.rows + 0.5), offsetX: 0, offsetY: 0 })
  }
}

// Calibration d'une seule case : quand la grille tombe juste mais que les codes sont décalés.
const relabelCell = ref(-1)
const relabelValue = ref('')
function onDblClick(e) {
  const norm = eventToNorm(e)
  if (!norm) return
  const cell = getCellAt(norm.nx, norm.ny, ...gridArgs.value)
  if (cell < 0) return
  relabelCell.value = cell
  relabelValue.value = hexLabel(cell, props.grid.cols, props.labels)
  nextTick(() => document.getElementById('hex-relabel-input')?.select())
}
function applyRelabel() {
  const offsets = labelOffsetsFor(relabelCell.value, props.grid.cols, relabelValue.value)
  if (offsets) emit('update:labels', offsets)
  relabelCell.value = -1
}

function loadImage(url) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    image.value = img
    fitCanvas()
  }
  img.src = url.startsWith('http') ? url : `${BACKEND_URL}${url}`
}

watch(() => props.imageUrl, loadImage)
watch(() => [props.grid, props.labels, showCodes.value], schedule, { deep: true })

onMounted(() => {
  loadImage(props.imageUrl)
  document.addEventListener('keydown', onEscapeCapture, true)
  resizeObserver = new ResizeObserver(fitCanvas)
  if (wrapEl.value) resizeObserver.observe(wrapEl.value)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscapeCapture, true)
  resizeObserver?.disconnect()
  if (frame != null) cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="calibrator">
    <div class="preview-col">
      <p class="pick-banner" :class="{ active: pick !== 'idle' }" role="status">
        <template v-if="pick === 'first'"><strong>1/2</strong> Cliquez le centre de la case <strong>{{ codeA }}</strong> · Échap pour annuler</template>
        <template v-else-if="pick === 'second'"><strong>2/2</strong> Cliquez le centre de la case <strong>{{ codeB }}</strong> · Échap pour annuler</template>
        <template v-else-if="hoverCell >= 0">Case <strong>{{ hoverLabel }}</strong> · glisser pour déplacer · molette pour la taille · double-clic pour corriger un code</template>
        <template v-else>Glisser pour déplacer · molette pour la taille (Maj : hauteur, Alt : largeur) · flèches pour affiner</template>
      </p>
      <div ref="wrapEl" class="canvas-wrap" :class="{ picking: pick !== 'idle' }">
        <canvas
          ref="canvasEl"
          tabindex="0"
          aria-label="Aperçu de la carte et de sa grille"
          data-testid="hexcrawl-grid-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerLeave"
          @wheel.prevent="onWheel"
          @dblclick="onDblClick"
          @keydown="onKeydown"
        />
      </div>
      <form v-if="relabelCell >= 0" class="relabel" @submit.prevent="applyRelabel">
        <label for="hex-relabel-input">Code imprimé sur cette case</label>
        <input id="hex-relabel-input" v-model="relabelValue" class="form-input short-input" maxlength="6" />
        <button type="submit" class="wiz-btn">Appliquer à la grille</button>
        <button type="button" class="wiz-btn ghost" @click="relabelCell = -1">Annuler</button>
      </form>
    </div>

    <aside class="controls-col">
      <section class="ctl-card highlight">
        <h4><AppIcon icon="lucide:mouse-pointer-click" size="0.9em" /> Caler en 2 clics <HelpTip id="hexcrawl.calibrate" /></h4>
        <div class="code-row">
          <label>Haut gauche <input v-model="codeA" class="form-input short-input" maxlength="6" data-testid="hexcrawl-code-a" @focus="$event.target.select()" /></label>
          <label>Bas droite <input v-model="codeB" class="form-input short-input" maxlength="6" :placeholder="hexLabel(grid.cols * grid.rows - 1, grid.cols)" data-testid="hexcrawl-code-b" @focus="$event.target.select()" /></label>
        </div>
        <button class="wiz-btn primary" data-testid="hexcrawl-calibrate" @click="startCalibration">
          <AppIcon icon="lucide:crosshair" size="0.9em" /> {{ pick === 'idle' ? 'Commencer' : 'Recommencer' }}
        </button>
        <p v-if="calibrateError" class="error-text" role="alert">{{ calibrateError }}</p>
      </section>

      <section class="ctl-card">
        <h4><AppIcon icon="lucide:hexagon" size="0.9em" /> Grille</h4>
        <div class="field-row">
          <label>Colonnes <input :value="grid.cols" type="number" min="1" max="100" class="form-input short-input" data-testid="hexcrawl-cols" @change="patch({ cols: Math.max(1, +$event.target.value || 1) })" /></label>
          <label>Lignes <input :value="grid.rows" type="number" min="1" max="100" class="form-input short-input" data-testid="hexcrawl-rows" @change="patch({ rows: Math.max(1, +$event.target.value || 1) })" /></label>
        </div>
        <div class="segmented" role="group" aria-label="Orientation des hexagones">
          <button :class="{ active: grid.orientation === 'flat' }" @click="patch({ orientation: 'flat' })">Base plate</button>
          <button :class="{ active: grid.orientation === 'pointy' }" @click="patch({ orientation: 'pointy' })">Pointe en haut</button>
        </div>
        <label class="slider-label">Largeur d'une case
          <input :value="cellSize.w * 100" type="range" min="1" max="30" step="0.01" @input="setCellPercent('cellW', $event.target.value)" />
        </label>
        <label class="slider-label">Hauteur d'une case
          <input :value="cellSize.h * 100" type="range" min="1" max="30" step="0.01" @input="setCellPercent('cellH', $event.target.value)" />
        </label>
        <div class="inline-btns">
          <button class="wiz-btn" :disabled="detecting" data-testid="hexcrawl-detect" @click="emit('detect')">
            <AppIcon icon="lucide:scan-search" size="0.9em" /> {{ detecting ? 'Détection…' : 'Détecter' }}
          </button>
          <button class="wiz-btn" @click="fitToImage"><AppIcon icon="lucide:maximize" size="0.9em" /> Ajuster à l'image</button>
        </div>
        <p v-if="detectMessage" class="hint" role="status">{{ detectMessage }}</p>
        <label class="check-label"><input v-model="showCodes" type="checkbox" /> Afficher les codes sur la carte</label>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.calibrator { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: var(--space-3); height: 100%; min-height: 0; }
.preview-col { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; min-width: 0; }
.pick-banner { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md, 8px); background: var(--surface-raised); color: var(--color-text-dim); font-size: var(--text-sm); }
.pick-banner.active { background: var(--surface-gold-soft); color: var(--color-text); border: 1px solid var(--color-gold-bright); }
.canvas-wrap { flex: 1; min-height: 240px; border-radius: 8px; overflow: hidden; background: var(--color-media-letterbox); border: 1px solid var(--color-border); cursor: grab; }
.canvas-wrap.picking { cursor: crosshair; }
canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.relabel { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; font-size: var(--text-sm); color: var(--color-text-dim); }
.controls-col { display: flex; flex-direction: column; gap: var(--space-3); overflow-y: auto; min-height: 0; }
.ctl-card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: 10px; background: var(--admin-panel-bg, var(--gradient-panel)); }
.ctl-card.highlight { border-color: var(--color-gold-dark); }
.ctl-card h4 { margin: 0; font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-gold-dark); }
.code-row, .field-row { display: flex; gap: var(--space-2); }
.code-row label, .field-row label { flex: 1; display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-xs); color: var(--color-text-dim); min-width: 0; }
.short-input { width: 100%; min-width: 0; min-height: var(--touch-min); padding: var(--space-1) var(--space-2); }
.segmented { display: flex; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.segmented button { flex: 1; padding: var(--space-2); background: none; border: none; color: var(--color-text-dim); font-size: var(--text-xs); cursor: pointer; }
.segmented button.active { background: var(--surface-gold-soft); color: var(--color-text); }
.slider-label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-xs); color: var(--color-text-dim); }
.slider-label input { accent-color: var(--color-gold); }
.inline-btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.check-label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--color-text-dim); cursor: pointer; }
.hint { margin: 0; font-size: var(--text-sm); color: var(--color-text-dim); }
.error-text { margin: 0; font-size: var(--text-sm); color: var(--color-danger); }
.wiz-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-radius: 8px; border: 1px solid var(--color-border); background: var(--surface-raised); color: var(--color-text); font-size: var(--text-sm); cursor: pointer; }
.wiz-btn:hover:not(:disabled) { border-color: var(--color-gold-dark); }
.wiz-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wiz-btn.primary { background: var(--gradient-accent-action); border-color: var(--color-gold-dark); color: var(--color-text-on-accent); }
.wiz-btn.ghost { background: none; }
@media (max-width: 900px) {
  .calibrator { grid-template-columns: 1fr; grid-template-rows: minmax(300px, 1fr) auto; }
}
</style>
