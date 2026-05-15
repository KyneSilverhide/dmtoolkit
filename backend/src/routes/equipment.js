const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load standard items once at startup
let itemsCache = null

function getStandardItems() {
  if (itemsCache) return itemsCache
  try {
    const filePath = path.join(__dirname, '../data/aidedd_standard_items.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    itemsCache = (data.items || [])
  } catch (err) {
    console.error('Failed to load standard items JSON:', err)
    itemsCache = []
  }
  return itemsCache
}

// Pre-load on module import
getStandardItems()

function handleSearch(req, res) {
  const q = (req.query.q || '').trim().toLowerCase()
  const category = (req.query.category || '').trim().toLowerCase()

  if (!q && !category) return res.json([])

  const items = getStandardItems()
  const results = items.filter(item => {
    // Category filter (exact or partial match on item_type)
    if (category && !(item.item_type || '').toLowerCase().includes(category)) return false

    // Text search across multiple fields
    if (q) {
      if (item.name && item.name.toLowerCase().includes(q)) return true
      if (item.description && item.description.toLowerCase().includes(q)) return true
      if (item.item_type && item.item_type.toLowerCase().includes(q)) return true
      if (item.name_vo && item.name_vo.toLowerCase().includes(q)) return true
      return false
    }
    return true
  })

  return res.json(results.slice(0, 50))
}

function handleCategories(req, res) {
  const items = getStandardItems()
  const cats = [...new Set(items.map(i => i.item_type).filter(Boolean))].sort()
  return res.json(cats)
}

// Authenticated routes (players & admin)
router.get('/search', authenticateToken, handleSearch)
router.get('/categories', authenticateToken, handleCategories)

// Public routes (merchant display, Obsidian plugin, etc.)
router.get('/public/search', handleSearch)
router.get('/public/categories', handleCategories)

module.exports = router

