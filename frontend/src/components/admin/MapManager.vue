<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { getSocket } from '@/socket.js'
import AppIcon from '../AppIcon.vue'
import HelpTip from '../HelpTip.vue'
import { getCellAt, getCellPolygon, detectGrid } from '@/utils/mapGrid.js'

import { BACKEND_URL } from '@/config.js'
const MAX_BRUSH_RADIUS = 100
const MIN_BRUSH_RADIUS = 5
const DEFAULT_BRUSH_RADIUS = 30
const VIEWPORT_DEBOUNCE_MS = 150
const TOKEN_RADIUS = 26  // px canvas

// ── State ──────────────────────────────────────────────────────────────────
const images = ref([])
const selectedImageUrl = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadProgress = ref(0)
const dragOver = ref(false)

const isMapActive = ref(false)
const fogEnabled = ref(false)
const viewport = ref({ x: 0, y: 0, scale: 1 })
const fogStrokes = ref([])  // { nx, ny, nr, cover? }
const fogCells = ref([])    // revealed cell indices (grid mode)
const mapTokens = ref({})   // { [playerId]: { nx, ny } }
const customTokenName = ref('')
const pendingCustomToken = ref(false)

// Grid config
const gridType = ref('none')    // 'none' | 'square' | 'hex'
const gridCols = ref(20)
const gridRows = ref(15)
const gridHexOrientation = ref('flat')
const gridOffsetX = ref(0)
const gridOffsetY = ref(0)
const showGridConfig = ref(false)   // whether config panel is open
const gridDetecting = ref(false)
const gridSaving = ref(false)
const selectedImageId = ref(null)   // id of currently loaded map image

const brushRadius = ref(DEFAULT_BRUSH_RADIUS)

// canvas refs
const canvasEl = ref(null)
const canvasContainer = ref(null)

// non-reactive internals
let mapImage = null
let fogCanvas = null
let fogMask = null  // canvas binaire : blanc = couvert, transparent = révélé
let resizeObserver = null
let viewportDebounceTimer = null
let pendingNormViewport = null
const avatarCache = {}   // { [playerId]: HTMLImageElement | 'loading' | 'error' }
const fogCellsSet = new Set()  // mirror of fogCells for O(1) lookup

// interaction state
let isPainting = false
const isDragging = ref(false)
let dragStart = null
let dragViewportStart = null
let draggingTokenId = null   // playerId en cours de drag
let tokenDragThrottleFrame = null

// placement en attente depuis la barre de jetons
const pendingTokenPlayerId = ref(null)

// ── Images ─────────────────────────────────────────────────────────────────
async function loadImages() {
  if (!sessionStore.activeSession) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images?type=map`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) images.value = await res.json()
  } catch (err) { console.error(err) }
}

function uploadFiles(files) {
  if (!files.length || !sessionStore.activeSession) return
  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0
  const formData = new FormData()
  files.forEach(file => formData.append('files', file))
  formData.append('session_id', sessionStore.activeSession.id)
  formData.append('type', 'map')
  const xhr = new XMLHttpRequest()
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100)
  })
  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      await loadImages()
    } else {
      try { uploadError.value = JSON.parse(xhr.responseText).error || 'Erreur.' }
      catch { uploadError.value = 'Erreur.' }
    }
    uploading.value = false
    uploadProgress.value = 0
  })
  xhr.addEventListener('error', () => {
    uploadError.value = 'Erreur de connexion.'
    uploading.value = false
    uploadProgress.value = 0
  })
  xhr.open('POST', `${BACKEND_URL}/api/uploads`)
  xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)
  xhr.send(formData)
}

function handleFileUpload(event) {
  uploadFiles(Array.from(event.target.files || []))
  event.target.value = ''
}

function onDragOver(e) {
  if (uploading.value || !sessionStore.activeSession) return
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = false
}

function onDrop(e) {
  e.preventDefault()
  dragOver.value = false
  if (uploading.value || !sessionStore.activeSession) return
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  if (files.length) uploadFiles(files)
}

function imageFullUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

// ── Canvas / Rendering ─────────────────────────────────────────────────────
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

  // 1) Dessiner la teinte semi-transparente sur tout le canvas
  fCtx.globalCompositeOperation = 'source-over'
  fCtx.fillStyle = 'rgba(30, 20, 60, 0.22)'
  fCtx.fillRect(0, 0, w, h)

  // 2) Dessiner les hachures
  fCtx.strokeStyle = 'rgba(180, 140, 255, 0.18)'
  fCtx.lineWidth = 2
  const step = 36
  for (let i = -h; i < w + h; i += step) {
    fCtx.beginPath()
    fCtx.moveTo(i, 0)
    fCtx.lineTo(i + h, h)
    fCtx.stroke()
  }

  // 3) Masquer (effacer) les zones révélées — là où le mask est transparent
  //    On veut garder le fog UNIQUEMENT là où le mask est opaque.
  //    → destination-in : garde les pixels du fog là où le mask est opaque
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
    const points = getCellPolygon(idx, type, cols, rows, orientation, gox, goy)
    if (!points.length) continue

    const canvasPoints = points.map(p => ({
      x: offsetX + p.nx * imgW,
      y: offsetY + p.ny * imgH,
    }))

    ctx.beginPath()
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y)
    for (let i = 1; i < canvasPoints.length; i++) ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y)
    ctx.closePath()

    if (!isRevealed) {
      ctx.fillStyle = 'rgba(30, 20, 60, 0.75)'
      ctx.fill()
    }

    ctx.strokeStyle = isRevealed ? 'rgba(180, 140, 255, 0.25)' : 'rgba(180, 140, 255, 0.45)'
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
    const points = getCellPolygon(idx, type, cols, rows, orientation, gox, goy)
    if (!points.length) continue
    const canvasPoints = points.map(p => ({
      x: offsetX + p.nx * imgW,
      y: offsetY + p.ny * imgH,
    }))
    ctx.beginPath()
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y)
    for (let i = 1; i < canvasPoints.length; i++) ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y)
    ctx.closePath()
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  ctx.restore()
}

// ── Token helpers ──────────────────────────────────────────────────────────
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
  for (const [pid, tokenPos] of Object.entries(mapTokens.value)) {
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
  const player = isCustom ? null : sessionStore.players.find(p => String(p.id) === pid)
  const name = isCustom ? (tokenPos.name || '?') : (player?.player_name || '?')

  if (!isCustom) preloadAvatar(player || {})

  ctx.save()
  ctx.beginPath()
  ctx.arc(tx, ty, TOKEN_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = isCustom ? '#1e2a1a' : '#1a1230'
  ctx.fill()
  ctx.strokeStyle = isCustom ? '#6aaa44' : '#c9a227'
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
    ctx.fillStyle = isCustom ? '#6aaa44' : '#c9a227'
    ctx.fillText(name[0]?.toUpperCase() || '?', tx, ty)
    ctx.restore()
  }

  ctx.save()
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.strokeText(name, tx, ty + TOKEN_RADIUS + 3)
  ctx.fillStyle = '#fff'
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
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.drawImage(mapImage, offsetX, offsetY, imgW, imgH)

  if (showGridConfig.value && gridType.value !== 'none') {
    renderGridPreview(ctx, layout)
  } else if (fogEnabled.value) {
    if (gridType.value !== 'none') {
      renderGridFog(ctx, layout)
    } else {
      const fc = ensureFogCanvas()
      if (fc) ctx.drawImage(fc, offsetX, offsetY, imgW, imgH)
    }
  }

  for (const [pid, tokenPos] of Object.entries(mapTokens.value)) {
    drawToken(ctx, pid, tokenPos, layout)
  }
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
    if (gridType.value === 'none' && !showGridConfig.value) {
      runGridDetection()
    }
  }
  img.src = imageFullUrl(url)
}

async function runGridDetection() {
  if (!mapImage) return
  gridDetecting.value = true
  try {
    const result = detectGrid(mapImage)
    if (result.type !== 'none') {
      gridCols.value = result.cols
      gridRows.value = result.rows
      gridOffsetX.value = result.offsetX ?? 0
      gridOffsetY.value = result.offsetY ?? 0
      showGridConfig.value = true
    }
  } finally {
    gridDetecting.value = false
  }
}

// ── Grid config actions ────────────────────────────────────────────────────
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
    }
    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${selectedImageId.value}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
        body: JSON.stringify(body),
      }
    )
    if (res.ok) {
      showGridConfig.value = false
      render()
      const socket = getSocket()
      socket.emit('map-sync-grid', {
        sessionId: sessionStore.activeSession.id,
        gridType: gridType.value,
        gridCols: gridCols.value,
        gridRows: gridRows.value,
        gridHexOrientation: gridHexOrientation.value,
        gridOffsetX: gridOffsetX.value,
        gridOffsetY: gridOffsetY.value,
      })
    }
  } catch (err) { console.error(err) }
  finally { gridSaving.value = false }
}

function applyGridConfig(state) {
  gridType.value = state.gridType || 'none'
  gridCols.value = state.gridCols || 20
  gridRows.value = state.gridRows || 15
  gridHexOrientation.value = state.gridHexOrientation || 'flat'
  gridOffsetX.value = state.gridOffsetX ?? 0
  gridOffsetY.value = state.gridOffsetY ?? 0
  fogCellsSet.clear()
  const cells = state.fogCells || []
  fogCells.value = cells
  cells.forEach(c => fogCellsSet.add(c))
}

// ── Coordinate helpers ─────────────────────────────────────────────────────
function getEventXY(event) {
  if (event.touches && event.touches.length > 0) {
    return { cx: event.touches[0].clientX, cy: event.touches[0].clientY }
  }
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
  const imgX = (cx - offsetX) / totalScale
  const imgY = (cy - offsetY) / totalScale
  return {
    nx: imgX / mapImage.naturalWidth,
    ny: imgY / mapImage.naturalHeight,
  }
}

// ── Interaction ────────────────────────────────────────────────────────────
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
  if (tokenUnderCursor) {
    draggingTokenId = tokenUnderCursor
    return
  }

  if (fogEnabled.value) {
    if (gridType.value !== 'none') {
      applyCellReveal(pos)
    } else {
      isPainting = true
      applyBrush(pos)
    }
  }
}

function onPointerMove(event) {
  const pos = eventToCanvas(event)
  if (!pos) return

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

  if (isPainting && fogEnabled.value && gridType.value === 'none') {
    applyBrush(pos)
    return
  }

  if (isDragging.value) {
    const { cx, cy } = getEventXY(event)
    viewport.value = {
      ...dragViewportStart,
      x: dragViewportStart.x + (cx - dragStart.x),
      y: dragViewportStart.y + (cy - dragStart.y),
    }
    scheduleViewportEmit()
    render()
  }
}

function onPointerUp(_event) {
  if (draggingTokenId) {
    const tokenPos = mapTokens.value[draggingTokenId]
    if (tokenPos) emitTokenMove(draggingTokenId, tokenPos.nx, tokenPos.ny, tokenPos.name)
    draggingTokenId = null
    return
  }
  isPainting = false
  isDragging.value = false
}

function onContextMenu(event) {
  event.preventDefault()
}

function onWheel(event) {
  event.preventDefault()
  const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12
  viewport.value = {
    ...viewport.value,
    scale: Math.min(12, Math.max(0.1, +(viewport.value.scale * factor).toFixed(4))),
  }
  scheduleViewportEmit()
  render()
}

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
  const socket = getSocket()
  socket.emit('map-fog-clear', { sessionId: sessionStore.activeSession.id, strokes: [stroke] })
}

function applyCellReveal(pos) {
  const norm = canvasToNorm(pos.x, pos.y)
  if (!norm) return
  const idx = getCellAt(norm.nx, norm.ny, gridType.value, gridCols.value, gridRows.value, gridHexOrientation.value, gridOffsetX.value, gridOffsetY.value)
  if (idx < 0 || fogCellsSet.has(idx)) return
  fogCellsSet.add(idx)
  fogCells.value = [...fogCellsSet]
  render()
  const socket = getSocket()
  socket.emit('map-fog-cell-reveal', { sessionId: sessionStore.activeSession.id, cells: [idx] })
}

// ── Token actions ──────────────────────────────────────────────────────────
function placeToken(playerId, nx, ny) {
  mapTokens.value = { ...mapTokens.value, [String(playerId)]: { nx, ny } }
  emitTokenMove(playerId, nx, ny)
  render()
}

function removeToken(playerId) {
  const next = { ...mapTokens.value }
  delete next[String(playerId)]
  mapTokens.value = next
  const socket = getSocket()
  socket.emit('map-token-remove', { sessionId: sessionStore.activeSession.id, playerId })
  render()
}

function emitTokenMove(playerId, nx, ny, name = undefined) {
  const socket = getSocket()
  socket.emit('map-token-move', { sessionId: sessionStore.activeSession.id, playerId, nx, ny, ...(name ? { name } : {}) })
}

function toggleTokenPlacement(playerId) {
  if (mapTokens.value[String(playerId)]) {
    removeToken(playerId)
  } else {
    pendingTokenPlayerId.value = String(playerId) === pendingTokenPlayerId.value ? null : String(playerId)
  }
}

function addCustomToken() {
  const name = customTokenName.value.trim()
  if (!name) return
  pendingCustomToken.value = true
  pendingTokenPlayerId.value = null
}

function placeCustomToken(nx, ny) {
  const name = customTokenName.value.trim()
  if (!name) return
  const id = `custom_${Date.now()}`
  mapTokens.value = { ...mapTokens.value, [id]: { nx, ny, name } }
  emitTokenMove(id, nx, ny, name)
  pendingCustomToken.value = false
  render()
}

function removeCustomToken(id) {
  const next = { ...mapTokens.value }
  delete next[id]
  mapTokens.value = next
  const socket = getSocket()
  socket.emit('map-token-remove', { sessionId: sessionStore.activeSession.id, playerId: id })
  render()
}

// ── Socket actions ─────────────────────────────────────────────────────────
function showMapOnTv() {
  if (!selectedImageUrl.value || !sessionStore.activeSession) return
  const socket = getSocket()
  socket.emit('show-map', { sessionId: sessionStore.activeSession.id, imageUrl: selectedImageUrl.value })
  socket.emit('map-set-fog', { sessionId: sessionStore.activeSession.id, enabled: true })
}

function toggleFog() {
  const socket = getSocket()
  socket.emit('map-set-fog', { sessionId: sessionStore.activeSession.id, enabled: !fogEnabled.value })
}

function resetFog() {
  const socket = getSocket()
  if (gridType.value !== 'none') {
    socket.emit('map-fog-cells-reset', { sessionId: sessionStore.activeSession.id })
  } else {
    socket.emit('map-fog-reset', { sessionId: sessionStore.activeSession.id })
  }
}

function emitViewport() {
  if (!sessionStore.activeSession || !mapImage) return
  const norm = toNormViewport()
  const socket = getSocket()
  socket.emit('map-viewport-update', {
    sessionId: sessionStore.activeSession.id,
    xn: norm.xn,
    yn: norm.yn,
    scale: norm.scale,
  })
}
function scheduleViewportEmit() {
  if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer)
  viewportDebounceTimer = setTimeout(emitViewport, VIEWPORT_DEBOUNCE_MS)
}

function getBaseScale() {
  const canvas = canvasEl.value
  if (!canvas || !mapImage) return 1
  return Math.min(canvas.width / mapImage.naturalWidth, canvas.height / mapImage.naturalHeight)
}

function toNormViewport() {
  const bs = getBaseScale()
  const baseW = mapImage.naturalWidth * bs
  const baseH = mapImage.naturalHeight * bs
  return {
    xn: viewport.value.x / (baseW || 1),
    yn: viewport.value.y / (baseH || 1),
    scale: viewport.value.scale,
  }
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

function zoomIn() {
  viewport.value = { ...viewport.value, scale: Math.min(12, +(viewport.value.scale * 1.25).toFixed(4)) }
  scheduleViewportEmit()
  render()
}

function zoomOut() {
  viewport.value = { ...viewport.value, scale: Math.max(0.1, +(viewport.value.scale / 1.25).toFixed(4)) }
  scheduleViewportEmit()
  render()
}

function resetViewport() {
  viewport.value = { x: 0, y: 0, scale: 1 }
  scheduleViewportEmit()
  render()
}

// ── Socket event handlers ──────────────────────────────────────────────────
function handleMapState(data) {
  if (!data) return
  isMapActive.value = true
  fogEnabled.value = data.fogEnabled
  const xn = data.viewport?.xn ?? (data.viewport?.x ?? 0)
  const yn = data.viewport?.yn ?? (data.viewport?.y ?? 0)
  const scale = data.viewport?.scale ?? 1
  applyNormViewport(xn, yn, scale)
  fogStrokes.value = Array.isArray(data.fogStrokes) ? data.fogStrokes : []
  mapTokens.value = (data.mapTokens && typeof data.mapTokens === 'object') ? data.mapTokens : {}
  applyGridConfig(data)
  fogCanvas = null
  fogMask = null
  const newUrl = data.mapUrl
  if (newUrl !== selectedImageUrl.value) {
    selectedImageUrl.value = newUrl
    const img = images.value.find(i => i.url === newUrl)
    selectedImageId.value = img?.id || null
    loadMapImage(newUrl)
  } else {
    rebuildFogCanvas()
    render()
  }
}

function handleFogUpdated({ enabled }) {
  fogEnabled.value = enabled
  render()
}

function handleFogPatch({ strokes }) {
  if (!Array.isArray(strokes)) return
  ensureFogCanvas()
  for (const s of strokes) {
    fogStrokes.value.push(s)
    addStrokeToFog(s)
  }
  render()
}

function handleFogReset() {
  fogStrokes.value = []
  fogCellsSet.clear()
  fogCells.value = []
  rebuildFogCanvas()
  render()
}

function handleFogCellsPatch({ cells }) {
  if (!Array.isArray(cells)) return
  cells.forEach(c => fogCellsSet.add(c))
  fogCells.value = [...fogCellsSet]
  render()
}

function handleFogCellsReset() {
  fogCellsSet.clear()
  fogCells.value = []
  render()
}

function handleMapTokenMoved({ playerId, nx, ny, name }) {
  const existing = mapTokens.value[String(playerId)] || {}
  mapTokens.value = { ...mapTokens.value, [String(playerId)]: { ...existing, nx, ny, ...(name !== undefined ? { name } : {}) } }
  render()
}

function handleMapTokenRemoved({ playerId }) {
  const next = { ...mapTokens.value }
  delete next[String(playerId)]
  mapTokens.value = next
  render()
}

function handleAdminState(data) {
  if (sessionStore.activeSession?.id !== data.sessionId) return
  if (data.tvMode === 'map' && data.mapState) handleMapState(data.mapState)
  if (data.tvMode === 'map') isMapActive.value = true
}

function handleTvModeChanged(payload) {
  if (payload?.mode === 'map') {
    isMapActive.value = true
    if (payload.mapState) handleMapState(payload.mapState)
  }
}

async function deleteImage(img, event) {
  event.stopPropagation()
  if (!confirm(`Supprimer "${img.original_name || img.url}" ?`)) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${img.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      if (selectedImageUrl.value === img.url) selectedImageUrl.value = null
      await loadImages()
    }
  } catch (err) { console.error(err) }
}

function selectImage(img) {
  selectedImageUrl.value = img.url
  selectedImageId.value = img.id
  gridType.value = img.grid_type || 'none'
  gridCols.value = img.grid_cols || 20
  gridRows.value = img.grid_rows || 15
  gridHexOrientation.value = img.grid_hex_orientation || 'flat'
  gridOffsetX.value = img.grid_offset_x ?? 0
  gridOffsetY.value = img.grid_offset_y ?? 0
  showGridConfig.value = false
  loadMapImage(img.url)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  loadImages()
  resizeObserver = new ResizeObserver(() => { fitCanvas(); render() })
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)

  const socket = getSocket()
  socket.on('map-state', handleMapState)
  socket.on('map-fog-updated', handleFogUpdated)
  socket.on('map-fog-patch', handleFogPatch)
  socket.on('map-fog-reset', handleFogReset)
  socket.on('map-fog-cells-patch', handleFogCellsPatch)
  socket.on('map-fog-cells-reset', handleFogCellsReset)
  socket.on('map-token-moved', handleMapTokenMoved)
  socket.on('map-token-removed', handleMapTokenRemoved)
  socket.on('admin-state', handleAdminState)
  socket.on('tv-mode-changed', handleTvModeChanged)
})

onUnmounted(() => {
  if (viewportDebounceTimer) clearTimeout(viewportDebounceTimer)
  if (resizeObserver) resizeObserver.disconnect()
  const socket = getSocket()
  socket.off('map-state', handleMapState)
  socket.off('map-fog-updated', handleFogUpdated)
  socket.off('map-fog-patch', handleFogPatch)
  socket.off('map-fog-reset', handleFogReset)
  socket.off('map-fog-cells-patch', handleFogCellsPatch)
  socket.off('map-fog-cells-reset', handleFogCellsReset)
  socket.off('map-token-moved', handleMapTokenMoved)
  socket.off('map-token-removed', handleMapTokenRemoved)
  socket.off('admin-state', handleAdminState)
  socket.off('tv-mode-changed', handleTvModeChanged)
})

watch(() => selectedImageUrl.value, (url) => { if (url && !mapImage) loadMapImage(url) })
watch(fogEnabled, () => render())
watch([gridCols, gridRows, gridType, gridHexOrientation, gridOffsetX, gridOffsetY], () => { if (showGridConfig.value) render() })
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

    <!-- Upload -->
    <div class="upload-card">
      <label class="upload-btn" data-testid="map-upload-btn" :class="{ disabled: uploading || !sessionStore.activeSession }">
        <AppIcon icon="lucide:upload" size="0.8em" />
        {{ uploading ? `Envoi… ${uploadProgress}%` : 'Téléverser des cartes' }}
        <input type="file" accept="image/*" multiple class="file-input" :disabled="uploading || !sessionStore.activeSession" @change="handleFileUpload" />
      </label>
      <div v-if="uploading" class="progress-track">
        <div class="progress-fill" :style="{ width: uploadProgress + '%' }" />
      </div>
      <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
    </div>

    <!-- Gallery -->
    <div v-if="images.length === 0" class="empty-state">
      <AppIcon icon="lucide:map" size="1.4em" />
      <p>Aucune carte téléversée pour cette session.</p>
      <p class="empty-hint">Utilisez le bouton ci-dessus pour en ajouter.</p>
    </div>
    <div v-else class="gallery">
      <div
          v-for="img in images"
          :key="img.id"
          class="gallery-item"
          :class="{ selected: selectedImageUrl === img.url }"
          @click="selectImage(img)"
      >
        <div class="thumb-wrapper">
          <img :src="imageFullUrl(img.thumbnail_url || img.url)" :alt="img.original_name || img.url" class="gallery-thumb" />
          <button class="delete-btn" @click="deleteImage(img, $event)" title="Supprimer">✕</button>
          <span v-if="img.grid_type && img.grid_type !== 'none'" class="grid-badge" :title="`Grille ${img.grid_type}`">
            <AppIcon :icon="img.grid_type === 'hex' ? 'lucide:hexagon' : 'lucide:grid-3x3'" size="0.7em" />
          </span>
        </div>
        <button class="show-btn" @click.stop="selectImage(img); showMapOnTv()">
          <AppIcon icon="lucide:map" size="0.85em" /> Carte TV
        </button>
      </div>
    </div>

    <!-- Map active: two-column layout — canvas left, controls right -->
    <template v-if="isMapActive && selectedImageUrl">
      <div class="map-active-layout">

        <!-- Left: Canvas -->
        <div class="map-canvas-col">
          <p class="hint-text canvas-hint">
            <template v-if="pendingTokenPlayerId">Cliquez sur la carte pour placer le jeton</template>
            <template v-else-if="showGridConfig && gridType !== 'none'">Aperçu grille — ajustez cols/lignes puis enregistrez</template>
            <template v-else-if="fogEnabled && gridType !== 'none'">Clic gauche sur une case pour la révéler · Molette pour zoomer · Molette centrale pour naviguer</template>
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
              @pointerleave="onPointerUp"
              @pointercancel="onPointerUp"
              @wheel.prevent="onWheel"
              @contextmenu.prevent
            />
          </div>
        </div>

        <!-- Right: Controls panel -->
        <div class="map-controls-col">

          <!-- Configuration de grille -->
          <div class="control-section">
            <h4 class="subsection-title">
              <AppIcon icon="lucide:grid-3x3" size="0.85em" /> Grille <HelpTip id="map.grid" />
            </h4>

            <div class="inline-actions">
              <button class="action-btn" :class="{ active: showGridConfig }" @click="showGridConfig = !showGridConfig">
                <AppIcon icon="lucide:settings-2" size="0.85em" />
                {{ showGridConfig ? 'Masquer' : 'Configurer' }}
              </button>
              <span v-if="gridDetecting" class="hint-text"><AppIcon icon="lucide:loader" size="0.8em" /> Détection…</span>
              <span v-else-if="gridType !== 'none'" class="grid-status-badge">
                <AppIcon :icon="gridType === 'hex' ? 'lucide:hexagon' : 'lucide:grid-3x3'" size="0.8em" />
                {{ gridType === 'hex' ? 'Hexagones' : 'Carrés' }} {{ gridCols }}×{{ gridRows }}
              </span>
              <span v-else class="hint-text">Peinture libre</span>
            </div>

            <template v-if="showGridConfig">
              <div class="grid-config-panel">
                <div class="grid-config-row">
                  <label class="grid-config-label">Type</label>
                  <div class="grid-type-selector">
                    <button
                      v-for="t in ['none','square','hex']"
                      :key="t"
                      class="type-btn"
                      :class="{ active: gridType === t }"
                      @click="gridType = t"
                    >
                      <AppIcon
                        :icon="t === 'hex' ? 'lucide:hexagon' : t === 'square' ? 'lucide:grid-3x3' : 'lucide:brush'"
                        size="0.8em"
                      />
                      {{ t === 'hex' ? 'Hexagones' : t === 'square' ? 'Carrés' : 'Libre' }}
                    </button>
                  </div>
                </div>

                <template v-if="gridType !== 'none'">
                  <div class="grid-config-row">
                    <label class="grid-config-label">Colonnes : {{ gridCols }}</label>
                    <input v-model.number="gridCols" type="range" min="2" max="100" class="brush-slider" />
                  </div>
                  <div class="grid-config-row">
                    <label class="grid-config-label">Lignes : {{ gridRows }}</label>
                    <input v-model.number="gridRows" type="range" min="2" max="100" class="brush-slider" />
                  </div>
                  <div v-if="gridType === 'hex'" class="grid-config-row">
                    <label class="grid-config-label">Orientation</label>
                    <div class="grid-type-selector">
                      <button class="type-btn" :class="{ active: gridHexOrientation === 'flat' }" @click="gridHexOrientation = 'flat'">Plate</button>
                      <button class="type-btn" :class="{ active: gridHexOrientation === 'pointy' }" @click="gridHexOrientation = 'pointy'">Pointue</button>
                    </div>
                  </div>
                  <div class="grid-config-row">
                    <label class="grid-config-label">Décalage X : {{ Math.round(gridOffsetX * 1000) / 1000 }}</label>
                    <input v-model.number="gridOffsetX" type="range" :min="-1 / gridCols" :max="1 / gridCols" :step="1 / gridCols / 20" class="brush-slider" />
                  </div>
                  <div class="grid-config-row">
                    <label class="grid-config-label">Décalage Y : {{ Math.round(gridOffsetY * 1000) / 1000 }}</label>
                    <input v-model.number="gridOffsetY" type="range" :min="-1 / gridRows" :max="1 / gridRows" :step="1 / gridRows / 20" class="brush-slider" />
                  </div>
                </template>

                <button class="action-btn save-grid-btn" :disabled="gridSaving" @click="saveGridConfig">
                  <AppIcon icon="lucide:save" size="0.85em" />
                  {{ gridSaving ? 'Enregistrement…' : 'Enregistrer la grille' }}
                </button>
              </div>
            </template>
          </div>

          <!-- Brouillard de guerre -->
          <div class="control-section">
            <h4 class="subsection-title"><AppIcon icon="lucide:cloud" size="0.85em" /> Brouillard <HelpTip id="map.fog" /></h4>
            <div class="inline-actions">
              <button class="action-btn" :class="{ active: fogEnabled }" @click="toggleFog">
                <AppIcon :icon="fogEnabled ? 'lucide:eye-off' : 'lucide:eye'" size="0.85em" />
                {{ fogEnabled ? 'Désactiver' : 'Activer' }}
              </button>
              <button class="action-btn danger-btn" :disabled="!fogEnabled" @click="resetFog">
                <AppIcon icon="lucide:refresh-cw" size="0.85em" /> Reset
              </button>
            </div>
            <template v-if="fogEnabled && gridType === 'none'">
              <div class="brush-controls">
                <label class="brush-label">
                  Rayon : {{ brushRadius }}px <HelpTip id="map.fog-brush" />
                  <input v-model.number="brushRadius" type="range" :min="MIN_BRUSH_RADIUS" :max="MAX_BRUSH_RADIUS" class="brush-slider" />
                </label>
              </div>
            </template>
          </div>

          <!-- Jetons de joueurs -->
          <div class="control-section">
            <h4 class="subsection-title"><AppIcon icon="game-icons:wizard-staff" size="0.85em" /> Jetons <HelpTip id="map.token-place" /></h4>
            <p v-if="sessionStore.players.length === 0" class="hint-text">Aucun joueur connecté.</p>
            <div v-else class="token-tray">
              <div
                v-for="player in sessionStore.players"
                :key="player.id"
                class="token-chip"
                :class="{
                  placed: !!mapTokens[String(player.id)],
                  pending: pendingTokenPlayerId === String(player.id),
                }"
                :title="mapTokens[String(player.id)] ? 'Cliquer pour retirer de la carte' : 'Cliquer pour placer sur la carte'"
                @click="toggleTokenPlacement(player.id)"
              >
                <div class="chip-avatar">
                  <img v-if="player.avatar_url" :src="imageFullUrl(player.avatar_url)" :alt="player.player_name" class="chip-img" />
                  <span v-else class="chip-initial">{{ player.player_name?.[0]?.toUpperCase() || '?' }}</span>
                </div>
                <span class="chip-name">{{ player.player_name }}</span>
                <span v-if="mapTokens[String(player.id)]" class="chip-badge">✓</span>
                <span v-else-if="pendingTokenPlayerId === String(player.id)" class="chip-badge pending-badge"><AppIcon icon="lucide:map-pin" size="0.75rem" /></span>
              </div>
            </div>

            <div class="custom-token-form">
              <input
                  v-model="customTokenName"
                  class="custom-token-input"
                  placeholder="Nom custom…"
                  maxlength="30"
                  @keydown.enter="addCustomToken"
              />
              <button
                  class="action-btn"
                  :class="{ active: pendingCustomToken }"
                  :disabled="!customTokenName.trim()"
                  @click="addCustomToken"
              >
                <AppIcon icon="lucide:map-pin" size="0.85em" />
              </button>
            </div>
            <p v-if="pendingCustomToken || pendingTokenPlayerId" class="hint-text placement-hint">
              <AppIcon icon="lucide:map-pin" size="0.85em" /> Cliquez sur la carte pour placer
            </p>
            <div v-if="Object.keys(mapTokens).some(k => k.startsWith('custom_'))" class="token-tray" style="margin-top:0.4rem">
              <template v-for="(tokenPos, pid) in mapTokens" :key="pid">
                <div v-if="String(pid).startsWith('custom_')" class="token-chip placed" @click="removeCustomToken(pid)"
                    title="Cliquer pour retirer"><span class="chip-initial" style="color:#6aaa44">{{
                    tokenPos.name?.[0]?.toUpperCase() || '?'
                  }}</span> <span class="chip-name">{{ tokenPos.name }}</span> <span class="chip-badge"
                                                                                    style="color:#6aaa44">✓</span></div>
              </template>
            </div>
          </div>

          <!-- Viewport Controls -->
          <div class="control-section">
            <h4 class="subsection-title"><AppIcon icon="lucide:maximize-2" size="0.85em" /> Viewport TV <HelpTip id="map.viewport" /></h4>
            <p class="viewport-info">
              x: {{ viewport.x.toFixed(0) }}, y: {{ viewport.y.toFixed(0) }}, zoom: {{ viewport.scale.toFixed(2) }}×
            </p>
            <div class="inline-actions">
              <button class="action-btn" @click="zoomIn">＋</button>
              <button class="action-btn" @click="zoomOut">－</button>
              <button class="action-btn" @click="resetViewport">↺</button>
            </div>
          </div>

        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.map-manager { position: relative; display: flex; flex-direction: column; gap: 1rem; }

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

.section-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin-bottom: 0.25rem;
}

.subsection-title {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-gold-dark);
  margin: 0 0 0.4rem;
}

.upload-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.55rem 0.75rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 8px;
}

.upload-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.3rem 0.8rem;
  background: var(--gradient-accent-action);
  border: 1px solid var(--color-gold-dark);
  border-radius: 6px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.07em;
  cursor: pointer;
  transition: background 0.2s;
}
.upload-btn:hover { background: var(--gradient-accent-action-hover); }
.upload-btn.disabled { opacity: 0.65; cursor: not-allowed; pointer-events: none; }
.file-input { display: none; }

.upload-error { color: var(--color-danger); font-family: var(--font-body), sans-serif; font-size: 0.8rem; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 2rem 1rem;
  color: var(--color-text-dim);
  font-family: var(--font-body), sans-serif;
  font-size: 0.85rem;
  text-align: center;
}
.empty-hint { font-size: 0.75rem; opacity: 0.7; }

.progress-track {
  flex: 1;
  min-width: 6rem;
  height: 5px;
  background: var(--surface-track);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-gold-dark), var(--color-gold-bright));
  transition: width 0.15s ease;
}

.gallery {
  columns: 2;
  column-gap: 0.75rem;
}
.gallery-item {
  break-inside: avoid;
  margin-bottom: 0.75rem;
}
.gallery-thumb {
  width: 100%;
  height: auto;
  aspect-ratio: unset;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  display: block;
}

.gallery-item.selected {
  border-color: var(--color-gold-bright);
}

.show-btn {
  width: 100%; padding: 0.3rem 0.25rem;
  background: var(--surface-gold-soft); border: 1px solid var(--color-gold-dark);
  border-radius: 6px; color: var(--color-gold);
  font-family: var(--font-heading), sans-serif; font-size: 0.6rem;
  letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s;
  text-align: center; white-space: nowrap;
}
.show-btn:hover { background: var(--surface-gold-soft-strong); border-color: var(--color-gold-bright); color: var(--color-gold-bright); }

.grid-badge {
  position: absolute;
  top: 4px; left: 4px;
  background: rgba(0,0,0,0.7);
  border: 1px solid var(--color-gold-dark);
  border-radius: 4px;
  padding: 2px 4px;
  color: var(--color-gold-bright);
  font-size: 0.6rem;
}

.grid-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  background: var(--surface-gold-soft);
  border: 1px solid var(--color-gold-dark);
  border-radius: 999px;
  color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
}

/* Grid config panel */
.grid-config-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  background: rgba(0,0,0,0.2);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.grid-config-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.grid-config-label {
  font-family: var(--font-heading), sans-serif;
  font-size: 0.68rem;
  color: var(--color-text-dim);
  letter-spacing: 0.05em;
  min-width: 7rem;
  flex-shrink: 0;
}
.grid-type-selector {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.type-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.65rem;
  background: var(--surface-raised, #1e1e2e);
  border: 1.5px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-dim);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.18s;
}
.type-btn:hover { border-color: var(--color-gold-dark); color: var(--color-gold); }
.type-btn.active { border-color: var(--color-gold-bright); color: var(--color-gold-bright); background: var(--surface-gold-soft); }

.save-grid-btn {
  width: 100%;
  margin-top: 0.2rem;
}

.control-section {
  background: var(--admin-panel-bg, var(--gradient-panel));
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;
}
.inline-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: center; }

.action-btn {
  padding: 0.45rem 0.85rem;
  background: var(--gradient-accent-action); border: 1px solid var(--color-gold-dark);
  border-radius: 8px; color: var(--color-gold-bright);
  font-family: var(--font-heading), sans-serif; font-size: 0.72rem; letter-spacing: 0.08em; cursor: pointer;
}
.action-btn:hover:not(:disabled) { background: var(--gradient-accent-action-hover); }
.action-btn.active { background: var(--gradient-accent-action-hover); border-color: var(--color-gold-bright); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-btn { border-color: var(--admin-danger-border, var(--color-danger-border)); color: var(--admin-danger-text, var(--color-danger)); background: var(--gradient-danger-action); }

.brush-controls { display: flex; flex-direction: column; gap: 0.4rem; }
.brush-label { display: flex; align-items: center; gap: 0.4rem; color: var(--color-text-dim); font-family: var(--font-heading), sans-serif; font-size: 0.7rem; }
.brush-slider { flex: 1; accent-color: var(--color-gold); }

/* ── Token tray ── */
.token-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.token-chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.55rem 0.3rem 0.35rem;
  background: var(--surface-raised, #1e1e2e);
  border: 1.5px solid var(--color-border);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.token-chip:hover { border-color: var(--color-gold-dark); background: var(--surface-gold-soft); }
.token-chip.placed { border-color: var(--color-gold-bright); background: var(--surface-gold-soft); }
.token-chip.pending { border-color: #a78bfa; background: rgba(139,92,246,0.15); animation: pulse-pending 1s infinite; }
@keyframes pulse-pending { 0%,100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.4); } 50% { box-shadow: 0 0 0 4px rgba(139,92,246,0); } }

.chip-avatar {
  width: 26px; height: 26px;
  border-radius: 50%; overflow: hidden;
  border: 1.5px solid var(--color-gold-dark);
  background: #111;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.chip-img { width: 100%; height: 100%; object-fit: cover; }
.chip-initial { font-family: var(--font-heading), sans-serif; font-size: 0.75rem; color: var(--color-gold-dark); }
.chip-name { font-family: var(--font-heading), sans-serif; font-size: 0.65rem; letter-spacing: 0.05em; color: var(--color-text-dim); }
.chip-badge { font-size: 0.7rem; color: var(--color-gold-bright); font-weight: bold; }
.pending-badge { color: #a78bfa; }

.placement-hint {
  color: #a78bfa !important;
  font-style: italic;
}

.viewport-info { font-family: var(--font-heading), sans-serif; font-size: 0.68rem; color: var(--color-text-dim); letter-spacing: 0.06em; margin: 0; }
.hint-text { font-family: var(--font-body), sans-serif; font-size: 0.75rem; color: var(--color-text-dim); margin: 0; }

/* ── Two-column map layout ── */
.map-active-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 0.75rem;
  align-items: start;
}

.map-canvas-col {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.map-controls-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 0;
  max-height: 80vh;
  overflow-y: auto;
  scrollbar-width: thin;
}

.canvas-hint {
  margin: 0;
}

.canvas-container {
  width: 100%;
  height: 72vh;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  background: #000;
  user-select: none;
}

.map-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

@media (max-width: 900px) {
  .map-active-layout {
    grid-template-columns: 1fr;
  }
  .map-controls-col {
    max-height: none;
    overflow-y: visible;
  }
  .canvas-container {
    height: 55vw;
    min-height: 280px;
  }
}

.thumb-wrapper {
  position: relative;
  width: 100%;
}
.delete-btn {
  position: absolute;
  top: 4px; right: 4px;
  width: 20px; height: 20px;
  background: rgba(0,0,0,0.7);
  border: 1px solid var(--color-danger, #e74c3c);
  border-radius: 50%;
  color: var(--color-danger, #e74c3c);
  font-size: 0.6rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0;
  line-height: 1;
}
.thumb-wrapper:hover .delete-btn { opacity: 1; }

.custom-token-form {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.custom-token-input {
  flex: 1;
  padding: 0.35rem 0.6rem;
  background: var(--surface-raised, #1e1e2e);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text, #fff);
  font-family: var(--font-heading), sans-serif;
  font-size: 0.72rem;
  outline: none;
}
.custom-token-input:focus {
  border-color: var(--color-gold-dark);
}
</style>
