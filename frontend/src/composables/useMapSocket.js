import { getSocket } from '@/socket.js'
import { sessionStore } from '@/stores/session.js'

export function useMapSocket({
  isMapActive,
  fogEnabled,
  fogStrokes,
  fogCells,
  fogCellsSet,
  mapTokens,
  selectedImageUrl,
  selectedImageId,
  images,
  viewport,
  gridType,
  applyGridConfig,
  applyNormViewport,
  rebuildFogCanvas,
  ensureFogCanvas,
  addStrokeToFog,
  render,
  loadMapImage,
  showMapList,
  getBaseScale,
}) {
  function handleMapState(data) {
    if (!data) return
    isMapActive.value = true
    showMapList.value = false
    fogEnabled.value = data.fogEnabled
    const xn = data.viewport?.xn ?? (data.viewport?.x ?? 0)
    const yn = data.viewport?.yn ?? (data.viewport?.y ?? 0)
    const scale = data.viewport?.scale ?? 1
    applyNormViewport(xn, yn, scale)
    fogStrokes.value = Array.isArray(data.fogStrokes) ? data.fogStrokes : []
    mapTokens.value = (data.mapTokens && typeof data.mapTokens === 'object') ? data.mapTokens : {}
    applyGridConfig(data)
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

  function register() {
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
  }

  function unregister() {
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
  }

  // Emitters
  function emitShowMap(imageUrl) {
    if (!imageUrl || !sessionStore.activeSession) return
    const socket = getSocket()
    socket.emit('show-map', { sessionId: sessionStore.activeSession.id, imageUrl })
    socket.emit('map-set-fog', { sessionId: sessionStore.activeSession.id, enabled: true })
  }

function emitToggleFog(enabled) {
  if (!sessionStore.activeSession) return
  const socket = getSocket()
  socket.emit('map-set-fog', { sessionId: sessionStore.activeSession.id, enabled })
}

  function emitResetFog(isGrid) {
    const socket = getSocket()
    if (isGrid) {
      socket.emit('map-fog-cells-reset', { sessionId: sessionStore.activeSession.id })
    } else {
      socket.emit('map-fog-reset', { sessionId: sessionStore.activeSession.id })
    }
  }

  function emitFogStroke(stroke) {
    const socket = getSocket()
    socket.emit('map-fog-clear', { sessionId: sessionStore.activeSession.id, strokes: [stroke] })
  }

  function emitCellReveal(idx) {
    const socket = getSocket()
    socket.emit('map-fog-cell-reveal', { sessionId: sessionStore.activeSession.id, cells: [idx] })
  }

  function emitViewport(xn, yn, scale) {
    const socket = getSocket()
    socket.emit('map-viewport-update', { sessionId: sessionStore.activeSession.id, xn, yn, scale })
  }

  function emitTokenMove(playerId, nx, ny, name) {
    const socket = getSocket()
    socket.emit('map-token-move', { sessionId: sessionStore.activeSession.id, playerId, nx, ny, ...(name ? { name } : {}) })
  }

  function emitTokenRemove(playerId) {
    const socket = getSocket()
    socket.emit('map-token-remove', { sessionId: sessionStore.activeSession.id, playerId })
  }

  function emitSyncGrid(gridData) {
    const socket = getSocket()
    socket.emit('map-sync-grid', { sessionId: sessionStore.activeSession.id, ...gridData })
  }

  return {
    register, unregister,
    emitShowMap, emitToggleFog, emitResetFog,
    emitFogStroke, emitCellReveal,
    emitViewport, emitTokenMove, emitTokenRemove, emitSyncGrid,
  }
}
