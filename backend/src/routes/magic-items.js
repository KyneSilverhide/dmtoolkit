const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

let allItemsCache = null

function loadJson(filename) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../data', filename), 'utf8')
    return JSON.parse(raw).items || []
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err)
    return []
  }
}

function getAllItems() {
  if (allItemsCache) return allItemsCache
  const magic = loadJson('aidedd_magic_items.json').map(i => ({ ...i, source_category: 'magic' }))
  const standard = loadJson('aidedd_standard_items.json').map(i => ({ ...i, source_category: 'standard' }))
  allItemsCache = [...magic, ...standard]
  return allItemsCache
}

getAllItems()

function handleSearch(req, res) {
  const q = (req.query.q || '').trim().toLowerCase()
  if (!q) return res.json([])

  const nameMatches = []
  const otherMatches = []

  for (const item of getAllItems()) {
    const nameMatch = (item.name && item.name.toLowerCase().includes(q)) ||
                      (item.name_vo && item.name_vo.toLowerCase().includes(q))
    if (nameMatch) {
      nameMatches.push(item)
    } else if (
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.item_type && item.item_type.toLowerCase().includes(q)) ||
      (item.rarity && item.rarity.toLowerCase().includes(q))
    ) {
      otherMatches.push(item)
    }
  }

  nameMatches.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  otherMatches.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return res.json([...nameMatches, ...otherMatches].slice(0, 80))
}

router.get('/search', authenticateToken, handleSearch)
router.get('/public/search', handleSearch)

module.exports = router
