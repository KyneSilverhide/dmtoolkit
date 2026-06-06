/**
 * Shared grid geometry utilities for map fog-of-war cell-based reveal.
 * Used by both MapManager (admin) and TvView (TV) to ensure identical cell boundaries.
 *
 * Coordinate system: all positions are normalised to [0,1] relative to the map image dimensions.
 * Cell indices are row-major: index = row * cols + col, 0-based.
 */

// ── Square grid ────────────────────────────────────────────────────────────

/**
 * Returns the cell index [0, cols*rows) for a normalised (nx, ny) position in a square grid.
 * Returns -1 if outside the grid.
 */
export function getSquareCellAt(nx, ny, cols, rows) {
  if (nx < 0 || nx >= 1 || ny < 0 || ny >= 1) return -1
  const col = Math.floor(nx * cols)
  const row = Math.floor(ny * rows)
  return row * cols + col
}

/**
 * Returns an array of normalised {nx, ny} corner points for the given square cell index.
 */
export function getSquareCellPolygon(idx, cols, rows) {
  const col = idx % cols
  const row = Math.floor(idx / cols)
  const x0 = col / cols
  const y0 = row / rows
  const x1 = (col + 1) / cols
  const y1 = (row + 1) / rows
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
export function getHexCellAt(nx, ny, cols, rows, orientation = 'flat') {
  if (orientation === 'pointy') {
    return _getHexCellPointy(nx, ny, cols, rows)
  }
  return _getHexCellFlat(nx, ny, cols, rows)
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
  return dx <= 1 && dy <= 1 && dx + dy * 0.5 <= 1.5
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
  return dy <= 1 && dx <= 1 && dy + dx * 0.5 <= 1.5
}

/**
 * Returns normalised polygon points for a hex cell (6 vertices).
 */
export function getHexCellPolygon(idx, cols, rows, orientation = 'flat') {
  const col = idx % cols
  const row = Math.floor(idx / cols)
  if (orientation === 'pointy') {
    const hexW = 1 / cols
    const hexH = 1 / (rows * 0.75 + 0.25)
    const offsetX = (row % 2 === 1) ? hexW / 2 : 0
    const cx = (col + 0.5) * hexW + offsetX
    const cy = (row * 0.75 + 0.5) * hexH
    return _hexVertices(cx, cy, hexW / 2, hexH / 2, 'pointy')
  }
  const hexW = 1 / (cols * 0.75 + 0.25)
  const hexH = 1 / rows
  const offsetY = (col % 2 === 1) ? hexH / 2 : 0
  const cx = (col * 0.75 + 0.5) * hexW
  const cy = (row + 0.5) * hexH + offsetY
  return _hexVertices(cx, cy, hexW / 2, hexH / 2, 'flat')
}

function _hexVertices(cx, cy, rx, ry, orientation) {
  const angles = orientation === 'pointy'
    ? [30, 90, 150, 210, 270, 330]
    : [0, 60, 120, 180, 240, 300]
  return angles.map(deg => {
    const rad = (deg * Math.PI) / 180
    return { nx: cx + rx * Math.cos(rad), ny: cy + ry * Math.sin(rad) }
  })
}

// ── Unified dispatch ───────────────────────────────────────────────────────

/**
 * Returns the cell index for a normalised position given grid config.
 */
export function getCellAt(nx, ny, gridType, cols, rows, hexOrientation = 'flat') {
  if (gridType === 'square') return getSquareCellAt(nx, ny, cols, rows)
  if (gridType === 'hex') return getHexCellAt(nx, ny, cols, rows, hexOrientation)
  return -1
}

/**
 * Returns normalised polygon points for a cell index.
 */
export function getCellPolygon(idx, gridType, cols, rows, hexOrientation = 'flat') {
  if (gridType === 'square') return getSquareCellPolygon(idx, cols, rows)
  if (gridType === 'hex') return getHexCellPolygon(idx, cols, rows, hexOrientation)
  return []
}

// ── Grid detection (best-effort, square only) ──────────────────────────────

/**
 * Analyses an HTMLImageElement to suggest a square grid configuration.
 * Returns { type: 'square'|'none', cols, rows }.
 *
 * Algorithm: project edge-filtered rows/columns onto 1D signals, then find
 * the dominant period via autocorrelation.
 *
 * @param {HTMLImageElement} img
 * @returns {{ type: 'square'|'none', cols: number, rows: number }}
 */
export function detectGrid(img) {
  const MAX_DIM = 600
  const W = img.naturalWidth
  const H = img.naturalHeight
  const scale = Math.min(1, MAX_DIM / Math.max(W, H))
  const w = Math.round(W * scale)
  const h = Math.round(H * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255
  }

  // Horizontal projection: sum of vertical gradients per column
  const colProj = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    let s = 0
    for (let y = 1; y < h - 1; y++) {
      s += Math.abs(gray[y * w + x] - gray[(y - 1) * w + x])
    }
    colProj[x] = s
  }

  // Vertical projection: sum of horizontal gradients per row
  const rowProj = new Float32Array(h)
  for (let y = 0; y < h; y++) {
    let s = 0
    for (let x = 1; x < w - 1; x++) {
      s += Math.abs(gray[y * w + x] - gray[y * w + x - 1])
    }
    rowProj[y] = s
  }

  const colPeriod = _dominantPeriod(colProj)
  const rowPeriod = _dominantPeriod(rowProj)

  if (!colPeriod || !rowPeriod) return { type: 'none', cols: 20, rows: 15 }

  const cols = Math.round(w / colPeriod)
  const rows = Math.round(h / rowPeriod)
  if (cols < 3 || rows < 3 || cols > 100 || rows > 100) return { type: 'none', cols: 20, rows: 15 }

  return { type: 'square', cols, rows }
}

function _dominantPeriod(proj) {
  const n = proj.length
  if (n < 6) return null

  const mean = proj.reduce((a, b) => a + b, 0) / n
  const centered = proj.map(v => v - mean)

  let bestLag = 0
  let bestVal = -Infinity
  for (let lag = 4; lag <= n / 2; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) sum += centered[i] * centered[i + lag]
    if (sum > bestVal) { bestVal = sum; bestLag = lag }
  }

  const zeroCorr = centered.reduce((a, v) => a + v * v, 0)
  if (zeroCorr === 0 || bestVal / zeroCorr < 0.1) return null
  return bestLag
}
