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

// ── Grid detection (best-effort, square only) ──────────────────────────────

/**
 * Analyses an HTMLImageElement to suggest a square grid configuration.
 * Returns { type: 'square'|'none', cols, rows, offsetX, offsetY }.
 *
 * Algorithm: project edge-filtered rows/columns onto 1D signals, then find
 * the dominant period via autocorrelation and the phase via peak alignment.
 *
 * @param {HTMLImageElement} img
 * @returns {{ type: 'square'|'none', cols: number, rows: number, offsetX: number, offsetY: number }}
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

  if (!colPeriod || !rowPeriod) return { type: 'none', cols: 20, rows: 15, offsetX: 0, offsetY: 0 }

  const cols = Math.round(w / colPeriod)
  const rows = Math.round(h / rowPeriod)
  if (cols < 3 || rows < 3 || cols > 100 || rows > 100) return { type: 'none', cols: 20, rows: 15, offsetX: 0, offsetY: 0 }

  // Detect the phase (offset) of the grid: find the shift that aligns peaks with gridlines
  const rawOffsetX = _dominantPhase(colProj, colPeriod) / w
  const rawOffsetY = _dominantPhase(rowProj, rowPeriod) / h

  // Normalise offset to [0, 1/cols) and [0, 1/rows) so it stays within one cell period.
  // `Math.floor(rawOffset * cols) / cols` removes any whole-cell shift (integer multiples
  // of the cell size), leaving only the fractional sub-cell offset that actually moves
  // the gridlines.  The result is the phase in the same normalised [0,1] space as
  // the image coordinates.
  const offsetX = rawOffsetX - Math.floor(rawOffsetX * cols) / cols
  const offsetY = rawOffsetY - Math.floor(rawOffsetY * rows) / rows

  return { type: 'square', cols, rows, offsetX, offsetY }
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

/**
 * Finds the phase of the dominant periodic signal in `proj` given its `period`.
 * Returns the index (in pixels) of the first peak.
 */
function _dominantPhase(proj, period) {
  const n = proj.length
  const step = Math.max(1, Math.round(period))
  let bestPhase = 0
  let bestVal = -Infinity
  for (let phase = 0; phase < step; phase++) {
    let sum = 0
    for (let k = phase; k < n; k += step) sum += proj[k]
    if (sum > bestVal) { bestVal = sum; bestPhase = phase }
  }
  return bestPhase
}

