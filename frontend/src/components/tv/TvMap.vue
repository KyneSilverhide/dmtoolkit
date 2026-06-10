<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getCellPolygon } from '@/utils/mapGrid.js'
import { BACKEND_URL } from '@/config.js'

const props = defineProps({
  mapUrl: { type: String, default: null },
  fogEnabled: { type: Boolean, default: false },
  mapViewport: { type: Object, default: () => ({ xn: 0, yn: 0, scale: 1 }) },
  fogStrokes: { type: Array, default: () => [] },
  fogCells: { type: Array, default: () => [] },
  mapTokens: { type: Object, default: () => ({}) },
  gridType: { type: String, default: 'none' },
  gridCols: { type: Number, default: 20 },
  gridRows: { type: Number, default: 15 },
  gridHexOrientation: { type: String, default: 'flat' },
  gridOffsetX: { type: Number, default: 0 },
  gridOffsetY: { type: Number, default: 0 },
  gridCellW: { type: Number, default: null },
  gridCellH: { type: Number, default: null },
  players: { type: Array, default: () => [] },
})

const mapContainerRef = ref(null)
const mapFogCanvas = ref(null)
const mapImageSize = ref({ w: 0, h: 0 })

// Rebuild local Set on fogCells prop change (O(1) lookup during render)
let fogCellsSet = new Set()
watch(() => props.fogCells, (cells) => {
  fogCellsSet = new Set(cells)
  nextTick(renderMapFog)
}, { immediate: true })

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

function getPlayerById(playerId) {
  return props.players.find(p => String(p.id) === String(playerId)) || null
}

const mapImageStyle = computed(() => {
  const container = mapContainerRef.value
  if (!container) return {}
  const W = container.offsetWidth || 1920
  const H = container.offsetHeight || 1080
  const natW = mapImageSize.value.w || 1920
  const natH = mapImageSize.value.h || 1080
  const vp = props.mapViewport
  const baseScale = Math.min(W / natW, H / natH)
  const totalScale = baseScale * vp.scale
  const imgW = natW * totalScale
  const imgH = natH * totalScale
  const offsetX = W / 2 - imgW / 2 + (vp.xn * natW * baseScale)
  const offsetY = H / 2 - imgH / 2 + (vp.yn * natH * baseScale)
  return {
    position: 'absolute',
    left: `${offsetX}px`,
    top: `${offsetY}px`,
    width: `${imgW}px`,
    height: `${imgH}px`,
    transform: 'none',
  }
})

const mapTokenStyles = computed(() => {
  const result = {}
  const container = mapContainerRef.value
  if (!container || !mapImageSize.value.w) return result
  const W = container.offsetWidth || 1920
  const H = container.offsetHeight || 1080
  const natW = mapImageSize.value.w
  const natH = mapImageSize.value.h
  const vp = props.mapViewport
  const baseScale = Math.min(W / natW, H / natH)
  const totalScale = baseScale * vp.scale
  const imgW = natW * totalScale
  const imgH = natH * totalScale
  const offsetX = W / 2 - imgW / 2 + (vp.xn * natW * baseScale)
  const offsetY = H / 2 - imgH / 2 + (vp.yn * natH * baseScale)
  for (const [pid, pos] of Object.entries(props.mapTokens)) {
    const tx = offsetX + pos.nx * natW * totalScale
    const ty = offsetY + pos.ny * natH * totalScale
    result[pid] = { left: `${tx}px`, top: `${ty}px` }
  }
  return result
})

function renderMapFog() {
  const canvas = mapFogCanvas.value
  if (!canvas) return
  const container = mapContainerRef.value
  if (!container) return
  const W = container.offsetWidth || 1920
  const H = container.offsetHeight || 1080
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)
  if (!props.fogEnabled) return
  const natW = mapImageSize.value.w
  const natH = mapImageSize.value.h
  if (!natW || !natH) return
  const vp = props.mapViewport
  const baseScale = Math.min(W / natW, H / natH)
  const totalScale = baseScale * vp.scale
  const imgW = natW * totalScale
  const imgH = natH * totalScale
  const offsetX = W / 2 - imgW / 2 + (vp.xn * natW * baseScale)
  const offsetY = H / 2 - imgH / 2 + (vp.yn * natH * baseScale)

  if (props.gridType !== 'none') {
    const cols = props.gridCols
    const rows = props.gridRows
    const type = props.gridType
    const orientation = props.gridHexOrientation
    const gox = props.gridOffsetX
    const goy = props.gridOffsetY
    const totalCells = cols * rows
    ctx.save()
    ctx.beginPath()
    ctx.rect(offsetX, offsetY, imgW, imgH)
    ctx.clip()
    for (let idx = 0; idx < totalCells; idx++) {
      if (fogCellsSet.has(idx)) continue
      const points = getCellPolygon(idx, type, cols, rows, orientation, gox, goy, props.gridCellW, props.gridCellH)
      if (!points.length) continue
      ctx.beginPath()
      ctx.moveTo(offsetX + points[0].nx * imgW, offsetY + points[0].ny * imgH)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(offsetX + points[i].nx * imgW, offsetY + points[i].ny * imgH)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.fill()
    }
    ctx.restore()
    return
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fillRect(0, 0, W, H)
  if (props.fogStrokes.length === 0) return
  ctx.globalCompositeOperation = 'destination-out'
  for (const stroke of props.fogStrokes) {
    ctx.beginPath()
    ctx.arc(
      offsetX + stroke.nx * natW * totalScale,
      offsetY + stroke.ny * natH * totalScale,
      stroke.nr * natW * totalScale,
      0, Math.PI * 2
    )
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function onMapImageLoad(e) {
  mapImageSize.value = { w: e.target.naturalWidth, h: e.target.naturalHeight }
  renderMapFog()
}

watch(() => props.mapViewport, () => nextTick(renderMapFog), { deep: true })
watch(() => props.fogEnabled, () => nextTick(renderMapFog))
watch(() => props.fogStrokes, () => renderMapFog(), { deep: true })
watch(() => props.mapUrl, () => { mapImageSize.value = { w: 0, h: 0 } })

onMounted(() => window.addEventListener('resize', renderMapFog))
onUnmounted(() => window.removeEventListener('resize', renderMapFog))
</script>

<template>
  <div ref="mapContainerRef" class="map-display" data-testid="tv-mode-map">
    <img
      :src="resolveMediaUrl(mapUrl)"
      class="map-image"
      :style="mapImageStyle"
      alt="Carte"
      @load="onMapImageLoad"
    />
    <canvas ref="mapFogCanvas" class="map-fog-canvas" />
    <div class="map-tokens-layer">
      <div
        v-for="pid in Object.keys(mapTokens)"
        :key="pid"
        class="map-token-placed"
        :style="mapTokenStyles[pid]"
      >
        <div
          class="token-circle"
          :style="String(pid).startsWith('custom_') ? { borderColor: '#6aaa44', boxShadow: '0 0 20px rgba(0,0,0,0.9), 0 0 12px rgba(106,170,68,0.5)' } : {}"
        >
          <img
            v-if="getPlayerById(pid)?.avatar_url"
            :src="resolveMediaUrl(getPlayerById(pid).avatar_url)"
            :alt="getPlayerById(pid)?.player_name"
            class="token-avatar-img"
          />
          <span v-else class="token-initial-letter">
            {{ (getPlayerById(pid)?.player_name || mapTokens[pid]?.name || '?')[0]?.toUpperCase() }}
          </span>
        </div>
        <span class="token-label">{{ getPlayerById(pid)?.player_name || mapTokens[pid]?.name || `[pid=${pid}]` }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-display {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #000;
}
.map-image {
  position: absolute;
  max-width: none;
  display: block;
  z-index: 1;
  user-select: none;
  pointer-events: none;
}
.map-fog-canvas {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 2;
  pointer-events: none;
}
.map-tokens-layer {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 3;
  pointer-events: none;
}
.map-token-placed {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  transform: translate(-50%, -50%);
}
.token-circle {
  width: 84px; height: 84px;
  border-radius: 50%;
  border: 4px solid #c9a227;
  overflow: hidden;
  background: #1a1230;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 20px rgba(0,0,0,0.9), 0 0 12px rgba(201,162,39,0.5);
  flex-shrink: 0;
}
.token-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.token-initial-letter {
  font-family: var(--font-heading), sans-serif;
  font-size: 2.4rem;
  color: #c9a227;
  font-weight: 700;
  line-height: 1;
}
.token-label {
  font-family: var(--font-heading), sans-serif;
  font-size: clamp(0.6rem, 1.2vw, 0.85rem);
  color: #fff;
  text-shadow: 0 1px 4px #000, 0 0 8px #000;
  letter-spacing: 0.06em;
  text-align: center;
  white-space: nowrap;
  background: rgba(0,0,0,0.55);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
