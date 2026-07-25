const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load services once at startup
let servicesCache = null

function getServices() {
  if (servicesCache) return servicesCache
  try {
    const filePath = path.join(__dirname, '../data/dnd_services.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    servicesCache = data.services || []
  } catch (err) {
    console.error('Failed to load services JSON:', err)
    servicesCache = []
  }
  return servicesCache
}

// Pre-load on module import
getServices()

function serviceMatches(service, q) {
  if (service.name.toLowerCase().includes(q)) return true
  if ((service.price || '').toLowerCase().includes(q)) return true
  return (service.description || '').toLowerCase().includes(q)
}

router.get('/', authenticateToken, (req, res) => {
  res.json(getServices())
})

router.get('/search', authenticateToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  const services = getServices()
  if (!q) return res.json(services)
  res.json(services.filter(service => serviceMatches(service, q)))
})

module.exports = router
