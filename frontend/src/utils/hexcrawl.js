// Module hexcrawl : logique pure du voyage. L'état n'est jamais stocké tel quel : il se recalcule en
// rejouant le journal d'actions (`log`), ce qui rend l'annulation triviale (retirer la dernière
// entrée) et garantit que jour, quart, carburant, piste et armée ne peuvent pas se désynchroniser.
// Le quart reste l'unité des règles et des réglages stockés ; l'interface ne parle qu'en heures.

export const DEFAULT_HEXCRAWL_CONFIG = {
  hexKm: 10,
  quartersPerDay: 6,
  quarterHours: 4,
  restQuarters: 2,
  footSpeed: 1,
  vehicleEnabled: true,
  vehicleName: 'Engin',
  vehicleSpeed: 2,
  fuelStart: 16,
  fuelRefill: 8,
  showFuelOnTv: true,
  revealNeighbors: false,
  // Décalage entre l'indice de grille et le code imprimé sur la carte (calibration de l'assistant).
  labelColOffset: 0,
  labelRowOffset: 0,
  pursuit: {
    enabled: true,
    showOnTv: false,
    startDelay: 2,
    waveDelay: 9,
    nearDistance: 3,
    waves: [
      { name: 'La Meute', moves: [1, 1, 1, 1, 1, 2] },
      { name: 'Les Chasseurs', moves: [1, 1, 2, 1, 1, 2] },
      { name: 'Le Geôlier', moves: [1, 2, 2, 1, 2, 2] },
    ],
  },
}

export const HEXCRAWL_PRESETS = [
  { key: 'vehicle', label: 'Par tranches de 4 h, véhicule et poursuite', config: DEFAULT_HEXCRAWL_CONFIG },
  {
    key: 'simple',
    label: 'Exploration simple, à pied',
    config: {
      ...DEFAULT_HEXCRAWL_CONFIG,
      vehicleEnabled: false,
      pursuit: { ...DEFAULT_HEXCRAWL_CONFIG.pursuit, enabled: false },
    },
  },
]

const KM_PER_MILE = 1.609344

export function kmToMiles(km) {
  return km / KM_PER_MILE
}

/** « 4 h », « 1,5 h » : une tranche peut se diviser en durées non entières. */
export function formatHours(hours) {
  return `${String(Math.round(hours * 10) / 10).replace('.', ',')} h`
}

/** Complète une config stockée avec les valeurs par défaut (champs ajoutés depuis sa création). */
export function normalizeConfig(config) {
  const c = config || {}
  const quartersPerDay = Math.max(1, parseInt(c.quartersPerDay, 10) || DEFAULT_HEXCRAWL_CONFIG.quartersPerDay)
  const rest = parseInt(c.restQuarters, 10)
  return {
    ...DEFAULT_HEXCRAWL_CONFIG,
    ...c,
    quartersPerDay,
    restQuarters: Math.max(0, Math.min(quartersPerDay - 1, Number.isNaN(rest) ? DEFAULT_HEXCRAWL_CONFIG.restQuarters : rest)),
    pursuit: { ...DEFAULT_HEXCRAWL_CONFIG.pursuit, ...(c.pursuit || {}) },
  }
}

export function actionQuarters(config) {
  return Math.max(1, config.quartersPerDay - config.restQuarters)
}

/** Résumé lisible d'une config, pour l'écran de réglages. */
export function describeTravel(rawConfig) {
  const config = normalizeConfig(rawConfig)
  const perDay = speed => speed * actionQuarters(config)
  const leg = speed => {
    const km = perDay(speed) * config.hexKm
    return { hexes: perDay(speed), km, miles: Math.round(kmToMiles(km)) }
  }
  const out = { foot: leg(config.footSpeed), actionQuarters: actionQuarters(config) }
  if (config.vehicleEnabled) {
    out.vehicle = leg(config.vehicleSpeed)
    out.fuelDays = out.vehicle.hexes ? config.fuelStart / out.vehicle.hexes : 0
    out.refillDays = out.vehicle.hexes ? config.fuelRefill / out.vehicle.hexes : 0
  }
  return out
}

/** Code d'une case, tel qu'imprimé sur la carte : colonne en lettres, ligne en chiffres (ex. H8). */
export function hexLabel(cell, cols, config = {}) {
  if (cell == null || cell < 0 || !cols) return ''
  let col = (cell % cols) + (config.labelColOffset || 0)
  const row = Math.floor(cell / cols) + (config.labelRowOffset || 0) + 1
  if (col < 0) return `?${row}`
  let letters = ''
  do {
    letters = String.fromCharCode(65 + (col % 26)) + letters
    col = Math.floor(col / 26) - 1
  } while (col >= 0)
  return `${letters}${row}`
}

/** Inverse de hexLabel : décalages à appliquer pour que `cell` porte le code `label`. */
export function labelOffsetsFor(cell, cols, label) {
  const parsed = parseHexCode(label)
  if (!parsed) return null
  return {
    labelColOffset: parsed.col - (cell % cols),
    labelRowOffset: parsed.row - Math.floor(cell / cols),
  }
}

/** Lit un code imprimé (« T14 ») en indices de colonne et de ligne, ou null. */
export function parseHexCode(code) {
  const match = /^\s*([A-Za-z]+)\s*(\d+)\s*$/.exec(code || '')
  if (!match) return null
  const col = [...match[1].toUpperCase()].reduce((sum, ch) => sum * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  const row = parseInt(match[2], 10) - 1
  return row >= 0 ? { col, row } : null
}

/**
 * Calage en 2 clics : à partir du centre de deux cases dont on connaît le code, retrouve la taille
 * des cases et l'origine de la grille. `a` et `b` = { col, row, nx, ny }, coordonnées normalisées.
 * Renvoie null si les deux cases ne permettent pas de résoudre (même colonne ou même ligne).
 */
export function calibrateGrid(orientation, a, b) {
  const dc = b.col - a.col
  const dr = b.row - a.row
  const odd = v => ((v % 2) + 2) % 2
  let cellW, cellH, offsetX, offsetY
  if (orientation === 'pointy') {
    const across = dc + (odd(b.row) - odd(a.row)) / 2
    if (dr === 0 || across === 0) return null
    cellW = (b.nx - a.nx) / across
    cellH = (b.ny - a.ny) / (0.75 * dr)
    offsetX = a.nx - (a.col + 0.5) * cellW - (odd(a.row) ? cellW / 2 : 0)
    offsetY = a.ny - (a.row * 0.75 + 0.5) * cellH
  } else {
    const down = dr + (odd(b.col) - odd(a.col)) / 2
    if (dc === 0 || down === 0) return null
    cellW = (b.nx - a.nx) / (0.75 * dc)
    cellH = (b.ny - a.ny) / down
    offsetX = a.nx - (a.col * 0.75 + 0.5) * cellW
    offsetY = a.ny - (a.row + 0.5) * cellH - (odd(a.col) ? cellH / 2 : 0)
  }
  if (!(cellW > 0) || !(cellH > 0)) return null
  return { cellW, cellH, offsetX, offsetY }
}

function initialArmy(config) {
  if (!config.pursuit.enabled || config.pursuit.waves.length === 0) return null
  return { status: 'waiting', wave: 0, releaseAt: config.pursuit.startDelay, pos: 0, step: 0 }
}

/**
 * Rejoue le journal. Règle d'un quart à moitié utilisé : un repos, une fin de quart ou un changement de
 * mode le clôt ; une halte dure exactement un quart et le laisse entamé (2 h + 4 h = 6 h). Le terrain difficile
 * (`hard`) coûte le double en mouvement mais un seul déplacement de carburant : un hex de crête
 * à pied prend 2 quarts, une brèche en véhicule prend un quart entier.
 * `neighbors(cell)` donne les cases voisines : l'armée s'en sert pour couper vers le groupe.
 */
export function computeHexcrawl(rawConfig, log = [], { neighbors = () => [] } = {}) {
  const config = normalizeConfig(rawConfig)
  const s = {
    started: false,
    trail: [],
    total: 0,
    used: 0,
    sinceRest: 0,
    skippedRests: 0,
    mode: config.vehicleEnabled ? 'vehicle' : 'foot',
    fuel: config.fuelStart,
    army: initialArmy(config),
  }
  const speedOf = mode => Math.max(1, mode === 'vehicle' ? config.vehicleSpeed : config.footSpeed)

  function tick(isRest = false) {
    const army = s.army
    if (army?.status === 'active') {
      const moves = config.pursuit.waves[army.wave]?.moves || []
      if (moves.length) {
        const last = Math.max(0, s.trail.length - 1)
        // Hex par hex le long de la piste, mais à une case du groupe l'armée quitte la piste et fonce.
        for (let i = moves[army.step % moves.length]; i > 0 && army.pos < last; i--) {
          army.pos = neighbors(s.trail[army.pos].cell).includes(s.trail[last].cell) ? last : army.pos + 1
        }
        army.step += 1
      }
    }
    s.total += 1
    s.sinceRest = isRest ? 0 : s.sinceRest + 1
    if (isRest) s.skippedRests = 0
    if (army?.status === 'waiting' && s.total >= army.releaseAt) {
      army.status = 'active'
      army.pos = 0
      army.step = 0
    }
  }

  function closeQuarter() {
    if (s.used > 0) {
      s.used = 0
      tick()
    }
  }

  for (const entry of log) {
    switch (entry.t) {
      case 'start':
        s.started = true
        s.trail = [{ cell: entry.cell, nx: entry.nx, ny: entry.ny }]
        break
      case 'step': {
        if (!s.started) break
        s.trail.push({ cell: entry.cell, nx: entry.nx, ny: entry.ny })
        if (s.mode === 'vehicle') s.fuel = Math.max(0, s.fuel - 1)
        s.used += entry.hard ? 2 : 1
        const speed = speedOf(s.mode)
        while (s.used >= speed) {
          s.used -= speed
          tick()
        }
        break
      }
      case 'mode':
        closeQuarter()
        s.mode = entry.mode === 'vehicle' && config.vehicleEnabled ? 'vehicle' : 'foot'
        break
      case 'end-quarter':
        if (s.used > 0) closeQuarter()
        else tick()
        break
      case 'halt':
        tick()
        break
      case 'rest':
        closeQuarter()
        for (let i = 0; i < config.restQuarters; i++) tick(true)
        break
      case 'no-rest':
        s.skippedRests += 1
        break
      case 'refuel':
        s.fuel = Math.max(0, s.fuel + (Number(entry.amount) || 0))
        break
      case 'army':
        if (s.army?.status === 'active') {
          s.army.pos = Math.min(Math.max(0, s.army.pos + (Number(entry.delta) || 0)), Math.max(0, s.trail.length - 1))
        }
        break
      case 'wave-defeated':
        if (s.army?.status === 'active') {
          const next = s.army.wave + 1
          if (next >= config.pursuit.waves.length) s.army.status = 'over'
          else s.army = { status: 'waiting', wave: next, releaseAt: s.total + config.pursuit.waveDelay, pos: 0, step: 0 }
        }
        break
      case 'pursuit-end':
        if (s.army) s.army.status = 'over'
        break
      default:
        break
    }
  }

  const speed = speedOf(s.mode)
  const action = actionQuarters(config)
  // Un repos sauté rend tout un cycle : les quarts de repos servent à agir, puis la journée suivante.
  const restThreshold = action + s.skippedRests * config.quartersPerDay
  const quartersLeft = config.restQuarters > 0
    ? Math.max(0, restThreshold - s.sinceRest)
    : action - (s.sinceRest % action)
  let movesLeftToday = Math.max(0, quartersLeft * speed - s.used)
  if (s.mode === 'vehicle') movesLeftToday = Math.min(movesLeftToday, s.fuel)
  const position = s.trail[s.trail.length - 1] || null
  // Heures déjà passées dans le quart entamé : un hex en véhicule fait avancer l'horloge sans clore le quart.
  const partialHours = (s.used / speed) * config.quarterHours

  let army = null
  if (s.army) {
    const wave = config.pursuit.waves[s.army.wave]
    army = { status: s.army.status, waveIndex: s.army.wave, waveName: wave?.name || '' }
    if (s.army.status === 'waiting') {
      army.releaseIn = Math.max(0, s.army.releaseAt - s.total)
      army.releaseInHours = Math.max(0, army.releaseIn * config.quarterHours - partialHours)
    }
    if (s.army.status === 'active') {
      const at = s.trail[s.army.pos] || null
      army.pos = s.army.pos
      army.cell = at?.cell ?? null
      army.nx = at?.nx ?? null
      army.ny = at?.ny ?? null
      army.distance = Math.max(0, s.trail.length - 1 - s.army.pos)
      army.adjacent = army.distance > 0 && at != null && neighbors(at.cell).includes(position?.cell)
      army.alert = !s.trail.length ? null
        : army.distance === 0 ? 'contact'
        : army.adjacent || army.distance <= config.pursuit.nearDistance ? 'near'
        : null
    }
  }

  return {
    started: s.started,
    trail: s.trail,
    position,
    totalQuarters: s.total,
    day: Math.floor(s.total / config.quartersPerDay) + 1,
    quarter: (s.total % config.quartersPerDay) + 1,
    hoursToday: (s.total % config.quartersPerDay) * config.quarterHours + partialHours,
    quartersPerDay: config.quartersPerDay,
    used: s.used,
    speed,
    hoursPerHex: config.quarterHours / speed,
    hoursToFinishQuarter: config.quarterHours - partialHours,
    mode: s.mode,
    fuel: s.fuel,
    outOfFuel: s.mode === 'vehicle' && s.fuel <= 0,
    sinceRest: s.sinceRest,
    hoursSinceRest: s.sinceRest * config.quarterHours + partialHours,
    quartersLeft,
    hoursLeft: Math.max(0, quartersLeft * config.quarterHours - partialHours),
    restDue: config.restQuarters > 0 && s.sinceRest >= restThreshold,
    skippedRests: s.skippedRests,
    movesLeftToday,
    army,
  }
}

/**
 * Ce que la TV a le droit de savoir : jamais le journal, la position de l'armée seulement si le MJ
 * l'a décidé. Le contact, lui, est toujours annoncé : à ce stade, les joueurs ont l'armée sous les yeux.
 */
export function publicHexcrawl(rawConfig, status) {
  const config = normalizeConfig(rawConfig)
  const showArmy = config.pursuit.showOnTv && status.army?.status === 'active' && status.army.nx != null
  return {
    hexKm: config.hexKm,
    day: status.day,
    hours: status.hoursToday,
    mode: status.mode,
    fuel: config.vehicleEnabled && config.showFuelOnTv ? status.fuel : null,
    trail: status.trail.map(p => ({ nx: p.nx, ny: p.ny })),
    army: showArmy ? { nx: status.army.nx, ny: status.army.ny, name: status.army.waveName } : null,
    contact: status.army?.alert === 'contact' ? status.army.waveName : null,
  }
}
