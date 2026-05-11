const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load magic items once at startup
let itemsCache = null

function getMagicItems() {
  if (itemsCache) return itemsCache
  try {
    const filePath = path.join(__dirname, '../data/aidedd_magic_items.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    itemsCache = (data.items || [])
  } catch (err) {
    console.error('Failed to load magic items JSON:', err)
    itemsCache = []
  }
  return itemsCache
}

// Pre-load on module import
getMagicItems()

function handleSearch(req, res) {
  const q = (req.query.q || '').trim().toLowerCase()
  if (!q) return res.json([])

  const items = getMagicItems()
  const results = items.filter(item => {
    if (item.name && item.name.toLowerCase().includes(q)) return true
    if (item.description && item.description.toLowerCase().includes(q)) return true
    if (item.item_type && item.item_type.toLowerCase().includes(q)) return true
    if (item.rarity && item.rarity.toLowerCase().includes(q)) return true
    if (item.name_vo && item.name_vo.toLowerCase().includes(q)) return true
    return false
  })

  return res.json(results.slice(0, 50))
}

router.get('/search', authenticateToken, handleSearch)
router.get('/public/search', handleSearch)

module.exports = router
