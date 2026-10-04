// Générateur de butin local (sans IA, sans quota). Inspiré des tables de trésor du DMG,
// volontairement simplifié : les montants sont des ordres de grandeur utilisables à la table.
const { getStandardItems, getMagicItems } = require('./data/itemsLoader')

const SCENARIOS = ['animaux', 'humanoïdes', 'monstre unique', 'trésor unique']
const TIERS = ['1-4', '5-10', '11-16', '17-20']
const COUNTS = ['1', '2-4', '5-10']

const COIN_LABEL = { cp: 'pc', sp: 'pa', ep: 'pe', gp: 'po', pp: 'pp' }

const defaultRng = Math.random

function roll(rng, n, sides) {
  let total = 0
  for (let i = 0; i < n; i++) total += 1 + Math.floor(rng() * sides)
  return total
}
const d100 = (rng) => 1 + Math.floor(rng() * 100)

// [dés, faces, multiplicateur, pièce]
const coin = (n, s, mult, c) => ({ n, s, mult, c })

// Trésor individuel par palier : [seuil d100 inclus, pièces]
const INDIVIDUAL = [
  [[30, [coin(5, 6, 1, 'cp')]], [60, [coin(4, 6, 1, 'sp')]], [70, [coin(3, 6, 1, 'ep')]], [95, [coin(3, 6, 1, 'gp')]], [100, [coin(1, 6, 1, 'pp')]]],
  [[30, [coin(4, 6, 100, 'cp'), coin(1, 6, 10, 'ep')]], [60, [coin(6, 6, 10, 'sp'), coin(2, 6, 10, 'gp')]], [70, [coin(3, 6, 10, 'ep'), coin(2, 6, 10, 'gp')]], [95, [coin(4, 6, 10, 'gp')]], [100, [coin(2, 6, 10, 'gp'), coin(3, 6, 1, 'pp')]]],
  [[20, [coin(4, 6, 100, 'sp'), coin(1, 6, 100, 'gp')]], [35, [coin(1, 6, 100, 'ep'), coin(1, 6, 100, 'gp')]], [75, [coin(2, 6, 100, 'gp'), coin(1, 6, 10, 'pp')]], [100, [coin(2, 6, 100, 'gp'), coin(2, 6, 10, 'pp')]]],
  [[15, [coin(2, 6, 1000, 'ep'), coin(8, 6, 100, 'gp')]], [55, [coin(1, 6, 1000, 'gp'), coin(1, 6, 100, 'pp')]], [100, [coin(1, 6, 1000, 'gp'), coin(2, 6, 100, 'pp')]]],
]

// Pièces d'un trésor unique (cache/coffre) par palier
const HOARD_COINS = [
  [coin(6, 6, 100, 'cp'), coin(3, 6, 100, 'sp'), coin(2, 6, 10, 'gp')],
  [coin(2, 6, 100, 'cp'), coin(2, 6, 1000, 'sp'), coin(6, 6, 100, 'gp'), coin(3, 6, 10, 'pp')],
  [coin(4, 6, 1000, 'gp'), coin(5, 6, 100, 'pp')],
  [coin(12, 6, 1000, 'gp'), coin(8, 6, 1000, 'pp')],
]

// Gemmes / objets d'art d'un trésor unique : [nb dés, faces, valeur po, libellé]
const HOARD_VALUABLES = [
  [[2, 6, 10, 'gemme(s) à 10 po'], [2, 4, 25, 'objet(s) d\'art à 25 po']],
  [[3, 6, 50, 'gemme(s) à 50 po'], [2, 4, 250, 'objet(s) d\'art à 250 po']],
  [[3, 6, 500, 'gemme(s) à 500 po'], [2, 4, 750, 'objet(s) d\'art à 750 po']],
  [[3, 6, 1000, 'gemme(s) à 1000 po'], [1, 10, 2500, 'objet(s) d\'art à 2500 po']],
]

// Raretés d'objets magiques plausibles par palier, pondérées
const MAGIC_RARITIES = [
  [['commun', 6], ['peu commun', 3]],
  [['peu commun', 6], ['rare', 3], ['commun', 1]],
  [['rare', 6], ['très rare', 3], ['peu commun', 1]],
  [['très rare', 6], ['légendaire', 3], ['rare', 1]],
]

// Ressources de dépeçage (animaux) par palier
const ANIMAL_RESOURCES = [
  ['peau', 'fourrure', 'crocs', 'griffes', 'viande fraîche', 'plumes', 'os'],
  ['peau épaisse', 'fourrure de qualité', 'crocs', 'griffes', 'viande fraîche', 'cornes'],
  ['peau résistante', 'crocs imposants', 'griffes acérées', 'corne', 'viande rare', 'organe aux propriétés alchimiques'],
  ['peau de bête colossale', 'dents massives', 'organe aux propriétés alchimiques', 'écailles', 'os dense'],
]

const TROPHIES = ['une griffe', 'un croc', 'une dent', 'une corne', 'une écaille', 'un œil', 'un fragment de carapace']

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)]
}

function weighted(rng, entries) {
  const total = entries.reduce((n, [, w]) => n + w, 0)
  let r = rng() * total
  for (const [value, w] of entries) {
    if ((r -= w) < 0) return value
  }
  return entries[0][0]
}

function sumCoins(coins, rng, into) {
  for (const { n, s, mult, c } of coins) into[c] = (into[c] || 0) + roll(rng, n, s) * mult
}

function formatCoins(totals) {
  const order = ['pp', 'gp', 'ep', 'sp', 'cp']
  const parts = order.filter(c => totals[c] > 0).map(c => `${totals[c]} ${COIN_LABEL[c]}`)
  return parts.length ? `💰 ${parts.join(', ')}` : null
}

function randomMagicItems(rng, tier, count) {
  const all = getMagicItems().filter(i => i.rarity)
  const lines = []
  for (let i = 0; i < count; i++) {
    const rarity = weighted(rng, MAGIC_RARITIES[tier])
    const pool = all.filter(it => it.rarity === rarity)
    if (!pool.length) continue
    const item = pick(rng, pool)
    lines.push(`✨ ${item.name} (${item.rarity}${item.item_type ? `, ${item.item_type.toLowerCase()}` : ''})`)
  }
  return lines
}

function randomStandardItem(rng) {
  const items = getStandardItems()
  if (!items.length) return null
  const item = pick(rng, items)
  const price = item.list_data?.prix
  return `🎒 ${item.name}${price ? ` (${price})` : ''}`
}

function creatureCount(countOpt, rng) {
  if (countOpt === '1') return 1
  if (countOpt === '5-10') return 5 + Math.floor(rng() * 6)
  return 2 + Math.floor(rng() * 3)
}

function generateLoot(options = {}, rng = defaultRng) {
  const scenario = SCENARIOS.includes(options.scenario) ? options.scenario : 'humanoïdes'
  const tier = Math.max(0, TIERS.indexOf(options.palier))
  const count = creatureCount(COUNTS.includes(options.nombre) ? options.nombre : '2-4', rng)
  const lines = []

  if (scenario === 'animaux') {
    const resources = ANIMAL_RESOURCES[tier]
    const n = Math.min(count, resources.length)
    const picked = new Set()
    while (picked.size < n) picked.add(pick(rng, resources))
    lines.push(`🐾 ${count} bête(s) — ressources à dépecer : ${[...picked].join(', ')}`)
    if (d100(rng) <= 15) {
      const totals = {}
      sumCoins([coin(1, 6, tier >= 2 ? 10 : 1, 'gp')], rng, totals)
      lines.push(`${formatCoins(totals)} (trouvés dans le repaire ou sur une précédente victime)`)
    }
  } else if (scenario === 'humanoïdes') {
    const totals = {}
    for (let i = 0; i < count; i++) {
      const r = d100(rng)
      const row = INDIVIDUAL[tier].find(([max]) => r <= max)
      sumCoins(row[1], rng, totals)
    }
    lines.push(`👥 ${count} humanoïde(s)`)
    lines.push(formatCoins(totals))
    const gear = Math.max(1, Math.round(count / 2))
    for (let i = 0; i < gear; i++) if (d100(rng) <= 60) lines.push(randomStandardItem(rng))
    if (d100(rng) <= 10 + tier * 10) lines.push(...randomMagicItems(rng, tier, 1))
  } else if (scenario === 'monstre unique') {
    const totals = {}
    const r = d100(rng)
    sumCoins(INDIVIDUAL[tier].find(([max]) => r <= max)[1], rng, totals)
    lines.push(`🐉 Repaire du monstre`)
    lines.push(formatCoins(totals))
    lines.push(`🦴 Trophée : ${pick(rng, TROPHIES)} (valeur ${Math.max(1, roll(rng, 2, 6)) * (tier + 1) * 25} po auprès d'un collectionneur)`)
    if (d100(rng) <= 25 + tier * 10) lines.push(...randomMagicItems(rng, tier, 1))
  } else {
    const totals = {}
    sumCoins(HOARD_COINS[tier], rng, totals)
    lines.push('🏺 Trésor unique')
    lines.push(formatCoins(totals))
    const [n, s, value, label] = pick(rng, HOARD_VALUABLES[tier])
    lines.push(`💎 ${roll(rng, n, s)} ${label} (≈ ${value} po pièce)`)
    lines.push(...randomMagicItems(rng, tier, roll(rng, 1, 4)))
  }
  return lines.filter(Boolean)
}

module.exports = { generateLoot, SCENARIOS, TIERS, COUNTS }
