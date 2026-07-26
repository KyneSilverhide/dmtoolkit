const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load conditions once at startup
let conditionsCache = null

function getConditions() {
  if (conditionsCache) return conditionsCache
  try {
    const filePath = path.join(__dirname, '../data/dnd_conditions.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    conditionsCache = data.conditions || []
  } catch (err) {
    console.error('Failed to load conditions JSON:', err)
    conditionsCache = []
  }
  return conditionsCache
}

// Pre-load on module import
getConditions()

function conditionMatches(condition, q) {
  if (condition.name.toLowerCase().includes(q)) return true
  if ((condition.name_vo || '').toLowerCase().includes(q)) return true
  if ((condition.aliases || []).some(a => a.toLowerCase().includes(q))) return true
  return (condition.description || '').toLowerCase().includes(q)
}

router.get('/', authenticateToken, (req, res) => {
  res.json(getConditions())
})

// Public (sans auth) : contenu de règles générique, non sensible (déjà dupliqué en clair
// dans le bundle frontend via utils/glossary.js) — utilisé par l'écran TV (spectateur) et
// l'écran joueur, qui n'ont pas de token JWT admin. Champs complets (contrairement aux
// endpoints /public de races/classes qui tronquent la description) : rien à cacher ici.
router.get('/public', (req, res) => {
  res.json(getConditions())
})

router.get('/search', authenticateToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  const conditions = getConditions()
  if (!q) return res.json(conditions)
  res.json(conditions.filter(condition => conditionMatches(condition, q)))
})

module.exports = router
