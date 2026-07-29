const express = require('express')
const { authenticateToken } = require('../middleware/auth')
const { getStandardItems } = require('../data/itemsLoader')

const router = express.Router()

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

