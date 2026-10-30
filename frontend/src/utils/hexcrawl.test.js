import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HEXCRAWL_CONFIG as CFG, calibrateGrid, computeHexcrawl, describeTravel, formatHours, hexLabel, labelOffsetsFor, parseHexCode, publicHexcrawl,
} from './hexcrawl.js'
import { getCellsWithin, getCellCenter } from './mapGrid.js'

const start = { t: 'start', cell: 0, nx: 0, ny: 0 }
const step = (cell, extra = {}) => ({ t: 'step', cell, nx: cell / 100, ny: 0, ...extra })
const steps = (n, from = 1) => Array.from({ length: n }, (_, i) => step(from + i))
const foot = { ...CFG, vehicleEnabled: false, pursuit: { ...CFG.pursuit, enabled: false } }

describe('computeHexcrawl — temps', () => {
  it('starts on day 1, quarter 1, without consuming anything', () => {
    const s = computeHexcrawl(CFG, [start])
    expect(s).toMatchObject({ day: 1, quarter: 1, fuel: 16, mode: 'vehicle', sinceRest: 0, movesLeftToday: 8 })
  })
  it('moves 1 hex per quarter on foot, 2 by vehicle', () => {
    expect(computeHexcrawl(foot, [start, ...steps(3)]).quarter).toBe(4)
    expect(computeHexcrawl(CFG, [start, ...steps(3)])).toMatchObject({ quarter: 2, used: 1, fuel: 13 })
  })
  it('a halt takes one quarter and keeps a half-used one going', () => {
    expect(computeHexcrawl(CFG, [start, step(1), { t: 'halt' }])).toMatchObject({ quarter: 2, used: 1, fuel: 15 })
    expect(computeHexcrawl(CFG, [start, step(1), { t: 'halt' }, step(2)])).toMatchObject({ quarter: 3, used: 0, fuel: 14 })
  })
  it('flags a due rest after 4 action quarters, and the rest clears it', () => {
    const tired = computeHexcrawl(foot, [start, ...steps(4)])
    expect(tired).toMatchObject({ restDue: true, movesLeftToday: 0 })
    const rested = computeHexcrawl(foot, [start, ...steps(4), { t: 'rest' }])
    expect(rested).toMatchObject({ restDue: false, day: 2, quarter: 1, movesLeftToday: 4 })
  })
  it('hard terrain: 2 quarters on foot, a full quarter and 1 fuel by vehicle', () => {
    expect(computeHexcrawl(foot, [start, step(1, { hard: true })]).quarter).toBe(3)
    expect(computeHexcrawl(CFG, [start, step(1, { hard: true })])).toMatchObject({ quarter: 2, used: 0, fuel: 15 })
  })
  it('matches the reference day: 3 quarters on foot + 1 halt = 3 hexes = 30 km', () => {
    const s = computeHexcrawl(foot, [start, ...steps(3), { t: 'halt' }])
    expect(s.trail.length - 1).toBe(3)
    expect(s.restDue).toBe(true)
  })
})

describe('computeHexcrawl — heures', () => {
  it('advances the clock inside a started quarter', () => {
    const s = computeHexcrawl(CFG, [start, step(1)])
    expect(s).toMatchObject({ quarter: 1, hoursToday: 2, hoursToFinishQuarter: 2, hoursLeft: 14, hoursPerHex: 2 })
    expect(s.army.releaseInHours).toBe(6)
  })
  it('adds exactly 4 h on a halt, even in a started quarter', () => {
    expect(computeHexcrawl(CFG, [start, step(1), { t: 'halt' }]).hoursToday).toBe(6)
  })
  it('still finishes the started quarter on a rest', () => {
    expect(computeHexcrawl(CFG, [start, step(1), { t: 'rest' }])).toMatchObject({ hoursToday: 12, hoursSinceRest: 0, used: 0 })
  })
  it('wraps to 0 h on the next day', () => {
    expect(computeHexcrawl(CFG, [start, ...Array(6).fill({ t: 'halt' })])).toMatchObject({ day: 2, hoursToday: 0 })
  })
  it('formats fractional hours the French way', () => {
    expect(formatHours(4)).toBe('4 h')
    expect(formatHours(4 / 3)).toBe('1,3 h')
  })
})

describe('computeHexcrawl — carburant', () => {
  it('runs dry after 16 moves and a soul coin adds 8', () => {
    const dry = computeHexcrawl(CFG, [start, ...steps(16)])
    expect(dry).toMatchObject({ fuel: 0, outOfFuel: true, movesLeftToday: 0 })
    expect(computeHexcrawl(CFG, [start, ...steps(16), { t: 'refuel', amount: 8 }]).fuel).toBe(8)
  })
  it('walking does not burn fuel', () => {
    expect(computeHexcrawl(CFG, [start, { t: 'mode', mode: 'foot' }, ...steps(2)]).fuel).toBe(16)
  })
})

describe('computeHexcrawl — repos', () => {
  const tired = [start, ...steps(8)]
  it('skipping a rest gives a full cycle back, then asks again', () => {
    expect(computeHexcrawl(CFG, tired).restDue).toBe(true)
    const skipped = computeHexcrawl(CFG, [...tired, { t: 'no-rest' }])
    expect(skipped).toMatchObject({ restDue: false, skippedRests: 1, quartersLeft: 6, quarter: 5 })
    const again = [...tired, { t: 'no-rest' }, ...Array(6).fill({ t: 'halt' })]
    expect(computeHexcrawl(CFG, again).restDue).toBe(true)
  })
  it('counts elapsed hours: the rest comes at 16 h, whatever the answer', () => {
    expect(computeHexcrawl(CFG, tired)).toMatchObject({ restDue: true, day: 1, hoursToday: 16, hoursSinceRest: 16, hoursLeft: 0 })
    expect(publicHexcrawl(CFG, computeHexcrawl(CFG, tired))).toMatchObject({ day: 1, hours: 16 })
    expect(computeHexcrawl(CFG, [...tired, { t: 'no-rest' }])).toMatchObject({ day: 1, hoursToday: 16 })
    expect(computeHexcrawl(CFG, [...tired, { t: 'rest' }])).toMatchObject({ day: 2, hoursToday: 0, hoursSinceRest: 0, hoursLeft: 16 })
  })
  it('a real rest clears skipped rests', () => {
    const rested = computeHexcrawl(CFG, [...tired, { t: 'no-rest' }, { t: 'rest' }])
    expect(rested).toMatchObject({ skippedRests: 0, restDue: false, quartersLeft: 4 })
  })
  it('never asks for a rest when the config has none', () => {
    const none = { ...CFG, restQuarters: 0 }
    expect(computeHexcrawl(none, [start, ...Array(6).fill({ t: 'halt' })])).toMatchObject({ restDue: false, quartersLeft: 6 })
  })
})

describe('computeHexcrawl — poursuite', () => {
  it('releases the first wave at the 3rd quarter, on the first hex of the trail', () => {
    const before = computeHexcrawl(CFG, [start, step(1)])
    expect(before.army).toMatchObject({ status: 'waiting', releaseIn: 2 })
    const released = computeHexcrawl(CFG, [start, ...steps(4)])
    expect(released.quarter).toBe(3)
    expect(released.army).toMatchObject({ status: 'active', cell: 0, distance: 4 })
  })
  it('follows the wave schedule along the trail, including during rests', () => {
    const s = computeHexcrawl(CFG, [start, ...steps(4), { t: 'rest' }])
    expect(s.army).toMatchObject({ pos: 2, distance: 2, alert: 'near' })
  })
  it('never overtakes the party and reports contact', () => {
    const s = computeHexcrawl(CFG, [start, ...steps(4), { t: 'rest' }, { t: 'rest' }])
    expect(s.army).toMatchObject({ distance: 0, alert: 'contact' })
  })
  it('leaves the trail for the party when one hex away, without waiting for the trail', () => {
    // La piste fait une boucle : le groupe (case 4) revient à côté de la case 0, où l'armée est lâchée.
    const log = [start, ...steps(4), { t: 'halt' }]
    expect(computeHexcrawl(CFG, log).army).toMatchObject({ pos: 1, distance: 3 })
    const looped = computeHexcrawl(CFG, log, { neighbors: cell => (cell === 0 ? [4] : []) })
    expect(looped.army).toMatchObject({ pos: 4, distance: 0, alert: 'contact', cell: 4 })
  })
  it('warns when the party stands next to the army, even far along the trail', () => {
    const log = [start, ...steps(4)]
    const s = computeHexcrawl({ ...CFG, pursuit: { ...CFG.pursuit, nearDistance: 0 } }, log, { neighbors: cell => (cell === 0 ? [4] : []) })
    expect(s.army).toMatchObject({ adjacent: true, alert: 'near', distance: 4 })
  })
  it('can be shifted by traps and waits waveDelay before the next wave', () => {
    const log = [start, ...steps(4), { t: 'rest' }]
    expect(computeHexcrawl(CFG, [...log, { t: 'army', delta: -2 }]).army.pos).toBe(0)
    const defeated = computeHexcrawl(CFG, [...log, { t: 'wave-defeated' }])
    expect(defeated.army).toMatchObject({ status: 'waiting', waveName: 'Les Chasseurs', releaseIn: 9 })
  })
  it('stops for good when the last wave falls or at the pursuit end', () => {
    expect(computeHexcrawl(CFG, [start, { t: 'pursuit-end' }]).army.status).toBe('over')
  })
})

describe('undo', () => {
  it('is simply the previous log', () => {
    const log = [start, ...steps(3), { t: 'halt' }, { t: 'refuel', amount: 8 }]
    const previous = computeHexcrawl(CFG, log.slice(0, -1))
    expect(previous.fuel).toBe(13)
  })
})

describe('publicHexcrawl', () => {
  it('always announces contact, without revealing the army before that', () => {
    const near = computeHexcrawl(CFG, [start, ...steps(4), { t: 'rest' }])
    expect(publicHexcrawl(CFG, near).contact).toBeNull()
    const reached = computeHexcrawl(CFG, [start, ...steps(4), { t: 'rest' }, { t: 'rest' }])
    expect(publicHexcrawl(CFG, reached)).toMatchObject({ contact: 'La Meute', army: null })
  })
  it('hides the army unless the GM shows it', () => {
    const status = computeHexcrawl(CFG, [start, ...steps(4)])
    expect(publicHexcrawl(CFG, status).army).toBeNull()
    const shown = { ...CFG, pursuit: { ...CFG.pursuit, showOnTv: true } }
    expect(publicHexcrawl(shown, status).army).toMatchObject({ name: 'La Meute' })
    expect(JSON.stringify(publicHexcrawl(CFG, status))).not.toContain('Meute')
  })
  it('can hide the fuel', () => {
    const status = computeHexcrawl(CFG, [start])
    expect(publicHexcrawl({ ...CFG, showFuelOnTv: false }, status).fuel).toBeNull()
  })
})

describe('hexLabel', () => {
  it('reads like the printed map', () => {
    expect(hexLabel(7 * 20 + 7, 20)).toBe('H8')
    expect(hexLabel(11 * 20 + 1, 20)).toBe('B12')
    expect(hexLabel(26, 30)).toBe('AA1')
  })
  it('calibrates from one known hex', () => {
    const offsets = labelOffsetsFor(21, 20, 'C3')
    expect(hexLabel(21, 20, offsets)).toBe('C3')
    expect(labelOffsetsFor(0, 20, 'nope')).toBeNull()
  })
})

describe('describeTravel', () => {
  it('summarises the chapter numbers', () => {
    const d = describeTravel(CFG)
    expect(d.foot).toEqual({ hexes: 4, km: 40, miles: 25 })
    expect(d.vehicle.hexes).toBe(8)
    expect(d.fuelDays).toBe(2)
    expect(d.refillDays).toBe(1)
  })
})

describe('grid helpers', () => {
  const args = ['square', 5, 5, 'flat', 0, 0, null, null]
  it('getCellsWithin expands ring by ring', () => {
    expect(getCellsWithin(12, 1, args)).toHaveLength(8)
    expect(getCellsWithin(12, 2, args)).toHaveLength(24)
    expect(getCellsWithin(12, 0, args)).toHaveLength(0)
  })
  it('getCellCenter finds the middle of a cell', () => {
    expect(getCellCenter(0, ...args)).toEqual({ nx: 0.1, ny: 0.1 })
  })
})

describe('calibrateGrid', () => {
  // Grille de référence avec marges : la calibration doit retrouver exactement ses paramètres.
  const truth = { cellW: 0.0625, cellH: 0.068, offsetX: 0.021, offsetY: 0.034 }
  const center = (orientation, col, row) => {
    const idx = row * 20 + col
    const c = getCellCenter(idx, 'hex', 20, 14, orientation, truth.offsetX, truth.offsetY, truth.cellW, truth.cellH)
    return { col, row, ...c }
  }
  for (const orientation of ['flat', 'pointy']) {
    it(`recovers a ${orientation} grid from A1 and T14`, () => {
      const got = calibrateGrid(orientation, center(orientation, 0, 0), center(orientation, 19, 13))
      for (const key of Object.keys(truth)) expect(got[key]).toBeCloseTo(truth[key], 6)
    })
    it(`recovers a ${orientation} grid from two inner hexes`, () => {
      const got = calibrateGrid(orientation, center(orientation, 3, 2), center(orientation, 8, 11))
      for (const key of Object.keys(truth)) expect(got[key]).toBeCloseTo(truth[key], 6)
    })
  }
  it('refuses hexes that cannot determine the grid', () => {
    expect(calibrateGrid('flat', center('flat', 3, 2), center('flat', 3, 9))).toBeNull()
    expect(calibrateGrid('flat', { col: 8, row: 8, nx: 0.5, ny: 0.5 }, { col: 2, row: 2, nx: 0.5, ny: 0.5 })).toBeNull()
  })
})

describe('parseHexCode', () => {
  it('reads codes', () => {
    expect(parseHexCode(' t14 ')).toEqual({ col: 19, row: 13 })
    expect(parseHexCode('A0')).toBeNull()
    expect(parseHexCode('14')).toBeNull()
  })
})
