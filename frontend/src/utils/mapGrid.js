/**
 * Shared grid geometry utilities for map fog-of-war cell-based reveal.
 * Used by both MapManager (admin) and TvView (TV) to ensure identical cell boundaries.
 *
 * Coordinate system: all positions are normalised to [0,1] relative to the map image dimensions.
 * Cell indices are row-major: index = row * cols + col, 0-based.
 *
 * Grid offsets (offsetX, offsetY) are normalised fractions that shift the grid origin.
 * A positive offset shifts the grid right/down so that the first gridline appears at that
 * fraction of the image width/height.  Partial cells at the leading edges are valid cells
 * (index still starts at 0 from the shifted origin).
 */

// ── Square grid ────────────────────────────────────────────────────────────

/**
 * Returns the cell index [0, cols*rows) for a normalised (nx, ny) position in a square grid.
 * Returns -1 if outside the grid.
 */
export function getSquareCellAt(nx, ny, cols, rows, offsetX = 0, offsetY = 0) {
  const rx = nx - offsetX
  const ry = ny - offsetY
  const col = Math.floor(rx * cols)
  const row = Math.floor(ry * rows)
  if (col < 0 || col >= cols || row < 0 || row >= rows) return -1
  return row * cols + col
}

/**
 * Returns an array of normalised {nx, ny} corner points for the given square cell index.
 */
export function getSquareCellPolygon(idx, cols, rows, offsetX = 0, offsetY = 0) {
  const col = idx % cols
  const row = Math.floor(idx / cols)
  const x0 = offsetX + col / cols
  const y0 = offsetY + row / rows
  const x1 = offsetX + (col + 1) / cols
  const y1 = offsetY + (row + 1) / rows
  return [{ nx: x0, ny: y0 }, { nx: x1, ny: y0 }, { nx: x1, ny: y1 }, { nx: x0, ny: y1 }]
}

// ── Hex grid ───────────────────────────────────────────────────────────────
// "flat" = flat-top hexagons (columns of offset rows)
// "pointy" = pointy-top hexagons (rows of offset columns)

/**
 * Returns the cell index for a normalised (nx, ny) position in a hex grid.
 * Uses offset coordinates (odd-q for flat, odd-r for pointy).
 * Returns -1 if outside the grid.
 */
export function getHexCellAt(nx, ny, cols, rows, orientation = 'flat', offsetX = 0, offsetY = 0) {
  if (orientation === 'pointy') {
    return _getHexCellPointy(nx - offsetX, ny - offsetY, cols, rows)
  }
  return _getHexCellFlat(nx - offsetX, ny - offsetY, cols, rows)
}

function _getHexCellFlat(nx, ny, cols, rows) {
  const hexW = 1 / (cols * 0.75 + 0.25)
  const hexH = 1 / rows
  const col = Math.floor(nx / (hexW * 0.75))
  if (col < 0 || col >= cols) return -1
  const offsetY = (col % 2 === 1) ? hexH / 2 : 0
  const row = Math.floor((ny - offsetY) / hexH)
  if (row < 0 || row >= rows) return -1
  const cx = (col * 0.75 + 0.5) * hexW
  const cy = (row + 0.5) * hexH + offsetY
  if (_inFlatHex(nx, ny, cx, cy, hexW, hexH)) return row * cols + col
  const candidates = [
    [col - 1, (col - 1) % 2 === 1 ? row - 1 : row],
    [col - 1, (col - 1) % 2 === 1 ? row : row + 1],
  ]
  for (const [c, r] of candidates) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue
    const off = (c % 2 === 1) ? hexH / 2 : 0
    const ccx = (c * 0.75 + 0.5) * hexW
    const ccy = (r + 0.5) * hexH + off
    if (_inFlatHex(nx, ny, ccx, ccy, hexW, hexH)) return r * cols + c
  }
  return row >= 0 && row < rows ? row * cols + Math.max(0, Math.min(cols - 1, col)) : -1
}

function _inFlatHex(nx, ny, cx, cy, w, h) {
  const dx = Math.abs(nx - cx) / (w / 2)
  const dy = Math.abs(ny - cy) / (h / 2)
  return dx <= 1 && dy <= 1 && dx + dy * 0.5 <= 1
}

function _getHexCellPointy(nx, ny, cols, rows) {
  const hexW = 1 / cols
  const hexH = 1 / (rows * 0.75 + 0.25)
  const row = Math.floor(ny / (hexH * 0.75))
  if (row < 0 || row >= rows) return -1
  const offsetX = (row % 2 === 1) ? hexW / 2 : 0
  const col = Math.floor((nx - offsetX) / hexW)
  if (col < 0 || col >= cols) return -1
  const cx = (col + 0.5) * hexW + offsetX
  const cy = (row * 0.75 + 0.5) * hexH
  if (_inPointyHex(nx, ny, cx, cy, hexW, hexH)) return row * cols + col
  const candidates = [
    [(row - 1) % 2 === 1 ? col - 1 : col, row - 1],
    [(row - 1) % 2 === 1 ? col : col + 1, row - 1],
  ]
  for (const [c, r] of candidates) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue
    const off = (r % 2 === 1) ? hexW / 2 : 0
    const ccx = (c + 0.5) * hexW + off
    const ccy = (r * 0.75 + 0.5) * hexH
    if (_inPointyHex(nx, ny, ccx, ccy, hexW, hexH)) return r * cols + c
  }
  return row >= 0 && row < rows ? row * cols + Math.max(0, Math.min(cols - 1, col)) : -1
}

function _inPointyHex(nx, ny, cx, cy, w, h) {
  const dx = Math.abs(nx - cx) / (w / 2)
  const dy = Math.abs(ny - cy) / (h / 2)
  return dy <= 1 && dx <= 1 && dy + dx * 0.5 <= 1
}

/**
 * Returns normalised polygon points for a hex cell (6 vertices).
 */
export function getHexCellPolygon(idx, cols, rows, orientation = 'flat', offsetX = 0, offsetY = 0) {
  const col = idx % cols
  const row = Math.floor(idx / cols)
  if (orientation === 'pointy') {
    const hexW = 1 / cols
    const hexH = 1 / (rows * 0.75 + 0.25)
    const offX = (row % 2 === 1) ? hexW / 2 : 0
    const cx = offsetX + (col + 0.5) * hexW + offX
    const cy = offsetY + (row * 0.75 + 0.5) * hexH
    return _hexVertices(cx, cy, hexW / 2, hexH / 2, 'pointy')
  }
  const hexW = 1 / (cols * 0.75 + 0.25)
  const hexH = 1 / rows
  const offY = (col % 2 === 1) ? hexH / 2 : 0
  const cx = offsetX + (col * 0.75 + 0.5) * hexW
  const cy = offsetY + (row + 0.5) * hexH + offY
  return _hexVertices(cx, cy, hexW / 2, hexH / 2, 'flat')
}

function _hexVertices(cx, cy, rx, ry, orientation) {
  const hrx = rx / 2
  const hry = ry / 2
  if (orientation === 'pointy') {
    // Pointy-top: top/bottom tips at cy ± ry; flat sides at cx ± rx; diagonals at cy ± ry/2
    return [
      { nx: cx + rx, ny: cy + hry }, // lower-right
      { nx: cx,      ny: cy + ry },  // bottom tip
      { nx: cx - rx, ny: cy + hry }, // lower-left
      { nx: cx - rx, ny: cy - hry }, // upper-left
      { nx: cx,      ny: cy - ry },  // top tip
      { nx: cx + rx, ny: cy - hry }, // upper-right
    ]
  }
  // Flat-top: left/right tips at cx ± rx; flat top/bottom at cy ± ry; diagonals at cx ± rx/2
  return [
    { nx: cx + rx,  ny: cy },       // right tip
    { nx: cx + hrx, ny: cy + ry },  // lower-right
    { nx: cx - hrx, ny: cy + ry },  // lower-left
    { nx: cx - rx,  ny: cy },       // left tip
    { nx: cx - hrx, ny: cy - ry },  // upper-left
    { nx: cx + hrx, ny: cy - ry },  // upper-right
  ]
}

// ── Unified dispatch ───────────────────────────────────────────────────────

/**
 * Returns the cell index for a normalised position given grid config.
 */
export function getCellAt(nx, ny, gridType, cols, rows, hexOrientation = 'flat', offsetX = 0, offsetY = 0) {
  if (gridType === 'square') return getSquareCellAt(nx, ny, cols, rows, offsetX, offsetY)
  if (gridType === 'hex') return getHexCellAt(nx, ny, cols, rows, hexOrientation, offsetX, offsetY)
  return -1
}

/**
 * Returns normalised polygon points for a cell index.
 */
export function getCellPolygon(idx, gridType, cols, rows, hexOrientation = 'flat', offsetX = 0, offsetY = 0) {
  if (gridType === 'square') return getSquareCellPolygon(idx, cols, rows, offsetX, offsetY)
  if (gridType === 'hex') return getHexCellPolygon(idx, cols, rows, hexOrientation, offsetX, offsetY)
  return []
}
