const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load races once at startup
let racesCache = null

function getRaces() {
  if (racesCache) return racesCache
  try {
    const filePath = path.join(__dirname, '../data/dnd_races.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    racesCache = data.races || []
  } catch (err) {
    console.error('Failed to load races JSON:', err)
    racesCache = []
  }
  return racesCache
}

// Pre-load on module import
getRaces()

function raceMatches(race, q) {
  if (race.name.toLowerCase().includes(q)) return true
  if ((race.ability_bonus || '').toLowerCase().includes(q)) return true
  if ((race.traits || []).some(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))) return true
  return (race.subraces || []).some(sr =>
    sr.name.toLowerCase().includes(q) ||
    (sr.traits || []).some(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
  )
}

router.get('/', authenticateToken, (req, res) => {
  res.json(getRaces())
})

router.get('/search', authenticateToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  const races = getRaces()
  if (!q) return res.json(races)
  res.json(races.filter(race => raceMatches(race, q)))
})

module.exports = router
