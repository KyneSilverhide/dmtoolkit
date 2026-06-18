/**
 * Détection automatique de la configuration de grille (carrée / hexagonale)
 * sur les images de battlemap uploadées.
 *
 * Principe :
 *  1. L'image est convertie en niveaux de gris et on calcule deux projections 1D :
 *     Px[x] = somme des gradients horizontaux (arêtes verticales) par colonne,
 *     Py[y] = somme des gradients verticaux (arêtes horizontales) par ligne.
 *     Les gradients sont écrêtés pour que les contours du décor (bâtiments,
 *     rochers…) n'écrasent pas les fines lignes de grille.
 *  2. Chaque projection est passée au filtre passe-haut (soustraction d'une
 *     moyenne glissante) puis autocorrélée. Une grille produit des pics
 *     d'autocorrélation à tous les multiples de son pas.
 *  3. La période fondamentale est extraite par somme harmonique sur
 *     l'autocorrélation (robuste contre le verrouillage sur un harmonique).
 *  4. Le rapport entre les périodes X et Y classifie la grille :
 *       ≈ 1   → carrée
 *       ≈ √3  → hexagonale flat-top  (px = 0.75·hexW, py = hexH/2)
 *       ≈ 1/√3 → hexagonale pointy-top (px = hexW/2,  py = 0.75·hexH)
 *  5. La taille de cellule détectée est conservée telle quelle (grid_cell_w/h
 *     normalisés) au lieu d'être forcée à diviser exactement l'image — c'est ce
 *     qui permet l'alignement sur les cartes à marges ou à grille partielle.
 *     cols/rows ne servent qu'à définir l'espace d'indices des cellules et
 *     sont choisis pour couvrir toute l'image.
 *  6. L'origine de la grille (grid_offset_x/y) est ajustée :
 *     - carrée : phase du peigne sur les projections,
 *     - hexagonale : recalage 2D — on échantillonne le gradient le long des
 *       arêtes du maillage candidat et on maximise ce score sur l'espace des
 *       offsets (recherche grossière puis raffinements).
 *
 * Modèle de grille identique à frontend/src/utils/mapGrid.js (avec cellW/cellH) :
 *   carrée  : cellule de cellW × cellH, origine à (offsetX, offsetY)
 *   flat    : centres cx = ox + (col·0.75 + 0.5)·hexW, cy = oy + (row + 0.5)·hexH (+ hexH/2 col impaire)
 *   pointy  : centres cx = ox + (col + 0.5)·hexW (+ hexW/2 row impaire), cy = oy + (row·0.75 + 0.5)·hexH
 */

const sharp = require('sharp')

const MAX_ANALYSIS_DIM = 2000
const GRADIENT_CLIP = 24          // écrêtage du gradient par pixel (sur 0-255)
// Pas de grille minimal, proportionnel à la dimension de l'image : le bruit de
// texture domine sous ~0.9 % de la dimension (18px à l'échelle d'analyse max de
// 2000px), mais une petite image peut légitimement avoir des cellules plus fines.
function minPeriodFor(dim) {
  return Math.max(8, Math.round(dim * 0.009))
}
const MIN_DIVISIONS = 4           // nombre minimal de périodes visibles par axe
const BINARIZE_QUANTILE = 0.8     // seuil de binarisation (quantile des valeurs positives)
const SCORE_THRESHOLD = 0.6       // score harmonique minimal pour valider un axe
                                  // (calibré sur signal binarisé : cartes avec grille ≥ 0.82, sans grille ≤ 0.48)
const RATIO_TOLERANCE = 0.13      // tolérance sur le rapport des périodes
const SQRT3 = Math.sqrt(3)

async function loadGrayscale(filePath) {
  const meta = await sharp(filePath).metadata()
  const scale = Math.min(1, MAX_ANALYSIS_DIM / Math.max(meta.width, meta.height))
  const w = Math.max(1, Math.round(meta.width * scale))
  const h = Math.max(1, Math.round(meta.height * scale))
  const { data } = await sharp(filePath)
    .resize(w, h, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, w, h, origW: meta.width, origH: meta.height }
}

// Calcule en une passe les projections 1D et la carte 2D de gradient écrêté.
function computeGradients(data, w, h) {
  const px = new Float64Array(w)
  const py = new Float64Array(h)
  const G = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    const row = y * w
    for (let x = 1; x < w - 1; x++) {
      const i = row + x
      const gx = Math.min(Math.abs(data[i + 1] - data[i - 1]), GRADIENT_CLIP)
      const gy = Math.min(Math.abs(data[i + w] - data[i - w]), GRADIENT_CLIP)
      px[x] += gx
      py[y] += gy
      G[i] = gx + gy
    }
  }
  return { px, py, G }
}

// Passe-haut robuste : soustrait une médiane glissante pour retirer les
// tendances lentes dues au contenu de la carte. La médiane (contrairement à la
// moyenne) n'est pas polluée par les pics isolés (ex. : frontière carte/marge),
// qui créeraient sinon de larges creux artificiels anti-corrélés.
function highPass(proj, window) {
  const n = proj.length
  const half = Math.max(1, Math.floor(window / 2))
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(n, i + half + 1)
    const win = Array.from(proj.slice(a, b)).sort((x, y) => x - y)
    out[i] = proj[i] - win[Math.floor(win.length / 2)]
  }
  return out
}

// Écrêtage robuste : limite les valeurs extrêmes (ex. : frontière carte/marge
// qui crée un pic isolé géant écrasant l'autocorrélation normalisée).
// L'échelle est le quantile 90 % des valeurs absolues — insensible aux pics isolés.
function winsorize(signal) {
  const sorted = Array.from(signal, Math.abs).sort((a, b) => a - b)
  const scale = sorted[Math.floor(sorted.length * 0.9)]
  if (scale === 0) return signal
  const limit = scale * 4
  const out = new Float64Array(signal.length)
  for (let i = 0; i < signal.length; i++) {
    out[i] = Math.max(-limit, Math.min(limit, signal[i]))
  }
  return out
}

// Prépare une projection pour l'analyse de périodicité : passe-haut + écrêtage robuste.
function prepareSignal(proj, maxPeriod) {
  return winsorize(highPass(proj, Math.round(maxPeriod)))
}

// Binarise le signal préparé : 1 si la valeur dépasse le quantile des valeurs
// positives, 0 sinon. Rend l'autocorrélation indépendante des amplitudes —
// une ligne de grille faible compte autant qu'une frontière très contrastée.
function binarize(signal) {
  const pos = Array.from(signal).filter(v => v > 0).sort((a, b) => a - b)
  if (pos.length < 10) return null
  const threshold = pos[Math.floor(pos.length * BINARIZE_QUANTILE)]
  return Float64Array.from(signal, v => (v > threshold ? 1 : 0))
}

// Autocorrélation normalisée (AC(0) = 1) jusqu'à maxLag.
function autocorrelation(signal, maxLag) {
  const n = signal.length
  let zero = 0
  for (let i = 0; i < n; i++) zero += signal[i] * signal[i]
  const ac = new Float64Array(maxLag + 1)
  if (zero === 0) return ac
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) sum += signal[i] * signal[i + lag]
    ac[lag] = sum / zero
  }
  return ac
}

function interpolate(arr, x) {
  const i = Math.floor(x)
  if (i < 0 || i + 1 >= arr.length) return 0
  const frac = x - i
  return arr[i] * (1 - frac) + arr[i + 1] * frac
}

/**
 * Extrait la période fondamentale d'un signal via somme harmonique sur
 * l'autocorrélation : score(p) = somme des AC aux multiples de p, pondérée
 * pour privilégier la fondamentale plutôt que ses harmoniques.
 * Retourne { period, score } ou null si aucune périodicité fiable.
 */
function findFundamental(signal, minPeriod, maxPeriod) {
  const maxLag = Math.min(signal.length - 2, Math.round(maxPeriod * 4))
  const ac = autocorrelation(signal, maxLag)

  const score = (p) => {
    let sum = 0
    let count = 0
    for (let m = p; m <= maxLag; m += p) { sum += interpolate(ac, m); count++ }
    // Somme normalisée par √count : une vraie fondamentale a des AC positifs à
    // TOUS ses multiples, alors qu'un sous-multiple (p/2…) alterne
    // positif/négatif et qu'un harmonique (2p…) accumule moins de termes.
    return count >= 2 ? sum / Math.sqrt(count) : -Infinity
  }

  let best = null
  for (let p = minPeriod; p <= maxPeriod; p += 0.25) {
    const s = score(p)
    if (s === -Infinity) break
    if (!best || s > best.score) best = { period: p, score: s }
  }
  if (!best || best.score <= 0) return null

  // Raffinement sub-pixel par interpolation parabolique sur le score
  const d = 0.125
  const s0 = score(best.period - d)
  const s1 = best.score
  const s2 = score(best.period + d)
  const denom = s0 - 2 * s1 + s2
  if (denom < 0) {
    const shift = (0.5 * (s0 - s2)) / denom
    if (Math.abs(shift) <= 1) best.period += shift * d
  }
  return best
}

/**
 * Raffine une période approximative (issue du signal binarisé) sur le signal
 * continu, qui porte l'information sub-pixel. Recherche locale ±3 %.
 */
function refinePeriod(signal, approxPeriod, maxPeriod) {
  const maxLag = Math.min(signal.length - 2, Math.round(maxPeriod * 4))
  const ac = autocorrelation(signal, maxLag)
  const score = (p) => {
    let sum = 0
    let count = 0
    for (let m = p; m <= maxLag; m += p) { sum += interpolate(ac, m); count++ }
    return count >= 2 ? sum / Math.sqrt(count) : -Infinity
  }
  let best = { period: approxPeriod, score: score(approxPeriod) }
  for (let p = approxPeriod * 0.97; p <= approxPeriod * 1.03; p += 0.05) {
    const s = score(p)
    if (s > best.score) best = { period: p, score: s }
  }
  return best.period
}

// Phase (en pixels) du peigne de période `period` qui s'aligne le mieux sur la projection.
function findPhase(proj, period) {
  const n = proj.length
  let best = -Infinity
  let bestPhase = 0
  const steps = Math.max(8, Math.round(period * 2))
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * period
    let sum = 0
    let count = 0
    for (let k = phase; k < n - 1; k += period) {
      sum += interpolate(proj, k)
      count++
    }
    const mean = sum / count
    if (mean > best) { best = mean; bestPhase = phase }
  }
  return bestPhase
}

// ── Étendue de la grille ─────────────────────────────────────────────────────
// La grille ne couvre pas forcément toute l'image (bordures, marges). On
// détermine la première et la dernière ligne réellement présentes, puis on
// teste si les bandes de bord contiennent encore du signal de grille (cellule
// partielle coupée par le cadrage) ou non (marge vide à exclure).

// Première et dernière dent du peigne (période/phase) présentes dans le signal binarisé.
function combExtent(bin, period, phase) {
  let first = null
  let last = null
  for (let t = phase; t < bin.length; t += period) {
    const c = Math.round(t)
    let support = false
    for (let d = -2; d <= 2; d++) {
      const i = c + d
      if (i >= 0 && i < bin.length && bin[i] > 0) { support = true; break }
    }
    if (support) {
      if (first === null) first = t
      last = t
    }
  }
  return first !== null && last > first ? { first, last } : null
}

// Positions des dents du peigne entre first et last inclus.
function teethBetween(first, last, period) {
  const teeth = []
  for (let t = first; t <= last + period / 4; t += period) teeth.push(t)
  return teeth
}

// Énergie moyenne du gradient le long des lignes horizontales `yLines`,
// restreinte à la bande x ∈ [x0, x1).
function bandEnergyAlongY(G, w, h, x0, x1, yLines) {
  let sum = 0
  let count = 0
  const a = Math.max(1, Math.round(x0))
  const b = Math.min(w - 1, Math.round(x1))
  for (const ty of yLines) {
    const y = Math.round(ty)
    if (y < 1 || y >= h - 1) continue
    for (let x = a; x < b; x++) { sum += G[y * w + x]; count++ }
  }
  return count > 0 ? sum / count : 0
}

// Énergie moyenne du gradient le long des lignes verticales `xLines`,
// restreinte à la bande y ∈ [y0, y1).
function bandEnergyAlongX(G, w, h, y0, y1, xLines) {
  let sum = 0
  let count = 0
  const a = Math.max(1, Math.round(y0))
  const b = Math.min(h - 1, Math.round(y1))
  for (const tx of xLines) {
    const x = Math.round(tx)
    if (x < 1 || x >= w - 1) continue
    for (let y = a; y < b; y++) { sum += G[y * w + x]; count++ }
  }
  return count > 0 ? sum / count : 0
}

// Une bande de bord appartient à la grille si son énergie atteint cette
// fraction de l'énergie mesurée à l'intérieur de la grille.
const EDGE_BAND_RATIO = 0.45

// ── Recalage 2D des hexagones ────────────────────────────────────────────────

// Sommets (en pixels) de l'hexagone (col, row) pour le maillage donné.
function hexVerticesPx(col, row, hexW, hexH, orientation, ox, oy) {
  if (orientation === 'pointy') {
    const cx = ox + (col + 0.5) * hexW + ((row % 2 + 2) % 2 === 1 ? hexW / 2 : 0)
    const cy = oy + (row * 0.75 + 0.5) * hexH
    const rx = hexW / 2
    const ry = hexH / 2
    const hry = ry / 2
    return [
      { x: cx + rx, y: cy + hry }, { x: cx, y: cy + ry }, { x: cx - rx, y: cy + hry },
      { x: cx - rx, y: cy - hry }, { x: cx, y: cy - ry }, { x: cx + rx, y: cy - hry },
    ]
  }
  const cx = ox + (col * 0.75 + 0.5) * hexW
  const cy = oy + (row + 0.5) * hexH + ((col % 2 + 2) % 2 === 1 ? hexH / 2 : 0)
  const rx = hexW / 2
  const ry = hexH / 2
  const hrx = rx / 2
  return [
    { x: cx + rx, y: cy }, { x: cx + hrx, y: cy + ry }, { x: cx - hrx, y: cy + ry },
    { x: cx - rx, y: cy }, { x: cx - hrx, y: cy - ry }, { x: cx + hrx, y: cy - ry },
  ]
}

// Gradient moyen échantillonné le long des arêtes des hexagones d'une plage
// de cellules [c0..c1] × [r0..r1]. Les échantillons hors image sont ignorés
// (une cellule entièrement hors champ donne count = 0).
function hexRangeEnergy(G, w, h, hexW, hexH, orientation, ox, oy, c0, c1, r0, r1, cellStep = 1) {
  let sum = 0
  let count = 0
  for (let col = c0; col <= c1; col += cellStep) {
    for (let row = r0; row <= r1; row += cellStep) {
      const v = hexVerticesPx(col, row, hexW, hexH, orientation, ox, oy)
      for (let e = 0; e < 6; e++) {
        const a = v[e]
        const b = v[(e + 1) % 6]
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const steps = Math.max(2, Math.round(len / 2))
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(a.x + ((b.x - a.x) * s) / steps)
          const y = Math.round(a.y + ((b.y - a.y) * s) / steps)
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue
          sum += G[y * w + x]
          count++
        }
      }
    }
  }
  return count > 0 ? sum / count : 0
}

// Score d'alignement global : gradient moyen le long des arêtes du maillage.
function hexEdgeScore(G, w, h, hexW, hexH, orientation, ox, oy, cellStep) {
  const colPitch = orientation === 'flat' ? 0.75 * hexW : hexW
  const rowPitch = orientation === 'flat' ? hexH : 0.75 * hexH
  const nCols = Math.ceil(w / colPitch) + 2
  const nRows = Math.ceil(h / rowPitch) + 2
  return hexRangeEnergy(G, w, h, hexW, hexH, orientation, ox, oy, 0, nCols - 1, 0, nRows - 1, cellStep)
}

/**
 * Trouve l'origine (ox, oy) du maillage hexagonal qui maximise le gradient le
 * long des arêtes. Recherche grossière sur une période du réseau, puis deux
 * raffinements locaux. Retourne des offsets ≤ 0 (l'origine est sur ou avant
 * le bord de l'image, garantissant la couverture des indices ≥ 0).
 */
function fitHexOffset(G, w, h, hexW, hexH, orientation) {
  // Périodes d'invariance du réseau (translation qui le superpose à lui-même)
  const periodX = orientation === 'flat' ? 1.5 * hexW : hexW
  const periodY = orientation === 'flat' ? hexH : 1.5 * hexH
  const cellStep = (w / hexW) * (h / hexH) > 700 ? 2 : 1

  let best = { score: -1, ox: 0, oy: 0 }
  const NX = 12
  const NY = 12
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const ox = -periodX * (i / NX)
      const oy = -periodY * (j / NY)
      const s = hexEdgeScore(G, w, h, hexW, hexH, orientation, ox, oy, cellStep)
      if (s > best.score) best = { score: s, ox, oy }
    }
  }
  let spanX = periodX / NX
  let spanY = periodY / NY
  for (let pass = 0; pass < 3; pass++) {
    const center = { ...best }
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const ox = center.ox + (spanX * i) / 2
        const oy = center.oy + (spanY * j) / 2
        const s = hexEdgeScore(G, w, h, hexW, hexH, orientation, ox, oy, cellStep)
        if (s > best.score) best = { score: s, ox, oy }
      }
    }
    spanX /= 2
    spanY /= 2
  }
  // Ramène l'origine dans (-periodX, 0] × (-periodY, 0]
  best.ox = best.ox - Math.ceil(best.ox / periodX) * periodX
  best.oy = best.oy - Math.ceil(best.oy / periodY) * periodY
  if (best.ox > 0) best.ox -= periodX
  if (best.oy > 0) best.oy -= periodY
  return best
}

/**
 * Rogne l'espace d'indices hexagonal aux colonnes/lignes qui portent réellement
 * du signal de grille (exclut les marges sans grille). L'origine est décalée
 * vers la première colonne/ligne conservée. Pour préserver la parité du
 * maillage (colonnes décalées d'une demi-cellule), le rognage de tête se fait
 * par pas de 2 sur l'axe décalé (colonnes en flat, lignes en pointy).
 */
function trimHexExtent(G, w, h, hexW, hexH, orientation, ox, oy, nCols, nRows) {
  const colPitch = orientation === 'flat' ? 0.75 * hexW : hexW
  const rowPitch = orientation === 'flat' ? hexH : 0.75 * hexH
  const colE = []
  for (let c = 0; c < nCols; c++) {
    colE.push(hexRangeEnergy(G, w, h, hexW, hexH, orientation, ox, oy, c, c, 0, nRows - 1))
  }
  const rowE = []
  for (let r = 0; r < nRows; r++) {
    rowE.push(hexRangeEnergy(G, w, h, hexW, hexH, orientation, ox, oy, 0, nCols - 1, r, r))
  }
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  const TRIM_RATIO = 0.4
  const thC = median(colE) * TRIM_RATIO
  const thR = median(rowE) * TRIM_RATIO
  let c0 = 0
  while (c0 < nCols - 2 && colE[c0] < thC) c0++
  let c1 = nCols - 1
  while (c1 > c0 + 1 && colE[c1] < thC) c1--
  let r0 = 0
  while (r0 < nRows - 2 && rowE[r0] < thR) r0++
  let r1 = nRows - 1
  while (r1 > r0 + 1 && rowE[r1] < thR) r1--
  if (orientation === 'flat' && c0 % 2 === 1) c0--
  if (orientation === 'pointy' && r0 % 2 === 1) r0--
  return {
    ox: ox + c0 * colPitch,
    oy: oy + r0 * rowPitch,
    cols: c1 - c0 + 1,
    rows: r1 - r0 + 1,
  }
}

function clampInt(v, min, max) {
  return Math.max(min, Math.min(max, Math.round(v)))
}

function round6(v) {
  return Math.round(v * 1e6) / 1e6
}

const NONE_RESULT = {
  gridType: 'none', gridCols: null, gridRows: null, gridHexOrientation: 'flat',
  gridOffsetX: 0, gridOffsetY: 0, gridCellW: null, gridCellH: null, confidence: 0,
}

/**
 * Analyse une image de carte et retourne la configuration de grille détectée.
 * gridCellW/gridCellH sont les dimensions d'une cellule normalisées par la
 * taille de l'image (indépendantes de cols/rows, qui ne définissent que
 * l'espace d'indices couvrant l'image).
 * @param {string} filePath chemin absolu de l'image
 */
async function detectGridConfig(filePath) {
  const { data, w, h } = await loadGrayscale(filePath)
  if (w < 64 || h < 64) return { ...NONE_RESULT }

  const { px, py, G } = computeGradients(data, w, h)

  const maxPeriodX = Math.floor(w / MIN_DIVISIONS)
  const maxPeriodY = Math.floor(h / MIN_DIVISIONS)
  const sx = prepareSignal(px, maxPeriodX)
  const sy = prepareSignal(py, maxPeriodY)
  // Détection de la période sur le signal binarisé (robuste aux amplitudes),
  // puis raffinement sub-pixel sur le signal continu.
  const bx = binarize(sx)
  const by = binarize(sy)
  if (!bx || !by) return { ...NONE_RESULT }
  const fx = findFundamental(bx, minPeriodFor(w), maxPeriodX)
  const fy = findFundamental(by, minPeriodFor(h), maxPeriodY)
  if (!fx || !fy || fx.score < SCORE_THRESHOLD || fy.score < SCORE_THRESHOLD) return { ...NONE_RESULT }
  fx.period = refinePeriod(sx, fx.period, maxPeriodX)
  fy.period = refinePeriod(sy, fy.period, maxPeriodY)

  const ratio = fx.period / fy.period
  const confidence = Math.min(1, (Math.min(fx.score, fy.score) - SCORE_THRESHOLD) / 1.2)

  // ── Grille carrée ─────────────────────────────────────────────────────────
  if (Math.abs(ratio - 1) <= RATIO_TOLERANCE) {
    const phaseX = findPhase(sx, fx.period)
    const phaseY = findPhase(sy, fy.period)
    const extX = combExtent(bx, fx.period, phaseX)
    const extY = combExtent(by, fy.period, phaseY)

    let ox
    let oy
    let cols
    let rows
    if (extX && extY) {
      // Étendue réelle de la grille : entre la première et la dernière ligne
      // observées, étendue d'une cellule de chaque côté si la bande de bord
      // contient encore du signal de grille (cellule partielle coupée).
      const xLines = teethBetween(extX.first, extX.last, fx.period)
      const yLines = teethBetween(extY.first, extY.last, fy.period)
      const interiorX = bandEnergyAlongY(G, w, h, extX.first + 2, extX.last - 2, yLines)
      const interiorY = bandEnergyAlongX(G, w, h, extY.first + 2, extY.last - 2, xLines)
      const leftCell = extX.first > 3 &&
        bandEnergyAlongY(G, w, h, 1, extX.first - 2, yLines) > EDGE_BAND_RATIO * interiorX
      const rightCell = (w - extX.last) > 3 &&
        bandEnergyAlongY(G, w, h, extX.last + 2, w - 1, yLines) > EDGE_BAND_RATIO * interiorX
      const topCell = extY.first > 3 &&
        bandEnergyAlongX(G, w, h, 1, extY.first - 2, xLines) > EDGE_BAND_RATIO * interiorY
      const bottomCell = (h - extY.last) > 3 &&
        bandEnergyAlongX(G, w, h, extY.last + 2, h - 1, xLines) > EDGE_BAND_RATIO * interiorY
      ox = leftCell ? extX.first - fx.period : extX.first
      oy = topCell ? extY.first - fy.period : extY.first
      cols = Math.round((extX.last - extX.first) / fx.period) + (leftCell ? 1 : 0) + (rightCell ? 1 : 0)
      rows = Math.round((extY.last - extY.first) / fy.period) + (topCell ? 1 : 0) + (bottomCell ? 1 : 0)
    } else {
      // Repli : couverture de toute l'image depuis l'origine (-période, 0]
      ox = phaseX > 0 ? phaseX - fx.period : 0
      oy = phaseY > 0 ? phaseY - fy.period : 0
      cols = Math.ceil((w - ox) / fx.period)
      rows = Math.ceil((h - oy) / fy.period)
    }
    return {
      gridType: 'square', gridCols: clampInt(cols, 2, 200), gridRows: clampInt(rows, 2, 200),
      gridHexOrientation: 'flat',
      gridOffsetX: round6(ox / w), gridOffsetY: round6(oy / h),
      gridCellW: round6(fx.period / w), gridCellH: round6(fy.period / h),
      confidence,
    }
  }

  // ── Hexagones ─────────────────────────────────────────────────────────────
  let orientation = null
  let hexW
  let hexH
  if (Math.abs(ratio - SQRT3) <= SQRT3 * RATIO_TOLERANCE) {
    // flat-top : px = 0.75·hexW, py = hexH/2
    orientation = 'flat'
    hexW = fx.period / 0.75
    hexH = fy.period * 2
  } else if (Math.abs(ratio - 1 / SQRT3) <= (1 / SQRT3) * RATIO_TOLERANCE) {
    // pointy-top : px = hexW/2, py = 0.75·hexH
    orientation = 'pointy'
    hexW = fx.period * 2
    hexH = fy.period / 0.75
  } else {
    return { ...NONE_RESULT }
  }

  const fit = fitHexOffset(G, w, h, hexW, hexH, orientation)
  // Espace d'indices couvrant toute l'image depuis l'origine, puis rogné aux
  // colonnes/lignes qui portent réellement la grille (exclut les marges)
  const colPitch = orientation === 'flat' ? 0.75 * hexW : hexW
  const rowPitch = orientation === 'flat' ? hexH : 0.75 * hexH
  const coverCols = Math.ceil((w - fit.ox) / colPitch) + 1
  const coverRows = Math.ceil((h - fit.oy) / rowPitch) + 1
  const ext = trimHexExtent(G, w, h, hexW, hexH, orientation, fit.ox, fit.oy, coverCols, coverRows)
  return {
    gridType: 'hex', gridCols: clampInt(ext.cols, 2, 200), gridRows: clampInt(ext.rows, 2, 200),
    gridHexOrientation: orientation,
    gridOffsetX: round6(ext.ox / w), gridOffsetY: round6(ext.oy / h),
    gridCellW: round6(hexW / w), gridCellH: round6(hexH / h),
    confidence,
  }
}

module.exports = {
  detectGridConfig,
  // Exposé pour les scripts de diagnostic (scripts/detect-grid.js, scripts/grid-overlay.js)
  _internal: { loadGrayscale, computeGradients, prepareSignal, binarize, findFundamental, refinePeriod, findPhase, fitHexOffset, hexVerticesPx, minPeriodFor, MIN_DIVISIONS },
}
