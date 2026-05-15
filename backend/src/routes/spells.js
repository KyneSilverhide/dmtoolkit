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

router.get('/search', authenticateToken, handleSearch)
router.get('/public/search', handleSearch)

module.exports = router
