const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load backgrounds once at startup
let backgroundsCache = null

function getBackgrounds() {
  if (backgroundsCache) return backgroundsCache
  try {
    const filePath = path.join(__dirname, '../data/dnd_backgrounds.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    backgroundsCache = data.backgrounds || []
  } catch (err) {
    console.error('Failed to load backgrounds JSON:', err)
    backgroundsCache = []
  }
  return backgroundsCache
}

// Pre-load on module import
getBackgrounds()

function backgroundMatches(background, q) {
  if (background.name.toLowerCase().includes(q)) return true
  if ((background.skill_proficiencies || []).some(s => s.toLowerCase().includes(q))) return true
  if ((background.tool_proficiencies || []).some(t => t.toLowerCase().includes(q))) return true
  if (background.feature?.name.toLowerCase().includes(q) || background.feature?.description.toLowerCase().includes(q)) return true
  if (background.description?.toLowerCase().includes(q)) return true
  return ['personality_traits', 'ideals', 'bonds', 'flaws'].some(key =>
    (background[key] || []).some(entry => entry.toLowerCase().includes(q))
  )
}

router.get('/', authenticateToken, (req, res) => {
  res.json(getBackgrounds())
})

// Public (sans auth) — utilisé par l'onglet Origines de l'écran joueur.
router.get('/public', (req, res) => {
  res.json(getBackgrounds())
})

router.get('/search', authenticateToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  const backgrounds = getBackgrounds()
  if (!q) return res.json(backgrounds)
  res.json(backgrounds.filter(background => backgroundMatches(background, q)))
})

module.exports = router
