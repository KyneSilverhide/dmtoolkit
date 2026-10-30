/**
 * Détection automatique de la grille (carrée / hexagonale) d'une battlemap.
 *
 * Chaque étape répond à une seule question :
 *  1. Quels pas possibles ? Les projections du gradient sur X et Y donnent des
 *     périodes candidates (autocorrélation).
 *  2. Quelle grille ? Une grille carrée se reconnaît directement à ces pics : ses
 *     lignes sont droites. Un hexagone étale ses arêtes obliques sur les
 *     projections, dont les pics se trompent volontiers de multiple : chaque
 *     hypothèse est donc vérifiée en 2D. Le gradient de toute l'image est replié
 *     sur une tuile du réseau, où une vraie grille fait ressortir une position
 *     du gabarit de toutes les autres, et les multiples perdent cette netteté.
 *  3. Où s'arrête-t-elle ? Les cases sont gardées d'après la couleur de la marge
 *     si l'image en a une, sinon d'après leurs arêtes.
 *
 * Modèle de grille identique à frontend/src/utils/mapGrid.js (avec cellW/cellH) :
 *   carrée  : cellule de cellW × cellH, origine à (offsetX, offsetY)
 *   flat    : centres cx = ox + (col·0.75 + 0.5)·hexW, cy = oy + (row + 0.5)·hexH (+ hexH/2 col impaire)
 *   pointy  : centres cx = ox + (col + 0.5)·hexW (+ hexW/2 row impaire), cy = oy + (row·0.75 + 0.5)·hexH
 */

const sharp = require('sharp')

// Laisse passer les sockets et les requêtes des autres sessions entre deux calculs longs.
const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve))

const MAX_ANALYSIS_DIM = 2000
const MIN_SIZE = 64
const GRADIENT_CLIP = 24          // écrêtage par pixel : les contours du décor n'écrasent pas les fines lignes
const MIN_DIVISIONS = 4           // nombre minimal de cases visibles par axe
const MIN_PERIOD_RATIO = 0.009    // sous ~0.9 % de la dimension, le bruit de texture domine
const BINARIZE_QUANTILE = 0.8     // seuil de binarisation (quantile des valeurs positives)
const PERIOD_PEAKS = 8            // pics d'autocorrélation retenus par axe
const MAX_PERIOD_MULTIPLE = 6     // un pic peut être un sous-multiple du vrai pas
const RATIO_TOLERANCE = 0.13      // écart toléré au rapport des pas de chaque type de grille
const MAX_HYPOTHESES = 40         // couples de pas vérifiés pour les hexagones
const COARSE_TILE_SIZE = 48       // côté de la tuile de la recherche exhaustive
const REFINED_HYPOTHESES = 3
const MIN_HEX_SALIENCE = 5.5      // calibré sur des cartes réelles : hexagones ≥ 6.5, sans grille ≤ 4
const FULL_HEX_SALIENCE = 8.5     // saillance correspondant à une confiance de 1
const MIN_SQUARE_SCORE = 0.6      // score harmonique : cartes à grille carrée ≥ 0.82, sans grille ≤ 0.48
const FULL_SQUARE_SCORE = 1.8     // score correspondant à une confiance de 1
const COMB_RANGE = 0.03           // ajustement relatif du pas d'une grille carrée
const COMB_PERIOD_STEP = 0.05
const REFINE_STEPS = [0.02, 0.01, 0.005, 0.0025, 0.001]  // ajustement relatif de la taille des cases
const EDGE_ENERGY_RATIO = 0.4     // une case sans marge est gardée au-dessus de cette part de la médiane
const MIN_ROW_FILL = 0.15         // part de la rangée la plus remplie sous laquelle une rangée est du décor
const MARGIN_CORNER_RATIO = 0.025 // côté des zones d'échantillonnage des coins (part de la petite dimension)
const MARGIN_CORNERS_MAX_DISTANCE = 25  // écart maximal entre coins pour y voir une même marge
const MARGIN_COLOR_DISTANCE = 30  // écart à la marge à partir duquel un pixel est « peint »
const MARGIN_MIN_SPAN = 0.6       // sinon la couleur des coins est le fond de la grille, pas une marge
const SQRT3 = Math.sqrt(3)

// ── Image ────────────────────────────────────────────────────────────────────

async function loadImage(filePath) {
  const meta = await sharp(filePath).metadata()
  const scale = Math.min(1, MAX_ANALYSIS_DIM / Math.max(meta.width, meta.height))
  const w = Math.max(1, Math.round(meta.width * scale))
  const h = Math.max(1, Math.round(meta.height * scale))
  const { data: rgb } = await sharp(filePath)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  const gray = new Float32Array(w * h)
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]
  return { rgb, gray, w, h }
}

// Projections 1D du gradient et carte 2D, floutée car le gradient s'annule au centre d'une ligne.
function computeEdges(gray, w, h) {
  const px = new Float64Array(w)
  const py = new Float64Array(h)
  const raw = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = Math.min(Math.abs(gray[i + 1] - gray[i - 1]), GRADIENT_CLIP)
      const gy = Math.min(Math.abs(gray[i + w] - gray[i - w]), GRADIENT_CLIP)
      px[x] += gx
      py[y] += gy
      raw[i] = gx + gy
    }
  }
  const edges = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) sum += raw[(y + dy) * w + x + dx]
      }
      edges[y * w + x] = sum / 9
    }
  }
  return { px, py, edges }
}

function halve(edges, w, h) {
  const hw = w >> 1
  const hh = h >> 1
  const out = new Float32Array(hw * hh)
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const i = 2 * y * w + 2 * x
      out[y * hw + x] = (edges[i] + edges[i + 1] + edges[i + w] + edges[i + w + 1]) / 4
    }
  }
  return { edges: out, w: hw, h: hh }
}

// ── Périodes candidates ──────────────────────────────────────────────────────

// Passe-haut par médiane glissante : contrairement à une moyenne, elle n'est pas
// polluée par les pics isolés (frontière carte/marge).
function highPass(signal, window) {
  const half = Math.max(1, Math.floor(window / 2))
  return signal.map((value, i) => {
    const win = Array.from(signal.subarray(Math.max(0, i - half), i + half + 1)).sort((a, b) => a - b)
    return value - win[win.length >> 1]
  })
}

// Rend l'autocorrélation indépendante des amplitudes : une ligne faible compte autant qu'une frontière contrastée.
function binarize(signal) {
  const positive = Array.from(signal).filter(v => v > 0).sort((a, b) => a - b)
  if (positive.length < 10) return null
  const threshold = positive[Math.floor(positive.length * BINARIZE_QUANTILE)]
  return signal.map(v => (v > threshold ? 1 : 0))
}

function autocorrelation(signal, maxLag) {
  const ac = new Float64Array(maxLag + 2)
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    for (let i = 0; i < signal.length - lag; i++) ac[lag] += signal[i] * signal[i + lag]
  }
  return ac[0] > 0 ? ac.map(v => v / ac[0]) : ac
}

// Pics de la somme de l'autocorrélation aux multiples du pas, du plus au moins marqué.
function periodPeaks(projection) {
  const n = projection.length
  const minPeriod = Math.max(8, Math.round(n * MIN_PERIOD_RATIO))
  const maxPeriod = Math.floor(n / MIN_DIVISIONS)
  const binary = binarize(highPass(projection, maxPeriod))
  if (!binary) return []
  const maxLag = Math.min(n - 2, maxPeriod * 4)
  const ac = autocorrelation(binary, maxLag)
  const scores = []
  for (let p = minPeriod; p <= maxPeriod; p += 0.25) {
    let sum = 0
    let count = 0
    for (let lag = p; lag <= maxLag; lag += p) {
      const i = Math.floor(lag)
      sum += ac[i] + (ac[i + 1] - ac[i]) * (lag - i)
      count++
    }
    scores.push({ period: p, score: count >= 2 ? sum / Math.sqrt(count) : 0 })
  }
  return scores
    .filter((s, i) => s.score > 0 && s.score >= (scores[i - 1]?.score ?? 0) && s.score >= (scores[i + 1]?.score ?? 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, PERIOD_PEAKS)
}

const nearRatio = (ratio, target) => Math.abs(ratio - target) <= target * RATIO_TOLERANCE

// Un pic peut être un sous-multiple du vrai pas : ses multiples sont aussi des candidats.
function withMultiples(peaks, limit) {
  const periods = []
  for (const { period } of peaks) {
    for (let k = 1; k <= MAX_PERIOD_MULTIPLE && period * k <= limit; k++) periods.push(period * k)
  }
  return periods
}

// Hexagones compatibles avec les pas candidats, les couples les mieux classés d'abord.
function hexHypotheses(peaksX, peaksY, w, h) {
  const pairs = []
  withMultiples(peaksX, w / MIN_DIVISIONS).forEach((x, i) => {
    withMultiples(peaksY, h / MIN_DIVISIONS).forEach((y, j) => pairs.push({ x, y, rank: i + j }))
  })
  pairs.sort((a, b) => a.rank - b.rank)
  const seen = new Set()
  const out = []
  for (const { x, y } of pairs) {
    const ratio = x / y
    const hyp = nearRatio(ratio, SQRT3) ? { type: 'hex', orientation: 'flat', cellW: x / 0.75, cellH: y * 2 }
      : nearRatio(ratio, 1 / SQRT3) ? { type: 'hex', orientation: 'pointy', cellW: x * 2, cellH: y / 0.75 }
      : null
    if (!hyp) continue
    const key = `${hyp.orientation}:${Math.round(hyp.cellW / 2)}:${Math.round(hyp.cellH / 2)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(hyp)
    if (out.length >= MAX_HYPOTHESES) break
  }
  return out
}

// ── Réseau ───────────────────────────────────────────────────────────────────

const isOdd = (n) => ((n % 2) + 2) % 2 === 1

function cellPitch({ type, orientation, cellW, cellH }) {
  if (type === 'square') return { col: cellW, row: cellH }
  return orientation === 'flat' ? { col: 0.75 * cellW, row: cellH } : { col: cellW, row: 0.75 * cellH }
}

// Translation qui superpose un réseau d'hexagones à lui-même : une tuile ne contient qu'un motif.
function latticePeriod({ orientation, cellW, cellH }) {
  return orientation === 'flat' ? { x: 1.5 * cellW, y: cellH } : { x: cellW, y: 1.5 * cellH }
}

function cellCenter(lattice, col, row) {
  const { type, orientation, cellW, cellH, ox, oy } = lattice
  if (type === 'square') return { x: ox + (col + 0.5) * cellW, y: oy + (row + 0.5) * cellH }
  if (orientation === 'flat') {
    return { x: ox + (col * 0.75 + 0.5) * cellW, y: oy + (row + 0.5) * cellH + (isOdd(col) ? cellH / 2 : 0) }
  }
  return { x: ox + (col + 0.5) * cellW + (isOdd(row) ? cellW / 2 : 0), y: oy + (row * 0.75 + 0.5) * cellH }
}

function cellVertices(lattice, col, row) {
  const { type, orientation, cellW, cellH } = lattice
  const { x, y } = cellCenter(lattice, col, row)
  const rx = cellW / 2
  const ry = cellH / 2
  if (type === 'square') return [[x - rx, y - ry], [x + rx, y - ry], [x + rx, y + ry], [x - rx, y + ry]]
  if (orientation === 'flat') {
    return [[x + rx, y], [x + rx / 2, y + ry], [x - rx / 2, y + ry], [x - rx, y], [x - rx / 2, y - ry], [x + rx / 2, y - ry]]
  }
  return [[x + rx, y + ry / 2], [x, y + ry], [x - rx, y + ry / 2], [x - rx, y - ry / 2], [x, y - ry], [x + rx, y - ry / 2]]
}

// Appelle visit(x, y) le long des arêtes d'une case, à environ un point par pixel.
function walkCellEdges(lattice, col, row, visit) {
  const vertices = cellVertices(lattice, col, row)
  vertices.forEach(([ax, ay], e) => {
    const [bx, by] = vertices[(e + 1) % vertices.length]
    const steps = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay)))
    for (let s = 0; s < steps; s++) visit(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps)
  })
}

// ── Vérification d'une hypothèse ─────────────────────────────────────────────

// Replie les arêtes de l'image sur une tuile du réseau de tw × th cases.
function foldEdges({ edges, w, h }, period, tw, th) {
  const binX = Int32Array.from({ length: w }, (_, x) => Math.min(tw - 1, Math.floor(((x % period.x) / period.x) * tw)))
  const sums = new Float64Array(tw * th)
  const counts = new Float64Array(tw * th)
  for (let y = 1; y < h - 1; y++) {
    const rowBin = Math.min(th - 1, Math.floor(((y % period.y) / period.y) * th)) * tw
    for (let x = 1; x < w - 1; x++) {
      const bin = rowBin + binX[x]
      sums[bin] += edges[y * w + x]
      counts[bin]++
    }
  }
  let total = 0
  let filled = 0
  for (let i = 0; i < sums.length; i++) {
    if (counts[i] > 0) {
      sums[i] /= counts[i]
      total += sums[i]
      filled++
    }
  }
  return { tile: sums, tw, th, mean: filled ? total / filled : 0 }
}

// Pixels de la tuile que doivent couvrir les arêtes d'un réseau d'origine (0, 0).
function latticeTemplate(hypothesis, period, tw, th) {
  const lattice = { ...hypothesis, ox: 0, oy: 0 }
  const points = new Set()
  for (const [col, row] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    walkCellEdges(lattice, col, row, (x, y) => {
      const tx = Math.floor((((x % period.x) + period.x) % period.x) / period.x * tw) % tw
      const ty = Math.floor((((y % period.y) + period.y) % period.y) / period.y * th) % th
      points.add(ty * tw + tx)
    })
  }
  return Array.from(points, p => [p % tw, Math.floor(p / tw)])
}

// Meilleur décalage du gabarit parmi `offsets`, et sa saillance : son écart à la moyenne de tous les
// décalages, en écarts-types. Une ligne fine sur une texture chargée change peu la moyenne de la tuile,
// mais seule une vraie grille fait ressortir un décalage de tous les autres.
function matchTemplate({ tile, tw, th }, template, offsets) {
  let best = { sum: -1, dx: 0, dy: 0 }
  let total = 0
  let square = 0
  let count = 0
  for (const [dx, dy] of offsets) {
    let sum = 0
    for (const [x, y] of template) sum += tile[((y + dy) % th) * tw + (x + dx) % tw]
    if (sum > best.sum) best = { sum, dx, dy }
    total += sum
    square += sum * sum
    count++
  }
  const mean = total / count
  const deviation = Math.sqrt(Math.max(0, square / count - mean * mean))
  return { ...best, salience: deviation > 0 ? (best.sum - mean) / deviation : 0 }
}

function* allOffsets(tw, th) {
  for (let dy = 0; dy < th; dy++) {
    for (let dx = 0; dx < tw; dx++) yield [dx, dy]
  }
}

function* offsetsAround(cx, cy, radius, tw, th) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) yield [(cx + dx + tw) % tw, (cy + dy + th) % th]
  }
}

/**
 * Meilleure position du réseau sur l'image : recherche exhaustive sur une tuile
 * grossière, puis locale au pixel. Le coût ne dépend pas du nombre de cases.
 */
function fitLattice(hypothesis, image) {
  const period = latticePeriod(hypothesis)
  const tw = Math.max(1, Math.round(period.x))
  const th = Math.max(1, Math.round(period.y))
  const shrink = Math.max(tw, th) / COARSE_TILE_SIZE
  const coarseW = shrink > 1 ? Math.max(1, Math.round(tw / shrink)) : tw
  const coarseH = shrink > 1 ? Math.max(1, Math.round(th / shrink)) : th
  const coarse = foldEdges(image, period, coarseW, coarseH)
  if (coarse.mean === 0) return { ...hypothesis, ox: 0, oy: 0, contrast: 0, salience: 0 }
  const rough = matchTemplate(coarse, latticeTemplate(hypothesis, period, coarseW, coarseH), allOffsets(coarseW, coarseH))
  const fine = foldEdges(image, period, tw, th)
  const template = latticeTemplate(hypothesis, period, tw, th)
  const radius = Math.ceil(Math.max(tw / coarseW, th / coarseH))
  const best = matchTemplate(fine, template, offsetsAround(
    Math.round((rough.dx / coarseW) * tw), Math.round((rough.dy / coarseH) * th), radius, tw, th))
  return {
    ...hypothesis,
    ox: (best.dx / tw) * period.x,
    oy: (best.dy / th) * period.y,
    contrast: best.sum / template.length / fine.mean,
    salience: rough.salience,
  }
}

const scaled = (hypothesis, factor) => ({ ...hypothesis, cellW: hypothesis.cellW * factor, cellH: hypothesis.cellH * factor })

// Ajuste la taille des cases : un pas inexact étale le motif replié et fait chuter le contraste.
async function refineLattice(hypothesis, image) {
  let best = fitLattice(hypothesis, image)
  for (const step of REFINE_STEPS) {
    for (const [fw, fh] of [[1 + step, 1], [1 - step, 1], [1, 1 + step], [1, 1 - step]]) {
      await yieldToEventLoop()
      const fit = fitLattice({ ...best, cellW: best.cellW * fw, cellH: best.cellH * fh }, image)
      if (fit.contrast > best.contrast) best = fit
    }
  }
  return best
}

async function findHexLattice(peaksX, peaksY, image) {
  const coarse = halve(image.edges, image.w, image.h)
  const scored = []
  for (const hyp of hexHypotheses(peaksX, peaksY, image.w, image.h)) {
    await yieldToEventLoop()
    scored.push({ hyp, salience: fitLattice(scaled(hyp, 0.5), coarse).salience })
  }
  const ranked = scored.sort((a, b) => b.salience - a.salience).slice(0, REFINED_HYPOTHESES)
  let best = null
  for (const { hyp } of ranked) {
    const fit = await refineLattice(hyp, image)
    if (!best || fit.salience > best.salience) best = fit
  }
  if (!best || best.salience < MIN_HEX_SALIENCE) return null
  const confidence = (best.salience - MIN_HEX_SALIENCE) / (FULL_HEX_SALIENCE - MIN_HEX_SALIENCE)
  return { ...best, confidence }
}

// Pas et position du peigne qui s'aligne le mieux sur une projection, autour du pas estimé.
function fitComb(projection, approxPeriod) {
  const signal = highPass(projection, Math.floor(projection.length / MIN_DIVISIONS))
  let best = { mean: -Infinity, period: approxPeriod, phase: 0 }
  for (let period = approxPeriod * (1 - COMB_RANGE); period <= approxPeriod * (1 + COMB_RANGE); period += COMB_PERIOD_STEP) {
    for (let phase = 0; phase < period; phase += 0.5) {
      let sum = 0
      let count = 0
      for (let t = phase; t < signal.length - 1; t += period) {
        const i = Math.floor(t)
        sum += signal[i] + (signal[i + 1] - signal[i]) * (t - i)
        count++
      }
      if (count && sum / count > best.mean) best = { mean: sum / count, period, phase }
    }
  }
  return best
}

function findSquareLattice(peaksX, peaksY, { px, py }) {
  const [x] = peaksX
  const [y] = peaksY
  if (!x || !y || Math.min(x.score, y.score) < MIN_SQUARE_SCORE || !nearRatio(x.period / y.period, 1)) return null
  const combX = fitComb(px, x.period)
  const combY = fitComb(py, y.period)
  return {
    type: 'square',
    orientation: 'flat',
    cellW: combX.period,
    cellH: combY.period,
    ox: combX.phase,
    oy: combY.phase,
    confidence: (Math.min(x.score, y.score) - MIN_SQUARE_SCORE) / (FULL_SQUARE_SCORE - MIN_SQUARE_SCORE),
  }
}

// ── Étendue ──────────────────────────────────────────────────────────────────

const colorDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// Couleur médiane des quatre coins, ou null s'ils ne se ressemblent pas.
function cornerColor(rgb, w, h) {
  const size = Math.max(4, Math.round(Math.min(w, h) * MARGIN_CORNER_RATIO))
  const corners = [[0, 0], [w - size, 0], [0, h - size], [w - size, h - size]].map(([x0, y0]) => {
    const channels = [[], [], []]
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        const i = (y * w + x) * 3
        for (let c = 0; c < 3; c++) channels[c].push(rgb[i + c])
      }
    }
    return channels.map(values => values.sort((a, b) => a - b)[values.length >> 1])
  })
  return corners.every(a => corners.every(b => colorDistance(a, b) <= MARGIN_CORNERS_MAX_DISTANCE)) ? corners[0] : null
}

// Vrai si l'intérieur de la case diffère de la marge.
function cellIsPainted({ rgb, w, h }, center, radius, margin) {
  let painted = 0
  let total = 0
  const step = Math.max(1, Math.round(radius / 4))
  for (let y = Math.round(center.y - radius); y <= center.y + radius; y += step) {
    for (let x = Math.round(center.x - radius); x <= center.x + radius; x += step) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const i = (y * w + x) * 3
      if (colorDistance([rgb[i], rgb[i + 1], rgb[i + 2]], margin) > MARGIN_COLOR_DISTANCE) painted++
      total++
    }
  }
  return painted * 2 >= total && total > 0
}

function cellEdgeEnergy({ edges, w, h }, lattice, col, row) {
  let sum = 0
  let count = 0
  walkCellEdges(lattice, col, row, (fx, fy) => {
    const x = Math.round(fx)
    const y = Math.round(fy)
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return
    sum += edges[y * w + x]
    count++
  })
  return count ? sum / count : 0
}

// Toutes les cases dont le centre tombe dans l'image.
function visibleCells(lattice, w, h) {
  const pitch = cellPitch(lattice)
  const cells = []
  const firstCol = Math.floor(-lattice.ox / pitch.col) - 2
  const lastCol = Math.ceil((w - lattice.ox) / pitch.col) + 1
  const firstRow = Math.floor(-lattice.oy / pitch.row) - 2
  const lastRow = Math.ceil((h - lattice.oy) / pitch.row) + 1
  for (let col = firstCol; col <= lastCol; col++) {
    for (let row = firstRow; row <= lastRow; row++) {
      const center = cellCenter(lattice, col, row)
      if (center.x >= 0 && center.y >= 0 && center.x < w && center.y < h) cells.push({ col, row, center })
    }
  }
  return cells
}

function paintedCells(image, lattice, cells) {
  const margin = cornerColor(image.rgb, image.w, image.h)
  if (!margin) return null
  const radius = Math.min(lattice.cellW, lattice.cellH) * 0.3
  const kept = cells.filter(cell => cellIsPainted(image, cell.center, radius, margin))
  if (!kept.length) return null
  const spanOf = (values) => Math.max(...values) - Math.min(...values)
  const coversImage = spanOf(kept.map(c => c.center.x)) >= image.w * MARGIN_MIN_SPAN
    && spanOf(kept.map(c => c.center.y)) >= image.h * MARGIN_MIN_SPAN
  return coversImage ? kept : null
}

function cellsWithEdges(image, lattice, cells) {
  const energies = cells.map(cell => cellEdgeEnergy(image, lattice, cell.col, cell.row))
  const threshold = [...energies].sort((a, b) => a - b)[energies.length >> 1] * EDGE_ENERGY_RATIO
  return cells.filter((_, i) => energies[i] >= threshold)
}

// Première et dernière rangée assez remplies pour ne pas être un élément de décor isolé.
function filledSpan(indices) {
  const counts = new Map()
  for (const i of indices) counts.set(i, (counts.get(i) || 0) + 1)
  const min = Math.max(2, Math.max(...counts.values()) * MIN_ROW_FILL)
  const filled = [...counts].filter(([, count]) => count >= min).map(([i]) => i)
  return filled.length ? { first: Math.min(...filled), last: Math.max(...filled) } : null
}

// Recadre l'origine sur les cases gardées. Le modèle décale toujours les indices impairs de l'axe
// quinconcé : un premier indice impair se compense sur l'autre axe, ce qui renumérote ses rangées.
function cropLattice(lattice, kept) {
  const pointy = lattice.type === 'hex' && lattice.orientation === 'pointy'
  const staggered = lattice.type === 'hex'
  const pitch = cellPitch(lattice)
  const major = filledSpan(kept.map(c => (pointy ? c.row : c.col)))
  if (!major) return null
  const flip = staggered && isOdd(major.first)
  const minorStep = pointy ? lattice.cellW : lattice.cellH
  const renumbered = kept.map(c => {
    const majorIndex = pointy ? c.row : c.col
    const minorIndex = pointy ? c.col : c.row
    return minorIndex + (flip && !isOdd(majorIndex) ? -1 : 0)
  })
  const minor = filledSpan(renumbered)
  if (!minor) return null
  const majorPitch = pointy ? pitch.row : pitch.col
  const majorOrigin = (pointy ? lattice.oy : lattice.ox) + major.first * majorPitch
  const minorOrigin = (pointy ? lattice.ox : lattice.oy) + (minor.first + (flip ? 0.5 : 0)) * minorStep
  const nMajor = major.last - major.first + 1
  const nMinor = minor.last - minor.first + 1
  return pointy
    ? { ox: minorOrigin, oy: majorOrigin, cols: nMinor, rows: nMajor }
    : { ox: majorOrigin, oy: minorOrigin, cols: nMajor, rows: nMinor }
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

const round6 = (v) => Math.round(v * 1e6) / 1e6

const NONE_RESULT = {
  gridType: 'none', gridCols: null, gridRows: null, gridHexOrientation: 'flat',
  gridOffsetX: 0, gridOffsetY: 0, gridCellW: null, gridCellH: null, confidence: 0,
}

/**
 * Analyse une image de carte et retourne la configuration de grille détectée.
 * gridCellW/gridCellH sont les dimensions d'une cellule normalisées par la
 * taille de l'image, gridCols/gridRows l'étendue réellement couverte.
 * @param {string} filePath chemin absolu de l'image
 */
async function detectGridConfig(filePath) {
  const { rgb, gray, w, h } = await loadImage(filePath)
  if (w < MIN_SIZE || h < MIN_SIZE) return { ...NONE_RESULT }

  const { px, py, edges } = computeEdges(gray, w, h)
  const image = { rgb, edges, w, h }
  await yieldToEventLoop()
  const peaksX = periodPeaks(px)
  await yieldToEventLoop()
  const peaksY = periodPeaks(py)
  await yieldToEventLoop()
  const lattice = await findHexLattice(peaksX, peaksY, image) || findSquareLattice(peaksX, peaksY, { px, py })
  if (!lattice) return { ...NONE_RESULT }

  const cells = visibleCells(lattice, w, h)
  const kept = paintedCells(image, lattice, cells) || cellsWithEdges(image, lattice, cells)
  const extent = cropLattice(lattice, kept)
  if (!extent || extent.cols < MIN_DIVISIONS || extent.rows < MIN_DIVISIONS) return { ...NONE_RESULT }

  return {
    gridType: lattice.type,
    gridCols: Math.min(extent.cols, 200),
    gridRows: Math.min(extent.rows, 200),
    gridHexOrientation: lattice.orientation,
    gridOffsetX: round6(extent.ox / w),
    gridOffsetY: round6(extent.oy / h),
    gridCellW: round6(lattice.cellW / w),
    gridCellH: round6(lattice.cellH / h),
    confidence: Math.min(1, lattice.confidence),
  }
}

module.exports = {
  detectGridConfig,
  // Exposé pour les scripts de diagnostic (scripts/grid-overlay.js)
  _internal: { cellVertices },
}
