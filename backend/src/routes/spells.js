const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load spells once at startup
let spellsCache = null

function getSpells() {
  if (spellsCache) return spellsCache
  try {
    const filePath = path.join(__dirname, '../data/aidedd_spells.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    // Filter out entries without attributes (the two header-only entries)
    spellsCache = (data.spells || []).filter(s => s.attributes && Object.keys(s.attributes).length > 0)
  } catch (err) {
    console.error('Failed to load spells JSON:', err)
    spellsCache = []
  }
  return spellsCache
}

// Pre-load on module import
getSpells()

function handleList(req, res) {
  const all = [...getSpells()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return res.json(all)
}

function handleSearch(req, res) {
  const q = (req.query.q || '').trim().toLowerCase()
  if (!q) return res.json([])

  const nameMatches = []
  const otherMatches = []

  for (const spell of getSpells()) {
    if (spell.name.toLowerCase().includes(q)) {
      nameMatches.push(spell)
    } else if (
      (spell.description && spell.description.toLowerCase().includes(q)) ||
      (spell.attributes?.ecole || '').toLowerCase().includes(q)
    ) {
      otherMatches.push(spell)
    }
  }

  nameMatches.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  otherMatches.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return res.json([...nameMatches, ...otherMatches].slice(0, 50))
}

// Parsing du niveau depuis le champ "école" (ex: "niveau 3 - évocation", "tour de magie -
// évocation") — même logique que frontend/src/utils/spellSchool.js#parseEcole, dupliquée
// ici car ce module ESM n'est pas importable depuis le backend CommonJS.
function parseSpellLevel(ecole) {
  if (!ecole) return null
  const match = ecole.match(/niveau\s+(\d+)/i)
  if (match) return parseInt(match[1], 10)
  if (/tour de magie/i.test(ecole)) return 0
  return null
}

function handleByClass(req, res) {
  const className = (req.params.className || '').trim().toLowerCase()
  if (!className) return res.json([])

  const matches = getSpells().filter(spell =>
    (spell.classes || []).some(c => c.toLowerCase() === className)
  )
  matches.sort((a, b) => {
    const levelA = parseSpellLevel(a.attributes?.ecole)
    const levelB = parseSpellLevel(b.attributes?.ecole)
    const la = levelA === null ? 99 : levelA
    const lb = levelB === null ? 99 : levelB
    if (la !== lb) return la - lb
    return a.name.localeCompare(b.name, 'fr')
  })

  return res.json(matches)
}

router.get('/', authenticateToken, handleList)
router.get('/search', authenticateToken, handleSearch)
router.get('/public/search', handleSearch)
// Public (sans auth) — parcours complet sans recherche et filtre par classe, utilisés par
// l'écran joueur qui réutilise SpellSearch.vue/ClassSearch.vue en mode `player-mode`.
router.get('/public', handleList)
router.get('/by-class/:className', authenticateToken, handleByClass)
router.get('/public/by-class/:className', handleByClass)

module.exports = router
