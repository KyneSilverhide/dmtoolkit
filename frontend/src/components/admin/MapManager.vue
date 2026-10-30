<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { sessionStore } from '@/stores/session.js'
import { authStore } from '@/stores/auth.js'
import AppIcon from '../AppIcon.vue'
import MapGallery from './map/MapGallery.vue'
import MapGridConfig from './map/MapGridConfig.vue'
import MapFogControls from './map/MapFogControls.vue'
import MapTokenPanel from './map/MapTokenPanel.vue'
import MapViewportControls from './map/MapViewportControls.vue'
import MapImageGroups from './map/MapImageGroups.vue'
import HexcrawlAlert from './hexcrawl/HexcrawlAlert.vue'
import HexcrawlPanel from './hexcrawl/HexcrawlPanel.vue'
import HexcrawlWizard from './hexcrawl/HexcrawlWizard.vue'
import { useMapUpload } from '@/composables/useMapUpload.js'
import { useMapSocket } from '@/composables/useMapSocket.js'
import { useHexcrawl } from '@/composables/useHexcrawl.js'
import { formatHours, hexLabel } from '@/utils/hexcrawl.js'
import { getCellAt, getCellPolygon, getCellNeighbors, getCellCenter, getCellsWithin } from '@/utils/mapGrid.js'
import { GROUP_TOKEN_ID, GROUP_TOKEN_NAME, visibleTokens, centerOfPlayerTokens } from '@/utils/mapTokens.js'
import { BACKEND_URL } from '@/config.js'
import { apiFetch } from '@/utils/apiFetch.js'

const MAX_BRUSH_RADIUS = 100
const MIN_BRUSH_RADIUS = 5
const DEFAULT_BRUSH_RADIUS = 30
const VIEWPORT_DEBOUNCE_MS = 150
const TOKEN_RADIUS = 26

// ── Upload composable ──────────────────────────────────────────────────────
const {
  images, uploading, uploadError, uploadProgress, dragOver,
  loadImages, uploadFiles, onDragOver, onDragLeave, onDrop, deleteImage,
} = useMapUpload()

// ── State ──────────────────────────────────────────────────────────────────
const selectedImageUrl = ref(null)
const isMapActive = ref(false)
const fogEnabled = ref(false)
const showMapList = ref(true)
const viewport = ref({ x: 0, y: 0, scale: 1 })
const fogStrokes = ref([])
const fogCells = ref([])
const mapTokens = ref({})
const groupToken = ref(false)
const customTokenName = ref('')
const pendingCustomToken = ref(false)
const pendingTokenPlayerId = ref(null)

const gridType = ref('none')
const gridCols = ref(20)
const gridRows = ref(15)
const gridHexOrientation = ref('flat')
const gridOffsetX = ref(0)
const gridOffsetY = ref(0)
// Taille de cellule normalisée (null = dérivée de cols/rows, voir mapGrid.js).
// Renseignée par la détection auto ; remise à null quand l'admin modifie
// manuellement le type, les colonnes, les lignes ou l'orientation.
const gridCellW = ref(null)
const gridCellH = ref(null)
const showGridConfig = ref(false)
const gridDetecting = ref(false)
const gridSaving = ref(false)
const selectedImageId = ref(null)
const brushRadius = ref(DEFAULT_BRUSH_RADIUS)

const canvasEl = ref(null)
const canvasContainer = ref(null)

// non-reactive internals
let mapImage = null
let fogCanvas = null
let fogMask = null
let resizeObserver = null
let viewportDebounceTimer = null
let pendingNormViewport = null
const avatarCache = {}
const fogCellsSet = new Set()

let isPainting = false
let isRevealingCells = false
// Un glisser démarré sur une case déjà révélée la re-masque (annulation) au lieu de révéler.
let isHidingCells = false
const isDragging = ref(false)
let dragStart = null
let dragViewportStart = null
let draggingTokenId = null
let tokenDragThrottleFrame = null

// ── Hexcrawl ───────────────────────────────────────────────────────────────
const {
  hexcrawl, config: hexConfig, status: hexStatus, load: loadHexcrawl,
  act: hexAct, undo: hexUndo, reset: hexReset, remove: hexRemove, register: registerHexcrawl, unregister: unregisterHexcrawl,
} = useHexcrawl({
  onChange: () => render(),
  neighbors: cell => (hexcrawlActive.value ? getCellNeighbors(cell, ...hexGridArgs()) : []),
})
const travelMode = ref(true)
const hardNext = ref(false)
const travelNotice = ref('')
const hoverCell = ref(-1)
const wizard = ref(null)   // null | { image, startStep }
const hexcrawlImageIds = ref([])
let noticeTimer = null

// Le panneau de voyage ne concerne que la carte réellement affichée, pas un simple aperçu de galerie.
const hexcrawlActive = computed(() => !!hexcrawl.value && hexcrawl.value.image_id === selectedImageId.value && gridType.value !== 'none')
const travelActive = computed(() => hexcrawlActive.value && travelMode.value)

// Une fois le hexcrawl en place, le voyage se joue sous brouillard : pas de bascule.
// La garde tourne aussi sur fogEnabled, reçu de façon asynchrone au chargement de la carte.
watch([hexcrawlActive, fogEnabled], ([active, fog]) => {
  if (active && !fog) mapSocket.emitToggleFog(true)
})

const combatStarted = computed(() => hexcrawlActive.value && hexStatus.value?.army?.alert === 'contact')
const restAlert = computed(() => hexcrawlActive.value && !!hexStatus.value?.restDue && !combatStarted.value)
// La pop-up de combat se ferme le temps du combat, et revient avec le contact suivant.
const combatDismissed = ref(false)
watch(combatStarted, () => { combatDismissed.value = false })

function hexGridArgs() {
  return [gridType.value, gridCols.value, gridRows.value, gridHexOrientation.value, gridOffsetX.value, gridOffsetY.value, gridCellW.value, gridCellH.value]
}

function cellCode(cell) {
  return hexLabel(cell, gridCols.value, hexConfig.value)
}

function showTravelNotice(text) {
  travelNotice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { travelNotice.value = '' }, 4000)
}

function revealCells(cells) {
  const added = cells.filter(c => c >= 0 && !fogCellsSet.has(c))
  if (!added.length) return
  added.forEach(c => fogCellsSet.add(c))
  fogCells.value = [...fogCellsSet]
  mapSocket.emitCellReveal(added)
}

function handleTravelClick(pos) {
  const cell = cellIdxAt(pos)
  if (cell < 0) return
  const status = hexStatus.value
  const center = getCellCenter(cell, ...hexGridArgs())
  if (!center) return
  const neighbors = getCellNeighbors(cell, ...hexGridArgs())
  if (!status.started) {
    // Comme le registre du Greffier : le groupe connaît sa case de départ et ses voisines.
    hexAct({ t: 'start', cell, nx: center.nx, ny: center.ny })
    revealCells([cell, ...neighbors])
    return
  }
  if (cell === status.position.cell) return
  if (status.army?.alert === 'contact') {
    showTravelNotice('Combat en cours : réglez la vague avant de repartir.')
    return
  }
  if (!neighbors.includes(status.position.cell)) {
    showTravelNotice(`${cellCode(cell)} n'est pas voisine de ${cellCode(status.position.cell)} : avancez case par case.`)
    return
  }
  if (status.outOfFuel) {
    showTravelNotice('Plus de carburant : ajoutez-en ou passez à pied.')
    return
  }
  hexAct({ t: 'step', cell, nx: center.nx, ny: center.ny, ...(hardNext.value ? { hard: true } : {}) })
  hardNext.value = false
  revealCells(hexConfig.value.revealNeighbors ? [cell, ...neighbors] : [cell])
}

function resetHexcrawl() {
  if (!confirm('Recommencer ce voyage ? Le journal, la piste et le brouillard de cette carte seront effacés.')) return
  fogCellsSet.clear()
  fogCells.value = []
  hexReset()
}

function removeHexcrawl() {
  if (!confirm('Retirer le hexcrawl de cette carte ? Le voyage et ses réglages seront perdus, la carte reste.')) return
  hexcrawlImageIds.value = hexcrawlImageIds.value.filter(id => id !== hexcrawl.value?.image_id)
  hexRemove()
}

function renderHexcrawlOverlay(ctx, layout) {
  const status = hexStatus.value
  if (!status) return
  const { offsetX, offsetY, imgW, imgH } = layout
  const toX = nx => offsetX + nx * imgW
  const toY = ny => offsetY + ny * imgH
  const args = hexGridArgs()
  const fillCell = (cell, color, alpha) => {
    const points = getCellPolygon(cell, ...args)
    if (!points.length) return
    ctx.beginPath()
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(toX(p.nx), toY(p.ny)) : ctx.lineTo(toX(p.nx), toY(p.ny))))
    ctx.closePath()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1
  }
  const gold = cssVar('--color-gold-bright')
  const danger = cssVar('--color-danger')
  ctx.save()
  if (travelActive.value && status.started && status.army?.alert !== 'contact') {
    const adjacent = getCellNeighbors(status.position.cell, ...args)
    if (!status.outOfFuel && status.movesLeftToday > 1) {
      const within = getCellsWithin(status.position.cell, status.movesLeftToday, args)
      for (const cell of within) if (!adjacent.includes(cell)) fillCell(cell, gold, 0.08)
    }
    if (!status.outOfFuel) for (const cell of adjacent) fillCell(cell, gold, 0.26)
  }
  if (status.trail.length > 1) {
    ctx.beginPath()
    status.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(toX(p.nx), toY(p.ny)) : ctx.lineTo(toX(p.nx), toY(p.ny))))
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.strokeStyle = gold
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
  if (status.army?.status === 'active' && status.army.nx != null) {
    const x = toX(status.army.nx)
    const y = toY(status.army.ny)
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fillStyle = danger
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText('⚔', x, y)
  }
  if (travelActive.value && hoverCell.value >= 0) {
    fillCell(hoverCell.value, gold, 0.3)
    const center = getCellCenter(hoverCell.value, ...args)
    if (center) {
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
      ctx.strokeText(cellCode(hoverCell.value), toX(center.nx), toY(center.ny))
      ctx.fillStyle = '#fff'
      ctx.fillText(cellCode(hoverCell.value), toX(center.nx), toY(center.ny))
    }
  }
  ctx.restore()
}

async function loadHexcrawlList() {
  if (!sessionStore.activeSession) { hexcrawlImageIds.value = []; return }
  try {
    const res = await apiFetch(`/api/sessions/${sessionStore.activeSession.id}/hexcrawls`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) hexcrawlImageIds.value = (await res.json()).map(h => h.image_id)
  } catch (err) { console.error(err) }
}

function openWizard(image = null, startStep = 0) {
  wizard.value = { image, startStep }
}

function editHexcrawl() {
  const image = images.value.find(i => i.id === hexcrawl.value?.image_id)
  if (image) openWizard(image, 3)
}

async function onWizardFinished({ image, launch }) {
  wizard.value = null
  await Promise.all([loadImages(), loadHexcrawlList()])
  const fresh = images.value.find(i => i.id === image.id) || image
  if (launch) {
    showMapOnTv(fresh)
    return
  }
  // Simple enregistrement : la TV ne change pas d'écran, elle reçoit seulement la grille recalée.
  if (selectedImageId.value === fresh.id) selectImage(fresh)
  if (hexcrawl.value?.image_id === fresh.id) {
    mapSocket.emitSyncGrid({
      gridType: fresh.grid_type, gridCols: fresh.grid_cols, gridRows: fresh.grid_rows,
      gridHexOrientation: fresh.grid_hex_orientation, gridOffsetX: parseFloat(fresh.grid_offset_x) || 0, gridOffsetY: parseFloat(fresh.grid_offset_y) || 0,
      gridCellW: parseFloat(fresh.grid_cell_w) || null, gridCellH: parseFloat(fresh.grid_cell_h) || null,
    })
  }
}

// ── Canvas helpers ─────────────────────────────────────────────────────────
// Couleurs du brouillard/grille/jetons : theme-invariant (voir style.css),
// lues via getComputedStyle plutôt que codées en dur ici.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function imageFullUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function fitCanvas() {
  const canvas = canvasEl.value
  const container = canvasContainer.value
  if (!canvas || !container) return
  const rect = container.getBoundingClientRect()
  const w = Math.round(rect.width)
  const h = Math.round(rect.height)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
}

function getLayout() {
  const canvas = canvasEl.value
  if (!canvas || !mapImage) return null
  const W = canvas.width
  const H = canvas.height
  const { x, y, scale } = viewport.value
  const baseScale = Math.min(W / mapImage.naturalWidth, H / mapImage.naturalHeight)
  const totalScale = baseScale * scale
  const imgW = mapImage.naturalWidth * totalScale
  const imgH = mapImage.naturalHeight * totalScale
  const offsetX = W / 2 - imgW / 2 + x
  const offsetY = H / 2 - imgH / 2 + y
  return { offsetX, offsetY, imgW, imgH, totalScale }
}

// ── Fog canvas (brush mode) ────────────────────────────────────────────────
function ensureFogCanvas() {
  if (!mapImage) return null
  const w = mapImage.naturalWidth
  const h = mapImage.naturalHeight
  if (!fogCanvas || fogCanvas.width !== w || fogCanvas.height !== h) {
    fogCanvas = document.createElement('canvas')
    fogCanvas.width = w
    fogCanvas.height = h
    fogMask = document.createElement('canvas')
    fogMask.width = w
    fogMask.height = h
    rebuildFogCanvas()
  }
  return fogCanvas
}

function rebuildFogMask() {
  if (!fogMask || !mapImage) return
  const mCtx = fogMask.getContext('2d')
  const w = fogMask.width
  const h = fogMask.height
  mCtx.clearRect(0, 0, w, h)
  mCtx.fillStyle = '#fff'
  mCtx.fillRect(0, 0, w, h)
  mCtx.globalCompositeOperation = 'destination-out'
  mCtx.fillStyle = '#000'
  for (const s of fogStrokes.value) {
    mCtx.beginPath()
    mCtx.arc(s.nx * w, s.ny * h, s.nr * w, 0, Math.PI * 2)
    mCtx.fill()
  }
  mCtx.globalCompositeOperation = 'source-over'
}

function rebuildFogCanvas() {
  ensureFogCanvas()
  if (!fogCanvas || !mapImage) return
  rebuildFogMask()
  renderFogFromMask()
}

function renderFogFromMask() {
  if (!fogCanvas || !fogMask) return
  const fCtx = fogCanvas.getContext('2d')
  const w = fogCanvas.width
  const h = fogCanvas.height
  fCtx.clearRect(0, 0, w, h)
  fCtx.globalCompositeOperation = 'source-over'
  fCtx.fillStyle = cssVar('--color-fog-wash')
  fCtx.fillRect(0, 0, w, h)
  fCtx.strokeStyle = cssVar('--color-fog-hatch')
  fCtx.lineWidth = 2
  const step = 36
  for (let i = -h; i < w + h; i += step) {
    fCtx.beginPath()
    fCtx.moveTo(i, 0)
    fCtx.lineTo(i + h, h)
    fCtx.stroke()
  }
  fCtx.globalCompositeOperation = 'destination-in'
  fCtx.drawImage(fogMask, 0, 0)
  fCtx.globalCompositeOperation = 'source-over'
}

function addStrokeToFog(stroke) {
  if (!fogMask || !mapImage) {
    ensureFogCanvas()
    if (!fogMask || !mapImage) return
  }
  const mCtx = fogMask.getContext('2d')
  mCtx.globalCompositeOperation = 'destination-out'
  mCtx.fillStyle = '#000'
  mCtx.beginPath()
  mCtx.arc(stroke.nx * fogMask.width, stroke.ny * fogMask.height, stroke.nr * fogMask.width, 0, Math.PI * 2)
  mCtx.fill()
  mCtx.globalCompositeOperation = 'source-over'
  renderFogFromMask()
}

// ── Grid rendering ─────────────────────────────────────────────────────────
function renderGridFog(ctx, layout) {
  if (!mapImage) return
  const { offsetX, offsetY, imgW, imgH } = layout
  const cols = gridCols.value
  const rows = gridRows.value
  const type = gridType.value
  const orientation = gridHexOrientation.value
  const gox = gridOffsetX.value
  const goy = gridOffsetY.value
  const totalCells = cols * rows
  ctx.save()
  ctx.beginPath()
  ctx.rect(offsetX, offsetY, imgW, imgH)
  ctx.clip()
  for (let idx = 0; idx < totalCells; idx++) {
    const isRevealed = fogCellsSet.has(idx)
    const points = getCellPolygon(idx, type, cols, rows, orientation, gox, goy, gridCellW.value, gridCellH.value)
    if (!points.length) continue
    const canvasPoints = points.map(p => ({ x: offsetX + p.nx * imgW, y: offsetY + p.ny * imgH }))
    ctx.beginPath()
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y)
    for (let i = 1; i < canvasPoints.length; i++) ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y)
    ctx.closePath()
    if (!isRevealed) { ctx.fillStyle = cssVar('--color-fog-cell-fill'); ctx.fill() }
    ctx.strokeStyle = isRevealed ? cssVar('--color-fog-cell-border-revealed') : cssVar('--color-fog-cell-border')
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

function renderGridPreview(ctx, layout) {
  if (!mapImage) return
  const { offsetX, offsetY, imgW, imgH } = layout
  const cols = gridCols.value
  const rows = gridRows.value
  const type = gridType.value
  const orientation = gridHexOrientation.value
  const gox = gridOffsetX.value
  const goy = gridOffsetY.value
  const totalCells = cols * rows
  ctx.save()
  ctx.beginPath()
  ctx.rect(offsetX, offsetY, imgW, imgH)
  ctx.clip()
  for (let idx = 0; idx < totalCells; idx++) {
    const points = getCellPolygon(idx, type, cols, rows, orientation, gox, goy, gridCellW.value, gridCellH.value)
    if (!points.length) continue
    const canvasPoints = points.map(p => ({ x: offsetX + p.nx * imgW, y: offsetY + p.ny * imgH }))
    ctx.beginPath()
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y)
    for (let i = 1; i < canvasPoints.length; i++) ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y)
    ctx.closePath()
    ctx.strokeStyle = cssVar('--color-grid-preview-line')
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

// ── Token rendering ────────────────────────────────────────────────────────
function preloadAvatar(player) {
  const pid = String(player.id)
  if (avatarCache[pid] || !player.avatar_url) return
  avatarCache[pid] = 'loading'
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { avatarCache[pid] = img; render() }
  img.onerror = () => { avatarCache[pid] = 'error' }
  img.src = imageFullUrl(player.avatar_url)
}

function getTokenAtPos(pos) {
  const layout = getLayout()
  if (!layout || !mapImage) return null
  for (const [pid, tokenPos] of Object.entries(visibleTokens(mapTokens.value, groupToken.value))) {
    const tx = layout.offsetX + tokenPos.nx * mapImage.naturalWidth * layout.totalScale
    const ty = layout.offsetY + tokenPos.ny * mapImage.naturalHeight * layout.totalScale
    const dx = pos.x - tx
    const dy = pos.y - ty
    if (Math.sqrt(dx * dx + dy * dy) <= TOKEN_RADIUS + 4) return pid
  }
  return null
}

function drawToken(ctx, pid, tokenPos, layout) {
  if (!mapImage) return
  const { offsetX, offsetY, totalScale } = layout
  const tx = offsetX + tokenPos.nx * mapImage.naturalWidth * totalScale
  const ty = offsetY + tokenPos.ny * mapImage.naturalHeight * totalScale
  const isCustom = pid.startsWith('custom_')
  const isGroup = pid === GROUP_TOKEN_ID
  const player = isCustom || isGroup ? null : sessionStore.players.find(p => String(p.id) === pid)
  const name = isCustom ? (tokenPos.name || '?') : isGroup ? GROUP_TOKEN_NAME : (player?.player_name || '?')
  if (!isCustom && !isGroup) preloadAvatar(player || {})
  ctx.save()
  ctx.beginPath()
  ctx.arc(tx, ty, TOKEN_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = isCustom ? cssVar('--map-token-custom-bg') : cssVar('--map-token-player-bg')
  ctx.fill()
  ctx.strokeStyle = isCustom ? cssVar('--map-token-custom-border') : cssVar('--map-token-player-border')
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()
  const cachedImg = !isCustom && avatarCache[pid]
  if (cachedImg instanceof HTMLImageElement) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(tx, ty, TOKEN_RADIUS - 1, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(cachedImg, tx - TOKEN_RADIUS + 1, ty - TOKEN_RADIUS + 1, (TOKEN_RADIUS - 1) * 2, (TOKEN_RADIUS - 1) * 2)
    ctx.restore()
  } else {
    ctx.save()
    ctx.font = `bold ${TOKEN_RADIUS}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = isCustom ? cssVar('--map-token-custom-border') : cssVar('--map-token-player-border')
    ctx.fillText(name[0]?.toUpperCase() || '?', tx, ty)
    ctx.restore()
  }
  ctx.save()
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineWidth = 3
  ctx.strokeStyle = cssVar('--map-token-label-halo')
  ctx.strokeText(name, tx, ty + TOKEN_RADIUS + 3)
  ctx.fillStyle = cssVar('--map-token-label-color')
  ctx.fillText(name, tx, ty + TOKEN_RADIUS + 3)
  ctx.restore()
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  const canvas = canvasEl.value
  if (!canvas || !mapImage) return
  const ctx = canvas.getContext('2d')
  const layout = getLayout()
  if (!layout) return
  const { offsetX, offsetY, imgW, imgH } = layout
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = cssVar('--color-media-letterbox')
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(mapImage, offsetX, offsetY, imgW, imgH)
  if (showGridConfig.value && gridType.value !== 'none') {
    renderGridPreview(ctx, layout)
  } else if (fogEnabled.value) {
    if (gridType.value !== 'none') renderGridFog(ctx, layout)
    else {
      const fc = ensureFogCanvas()
      if (fc) ctx.drawImage(fc, offsetX, offsetY, imgW, imgH)
    }
  }
  if (hexcrawlActive.value) renderHexcrawlOverlay(ctx, layout)
  for (const [pid, tokenPos] of Object.entries(visibleTokens(mapTokens.value, groupToken.value))) drawToken(ctx, pid, tokenPos, layout)
}

// ── Map image loading ──────────────────────────────────────────────────────
function loadMapImage(url) {
  if (!url) return
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    mapImage = img
    fogCanvas = null
    fitCanvas()
    if (pendingNormViewport) {
      applyNormViewport(pendingNormViewport.xn, pendingNormViewport.yn, pendingNormViewport.scale)
      pendingNormViewport = null
    }
    rebuildFogCanvas()
    render()
    if (gridType.value === 'none' && !showGridConfig.value) runGridDetection()
  }
  img.src = imageFullUrl(url)
}

// Détection de grille côté backend (analyse du fichier uploadé par sharp).
// Le résultat est persisté par le backend ; le panneau de config s'ouvre pour
// permettre à l'admin de vérifier/ajuster avant synchronisation TV.
async function runGridDetection() {
  if (!selectedImageId.value || !sessionStore.activeSession) return
  gridDetecting.value = true
  try {
    const res = await apiFetch(
      `/api/sessions/${sessionStore.activeSession.id}/images/${selectedImageId.value}/detect-grid`,
      { method: 'POST', headers: { Authorization: `Bearer ${authStore.token}` } }
    )
    if (!res.ok) return
    const result = await res.json()
    if (result.grid_type && result.grid_type !== 'none') {
      gridType.value = result.grid_type
      gridCols.value = result.grid_cols
      gridRows.value = result.grid_rows
      gridHexOrientation.value = result.grid_hex_orientation || 'flat'
      gridOffsetX.value = parseFloat(result.grid_offset_x) || 0
      gridOffsetY.value = parseFloat(result.grid_offset_y) || 0
      gridCellW.value = parseFloat(result.grid_cell_w) || null
      gridCellH.value = parseFloat(result.grid_cell_h) || null
      showGridConfig.value = true
    }
  } catch (err) { console.error(err) }
  finally { gridDetecting.value = false }
}

// ── Grid config ────────────────────────────────────────────────────────────
// Une modification manuelle du type / cols / lignes / orientation invalide la
// taille de cellule détectée automatiquement : la grille redevient « pleine
// image » (cellule = 1/cols × 1/rows), comportement prévisible pour l'admin.
function setGridTypeManual(t) {
  gridType.value = t
  gridCellW.value = null
  gridCellH.value = null
}
function setGridColsManual(v) {
  gridCols.value = v
  gridCellW.value = null
  gridCellH.value = null
}
function setGridRowsManual(v) {
  gridRows.value = v
  gridCellW.value = null
  gridCellH.value = null
}
function setGridHexOrientationManual(o) {
  gridHexOrientation.value = o
  gridCellW.value = null
  gridCellH.value = null
}

function applyGridConfig(state) {
  gridType.value = state.gridType || 'none'
  gridCols.value = state.gridCols || 20
  gridRows.value = state.gridRows || 15
  gridHexOrientation.value = state.gridHexOrientation || 'flat'
  gridOffsetX.value = state.gridOffsetX ?? 0
  gridOffsetY.value = state.gridOffsetY ?? 0
  gridCellW.value = state.gridCellW ?? null
  gridCellH.value = state.gridCellH ?? null
  fogCellsSet.clear()
  const cells = state.fogCells || []
  fogCells.value = cells
  cells.forEach(c => fogCellsSet.add(c))
}

async function saveGridConfig() {
  if (!selectedImageId.value || !sessionStore.activeSession) return
  gridSaving.value = true
  try {
    const body = {
      grid_type: gridType.value,
      grid_cols: gridType.value !== 'none' ? gridCols.value : null,
      grid_rows: gridType.value !== 'none' ? gridRows.value : null,
      grid_hex_orientation: gridHexOrientation.value,
      grid_offset_x: gridType.value !== 'none' ? gridOffsetX.value : 0,
      grid_offset_y: gridType.value !== 'none' ? gridOffsetY.value : 0,
      grid_cell_w: gridType.value !== 'none' ? gridCellW.value : null,
      grid_cell_h: gridType.value !== 'none' ? gridCellH.value : null,
    }
    const res = await apiFetch(
      `/api/sessions/${sessionStore.activeSession.id}/images/${selectedImageId.value}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` }, body: JSON.stringify(body) }
    )
    if (res.ok) {
      showGridConfig.value = false
      render()
      mapSocket.emitSyncGrid({
        gridType: gridType.value, gridCols: gridCols.value, gridRows: gridRows.value,
        gridHexOrientation: gridHexOrientation.value, gridOffsetX: gridOffsetX.value, gridOffsetY: gridOffsetY.value,
        gridCellW: gridCellW.value, gridCellH: gridCellH.value,
      })
    }
  } catch (err) { console.error(err) }
  finally { gridSaving.value = false }
}

// ── Coordinate helpers ─────────────────────────────────────────────────────
function getEventXY(event) {
  if (event.touches && event.touches.length > 0) return { cx: event.touches[0].clientX, cy: event.touches[0].clientY }
  return { cx: event.clientX, cy: event.clientY }
}

function eventToCanvas(event) {
  const canvas = canvasEl.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const { cx, cy } = getEventXY(event)
  return {
    x: (cx - rect.left) * (canvas.width / rect.width),
    y: (cy - rect.top) * (canvas.height / rect.height),
  }
}

function canvasToNorm(cx, cy) {
  const layout = getLayout()
  if (!layout || !mapImage) return null
  const { offsetX, offsetY, totalScale } = layout
  return {
    nx: (cx - offsetX) / totalScale / mapImage.naturalWidth,
    ny: (cy - offsetY) / totalScale / mapImage.naturalHeight,
  }
}

// ── Viewport ───────────────────────────────────────────────────────────────
function getBaseScale() {
  const canvas = canvasEl.value
  if (!canvas || !mapImage) return 1
  return Math.min(canvas.width / mapImage.naturalWidth, canvas.height / mapImage.naturalHeight)
}

function toNormViewport() {
  const bs = getBaseScale()
  const baseW = mapImage.naturalWidth * bs
  const baseH = mapImage.naturalHeight * bs
  return { xn: viewport.value.x / (baseW || 1), yn: viewport.value.y / (baseH || 1), scale: viewport.value.scale }
}

function applyNormViewport(xn, yn, scale) {
  if (!mapImage || !canvasEl.value) {
    pendingNormViewport = { xn: xn ?? 0, yn: yn ?? 0, scale: scale ?? 1 }
    return
  }
  const bs = getBaseScale()
  viewport.value = {
    x: (xn ?? 0) * mapImage.naturalWidth * bs,
    y: (yn ?? 0) * mapImage.naturalHeight * bs,
    scale: scale ?? 1,
  }
}

function scheduleViewportEmit() {
  if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer)
  viewportDebounceTimer = setTimeout(() => {
    if (!sessionStore.activeSession || !mapImage) return
    const norm = toNormViewport()
    mapSocket.emitViewport(norm.xn, norm.yn, norm.scale)
  }, VIEWPORT_DEBOUNCE_MS)
}

function zoomIn() {
  viewport.value = { ...viewport.value, scale: Math.min(12, +(viewport.value.scale * 1.25).toFixed(4)) }
  scheduleViewportEmit(); render()
}
function zoomOut() {
  viewport.value = { ...viewport.value, scale: Math.max(0.1, +(viewport.value.scale / 1.25).toFixed(4)) }
  scheduleViewportEmit(); render()
}
function resetViewport() {
  viewport.value = { x: 0, y: 0, scale: 1 }
  scheduleViewportEmit(); render()
}

// ── Interaction ────────────────────────────────────────────────────────────
function applyBrush(pos) {
  const norm = canvasToNorm(pos.x, pos.y)
  if (!norm) return
  const layout = getLayout()
  if (!layout) return
  const nr = brushRadius.value / layout.imgW
  const stroke = { nx: norm.nx, ny: norm.ny, nr }
  fogStrokes.value.push(stroke)
  addStrokeToFog(stroke)
  render()
  mapSocket.emitFogStroke(stroke)
}

// `wide` (Maj maintenu) : révèle aussi les cases voisines — sans jamais re-masquer.
function applyCellReveal(pos, wide = false) {
  const norm = canvasToNorm(pos.x, pos.y)
  if (!norm) return
  const idx = getCellAt(norm.nx, norm.ny, gridType.value, gridCols.value, gridRows.value, gridHexOrientation.value, gridOffsetX.value, gridOffsetY.value, gridCellW.value, gridCellH.value)
  if (idx < 0) return
  if (isHidingCells) {
    if (!fogCellsSet.has(idx)) return
    fogCellsSet.delete(idx)
    fogCells.value = [...fogCellsSet]
    render()
    mapSocket.emitCellHide(idx)
    return
  }
  const targets = wide
    ? [idx, ...getCellNeighbors(idx, gridType.value, gridCols.value, gridRows.value, gridHexOrientation.value, gridOffsetX.value, gridOffsetY.value, gridCellW.value, gridCellH.value)]
    : [idx]
  const added = targets.filter(c => !fogCellsSet.has(c))
  if (added.length === 0) return
  added.forEach(c => fogCellsSet.add(c))
  fogCells.value = [...fogCellsSet]
  render()
  mapSocket.emitCellReveal(added)
}

function cellIdxAt(pos) {
  const norm = canvasToNorm(pos.x, pos.y)
  if (!norm) return -1
  return getCellAt(norm.nx, norm.ny, gridType.value, gridCols.value, gridRows.value, gridHexOrientation.value, gridOffsetX.value, gridOffsetY.value, gridCellW.value, gridCellH.value)
}

function onPointerDown(event) {
  const pos = eventToCanvas(event)
  if (!pos) return
  if (event.button === 1) {
    event.preventDefault()
    canvasEl.value?.setPointerCapture(event.pointerId)
    isDragging.value = true
    const { cx, cy } = getEventXY(event)
    dragStart = { x: cx, y: cy }
    dragViewportStart = { ...viewport.value }
    return
  }
  if (event.button !== 0) return
  canvasEl.value?.setPointerCapture(event.pointerId)
  if (pendingCustomToken.value) {
    const norm = canvasToNorm(pos.x, pos.y)
    if (norm) placeCustomToken(norm.nx, norm.ny)
    return
  }
  if (pendingTokenPlayerId.value) {
    const norm = canvasToNorm(pos.x, pos.y)
    if (norm) placeToken(pendingTokenPlayerId.value, norm.nx, norm.ny)
    pendingTokenPlayerId.value = null
    return
  }
  const tokenUnderCursor = getTokenAtPos(pos)
  if (travelActive.value) {
    // En voyage, le jeton du groupe bouge par le journal : seuls les jetons en plus se glissent.
    if (tokenUnderCursor && tokenUnderCursor !== GROUP_TOKEN_ID) draggingTokenId = tokenUnderCursor
    else handleTravelClick(pos)
    return
  }
  if (tokenUnderCursor) { draggingTokenId = tokenUnderCursor; return }
  if (fogEnabled.value) {
    if (gridType.value !== 'none') { isRevealingCells = true; isHidingCells = !event.shiftKey && fogCellsSet.has(cellIdxAt(pos)); applyCellReveal(pos, event.shiftKey) }
    else { isPainting = true; applyBrush(pos) }
  }
}

function onPointerMove(event) {
  const pos = eventToCanvas(event)
  if (!pos) return
  if (travelActive.value) {
    const cell = cellIdxAt(pos)
    if (cell !== hoverCell.value) {
      hoverCell.value = cell
      render()
    }
  }
  if (draggingTokenId) {
    const norm = canvasToNorm(pos.x, pos.y)
    if (norm) {
      const existing = mapTokens.value[draggingTokenId]
      mapTokens.value = { ...mapTokens.value, [draggingTokenId]: { ...existing, nx: norm.nx, ny: norm.ny } }
      if (tokenDragThrottleFrame) cancelAnimationFrame(tokenDragThrottleFrame)
      tokenDragThrottleFrame = requestAnimationFrame(render)
    }
    return
  }
  if (isPainting && fogEnabled.value && gridType.value === 'none') { applyBrush(pos); return }
  if (isRevealingCells && fogEnabled.value && gridType.value !== 'none') { applyCellReveal(pos, event.shiftKey); return }
  if (isDragging.value) {
    const { cx, cy } = getEventXY(event)
    viewport.value = { ...dragViewportStart, x: dragViewportStart.x + (cx - dragStart.x), y: dragViewportStart.y + (cy - dragStart.y) }
    scheduleViewportEmit()
    render()
  }
}

function onPointerUp(_event) {
  if (draggingTokenId) {
    const tokenPos = mapTokens.value[draggingTokenId]
    if (tokenPos) mapSocket.emitTokenMove(draggingTokenId, tokenPos.nx, tokenPos.ny, tokenPos.name)
    draggingTokenId = null
    return
  }
  isPainting = false
  isRevealingCells = false
  isHidingCells = false
  isDragging.value = false
}

function onPointerLeave(event) {
  onPointerUp(event)
  if (hoverCell.value >= 0) {
    hoverCell.value = -1
    render()
  }
}

function onWheel(event) {
  event.preventDefault()
  const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12
  viewport.value = { ...viewport.value, scale: Math.min(12, Math.max(0.1, +(viewport.value.scale * factor).toFixed(4))) }
  scheduleViewportEmit(); render()
}

// ── Token actions ──────────────────────────────────────────────────────────
function placeToken(playerId, nx, ny) {
  const name = playerId === GROUP_TOKEN_ID ? GROUP_TOKEN_NAME : undefined
  mapTokens.value = { ...mapTokens.value, [String(playerId)]: { nx, ny, ...(name ? { name } : {}) } }
  mapSocket.emitTokenMove(playerId, nx, ny, name)
  render()
}

function removeToken(playerId) {
  const next = { ...mapTokens.value }
  delete next[String(playerId)]
  mapTokens.value = next
  mapSocket.emitTokenRemove(playerId)
  render()
}

function toggleTokenPlacement(playerId) {
  if (mapTokens.value[String(playerId)]) removeToken(playerId)
  else pendingTokenPlayerId.value = String(playerId) === pendingTokenPlayerId.value ? null : String(playerId)
}

// Active/désactive le jeton « groupe ». Les pions joueurs restent en mémoire, simplement masqués.
// Au premier usage, le groupe se pose au centre des pions déjà placés, sinon le MJ clique sur la carte.
function toggleGroupToken() {
  const enabling = !groupToken.value
  groupToken.value = enabling
  pendingTokenPlayerId.value = null
  mapSocket.emitSetGroupToken(enabling)
  if (enabling && !mapTokens.value[GROUP_TOKEN_ID]) {
    const center = centerOfPlayerTokens(mapTokens.value)
    if (center) placeToken(GROUP_TOKEN_ID, center.nx, center.ny)
    else pendingTokenPlayerId.value = GROUP_TOKEN_ID
  }
  render()
}

function addCustomToken() {
  if (!customTokenName.value.trim()) return
  pendingCustomToken.value = true
  pendingTokenPlayerId.value = null
}

function placeCustomToken(nx, ny) {
  const name = customTokenName.value.trim()
  if (!name) return
  const id = `custom_${Date.now()}`
  mapTokens.value = { ...mapTokens.value, [id]: { nx, ny, name } }
  mapSocket.emitTokenMove(id, nx, ny, name)
  pendingCustomToken.value = false
  render()
}

function removeCustomToken(id) {
  const next = { ...mapTokens.value }
  delete next[id]
  mapTokens.value = next
  mapSocket.emitTokenRemove(id)
  render()
}

// ── Gallery actions ────────────────────────────────────────────────────────
function selectImage(img) {
  selectedImageUrl.value = img.url
  selectedImageId.value = img.id
  gridType.value = img.grid_type || 'none'
  gridCols.value = img.grid_cols || 20
  gridRows.value = img.grid_rows || 15
  gridHexOrientation.value = img.grid_hex_orientation || 'flat'
  gridOffsetX.value = parseFloat(img.grid_offset_x) || 0
  gridOffsetY.value = parseFloat(img.grid_offset_y) || 0
  gridCellW.value = parseFloat(img.grid_cell_w) || null
  gridCellH.value = parseFloat(img.grid_cell_h) || null
  showGridConfig.value = false
  loadMapImage(img.url)
}

async function handleDeleteImage(img) {
  const deleted = await deleteImage(img)
  if (deleted && selectedImageUrl.value === img.url) selectedImageUrl.value = null
  if (deleted) hexcrawlImageIds.value = hexcrawlImageIds.value.filter(id => id !== img.id)
}

function showMapOnTv(img) {
  if (!img || !sessionStore.activeSession) return
  selectImage(img)
  mapSocket.emitShowMap(img.url)
  showMapList.value = false
}

function toggleFog() { mapSocket.emitToggleFog(!fogEnabled.value) }
function resetFog() { mapSocket.emitResetFog(gridType.value !== 'none') }

// ── Socket composable (init after all functions defined) ───────────────────
// Une carte reçue avant la fin du chargement de la galerie n'a pas encore d'id.
watch(images, (list) => {
  if (selectedImageUrl.value && !selectedImageId.value) {
    selectedImageId.value = list.find(i => i.url === selectedImageUrl.value)?.id || null
    render()
  }
})

const mapSocket = useMapSocket({
  isMapActive, fogEnabled, groupToken, fogStrokes, fogCells, fogCellsSet,
  mapTokens, selectedImageUrl, selectedImageId, images, viewport, gridType,
  applyGridConfig, applyNormViewport,
  rebuildFogCanvas: () => { fogCanvas = null; fogMask = null; rebuildFogCanvas() },
  ensureFogCanvas, addStrokeToFog, render, loadMapImage, showMapList, getBaseScale,
})

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  loadImages()
  mapSocket.register()
  registerHexcrawl()
  loadHexcrawl()
  loadHexcrawlList()
})

onUnmounted(() => {
  if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer)
  if (resizeObserver) resizeObserver.disconnect()
  mapSocket.unregister()
  unregisterHexcrawl()
  clearTimeout(noticeTimer)
})

// Le conteneur du canvas est sous un v-if (carte active uniquement) : il n'existe pas encore à
// onMounted lors d'un premier affichage. Observer la ref elle-même garantit un fitCanvas() dès son
// apparition (ResizeObserver notifie à l'observation initiale), sinon le canvas garde sa taille par
// défaut 300×150 et la carte a un mauvais ratio jusqu'au prochain redimensionnement.
resizeObserver = new ResizeObserver(() => { fitCanvas(); render() })
watch(canvasContainer, (el, prev) => {
  if (prev) resizeObserver?.unobserve(prev)
  if (el) resizeObserver?.observe(el)
}, { flush: 'post' })

watch(() => selectedImageUrl.value, (url) => { if (url && !mapImage) loadMapImage(url) })
watch(fogEnabled, () => render())
watch(travelMode, () => { hoverCell.value = -1; render() })
watch(() => sessionStore.activeSession?.id, () => { loadHexcrawl(); loadHexcrawlList() })
watch([gridCols, gridRows, gridType, gridHexOrientation, gridOffsetX, gridOffsetY, gridCellW, gridCellH], () => { if (showGridConfig.value) render() })
</script>

<template>
  <div
    class="map-manager"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    :class="{ 'drag-active': dragOver }"
  >
    <div v-if="dragOver" class="drop-overlay">
      <AppIcon icon="lucide:map-plus" size="2rem" color="var(--color-gold-bright)" />
      <span>Déposer les cartes ici</span>
    </div>

    <h3 class="section-title"><AppIcon icon="lucide:map" size="0.9em" /> Gestionnaire de Carte</h3>

    <template v-if="showMapList">
      <MapGallery
        :images="images"
        :selected-image-url="selectedImageUrl"
        :uploading="uploading"
        :upload-progress="uploadProgress"
        :upload-error="uploadError"
        :has-active-session="!!sessionStore.activeSession"
        :hexcrawl-image-ids="hexcrawlImageIds"
        @create-hexcrawl="openWizard()"
        @select="selectImage"
        @delete="handleDeleteImage"
        @upload="uploadFiles"
        @show-on-tv="showMapOnTv"
      />
    </template>

    <template v-if="!showMapList && isMapActive && selectedImageUrl">
      <div class="map-view-topbar">
        <button class="map-back-btn" @click="showMapList = true">
          <AppIcon icon="lucide:arrow-left" size="0.9em" /> Retour à la liste
        </button>
      </div>
      <div class="map-active-layout">

        <!-- Canvas col -->
        <div class="map-canvas-col">
          <p class="hint-text canvas-hint">
            <template v-if="pendingTokenPlayerId">Cliquez sur la carte pour placer le jeton</template>
            <template v-else-if="travelActive && hexStatus && !hexStatus.started">Cliquez la case de départ du groupe · Molette pour zoomer · Molette centrale pour naviguer</template>
            <template v-else-if="travelActive">Cliquez une case voisine pour avancer · Molette pour zoomer · Molette centrale pour naviguer</template>
            <template v-else-if="showGridConfig && gridType !== 'none'">Aperçu grille — ajustez cols/lignes puis enregistrez</template>
            <template v-else-if="fogEnabled && gridType !== 'none'">Clic gauche (maintenu) pour révéler les cases · Molette pour zoomer · Molette centrale pour naviguer</template>
            <template v-else-if="fogEnabled">Clic gauche pour révéler · Molette pour zoomer · Molette centrale pour naviguer</template>
            <template v-else>Clic molette pour naviguer · molette pour zoomer</template>
          </p>
          <div
            ref="canvasContainer"
            class="canvas-container"
            :style="{ cursor: pendingTokenPlayerId ? 'crosshair' : draggingTokenId ? 'grabbing' : isDragging ? 'grabbing' : fogEnabled && gridType !== 'none' ? 'pointer' : 'default' }"
          >
            <canvas
              ref="canvasEl"
              class="map-canvas"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointerleave="onPointerLeave"
              @pointercancel="onPointerUp"
              @wheel.prevent="onWheel"
              @contextmenu.prevent
            />
          </div>
        </div>

        <!-- Controls col -->
        <div class="map-controls-col">
          <HexcrawlPanel
            v-if="hexcrawlActive"
            :status="hexStatus"
            :config="hexConfig"
            :position-label="hexStatus.position ? cellCode(hexStatus.position.cell) : ''"
            :army-label="hexStatus.army?.cell != null ? cellCode(hexStatus.army.cell) : ''"
            :travel-mode="travelMode"
            :hard-next="hardNext"
            :notice="travelNotice"
            :can-undo="hexcrawl.log.length > 0"
            @update:travel-mode="travelMode = $event"
            @update:hard-next="hardNext = $event"
            @action="hexAct"
            @undo="hexUndo"
            @reset="resetHexcrawl"
            @edit="editHexcrawl"
            @remove="removeHexcrawl"
          />

          <MapGridConfig
            v-if="!hexcrawlActive"
            :show="showGridConfig"
            :grid-type="gridType"
            :grid-cols="gridCols"
            :grid-rows="gridRows"
            :grid-hex-orientation="gridHexOrientation"
            :grid-offset-x="gridOffsetX"
            :grid-offset-y="gridOffsetY"
            :grid-cell-w="gridCellW"
            :grid-cell-h="gridCellH"
            :grid-detecting="gridDetecting"
            :grid-saving="gridSaving"
            @update:show="showGridConfig = $event"
            @update:grid-type="setGridTypeManual"
            @update:grid-cols="setGridColsManual"
            @update:grid-rows="setGridRowsManual"
            @update:grid-hex-orientation="setGridHexOrientationManual"
            @update:grid-offset-x="gridOffsetX = $event"
            @update:grid-offset-y="gridOffsetY = $event"
            @save="saveGridConfig"
            @detect="runGridDetection"
          />

          <MapFogControls
            v-if="!hexcrawlActive"
            :fog-enabled="fogEnabled"
            :grid-type="gridType"
            :brush-radius="brushRadius"
            :min-brush-radius="MIN_BRUSH_RADIUS"
            :max-brush-radius="MAX_BRUSH_RADIUS"
            @toggle="toggleFog"
            @reset="resetFog"
            @update:brush-radius="brushRadius = $event"
          />

          <MapImageGroups />

          <MapTokenPanel
            :players="sessionStore.players"
            :map-tokens="mapTokens"
            :group-token="groupToken"
            :pending-token-player-id="pendingTokenPlayerId"
            :pending-custom-token="pendingCustomToken"
            :custom-token-name="customTokenName"
            @toggle-player-token="toggleTokenPlacement"
            @toggle-group-token="toggleGroupToken"
            @add-custom-token="addCustomToken"
            @remove-custom-token="removeCustomToken"
            @update:custom-token-name="customTokenName = $event"
          />

          <MapViewportControls
            v-if="!hexcrawlActive"
            :viewport="viewport"
            @zoom-in="zoomIn"
            @zoom-out="zoomOut"
            @reset="resetViewport"
          />
        </div>
      </div>
    </template>

    <HexcrawlAlert v-if="combatStarted && !combatDismissed" danger icon="lucide:swords" :title="`${hexStatus.army.waveName} rejoint le groupe`">
      <p>L'armée arrive sur le groupe en <strong>{{ cellCode(hexStatus.army.cell) }}</strong>. Le combat ne peut pas être évité.</p>
      <template #actions>
        <button class="primary" data-testid="hexcrawl-combat-start" @click="combatDismissed = true">Compris, au combat</button>
        <button @click="hexUndo">Annuler la dernière action</button>
      </template>
    </HexcrawlAlert>

    <HexcrawlAlert v-else-if="restAlert" icon="lucide:moon" title="Repos long à prendre">
      <p>Le groupe a agi pendant <strong>{{ formatHours(hexStatus.hoursSinceRest) }}</strong> sans dormir. Le repos prend {{ formatHours(hexConfig.restQuarters * hexConfig.quarterHours) }} et exige un abri.</p>
      <p>Sans repos, chaque PJ gagne 1 niveau d'épuisement.</p>
      <template #actions>
        <button class="primary" data-testid="hexcrawl-take-rest" @click="hexAct({ t: 'rest' })">Prendre le repos</button>
        <button data-testid="hexcrawl-skip-rest" @click="hexAct({ t: 'no-rest' })">Continuer sans repos</button>
        <button @click="hexUndo">Annuler la dernière action</button>
      </template>
    </HexcrawlAlert>

    <HexcrawlWizard
      v-if="wizard"
      :image="wizard.image"
      :start-step="wizard.startStep"
      @close="wizard = null"
      @finished="onWizardFinished"
    />
  </div>
</template>

<style scoped>
.map-manager { position: relative; display: flex; flex-direction: column; gap: var(--space-4); }

.map-view-topbar { display: flex; align-items: center; gap: var(--space-2); }
.map-back-btn {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-raised, rgba(255,255,255,0.05));
  border: 1px solid var(--color-border); border-radius: 8px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif; font-size: var(--text-xs); letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.18s;
}
.map-back-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold-bright); background: var(--surface-gold-soft); }

.drop-overlay {
  position: absolute; inset: 0; z-index: 10;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2);
  background: var(--overlay-scrim); border: 2px dashed var(--color-gold-dark); border-radius: 10px;
  color: var(--color-gold-bright); font-family: var(--font-heading), sans-serif; font-size: var(--text-base);
  letter-spacing: 0.12em; text-transform: uppercase; pointer-events: none;
}
.drag-active > *:not(.drop-overlay) { opacity: 0.35; pointer-events: none; }

.section-title {
  font-family: var(--font-heading), sans-serif; font-size: var(--text-sm);
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--color-gold-dark); margin-bottom: 0.25rem;
}

.map-active-layout { display: grid; grid-template-columns: 1fr 280px; gap: var(--space-3); align-items: start; }
.map-canvas-col { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.map-controls-col { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; max-height: 80vh; overflow-y: auto; scrollbar-width: thin; }

.canvas-hint { margin: 0; }
.canvas-container { width: 100%; height: 72vh; border-radius: 8px; border: 1px solid var(--color-border); overflow: hidden; background: var(--color-media-letterbox); user-select: none; }
.map-canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.hint-text { font-family: var(--font-body), sans-serif; font-size: var(--text-sm); color: var(--color-text-dim); margin: 0; }

@media (max-width: 900px) {
  .map-active-layout { grid-template-columns: 1fr; }
  .map-controls-col { max-height: none; overflow-y: visible; }
  .canvas-container { height: 55vw; min-height: 280px; }
}
</style>
