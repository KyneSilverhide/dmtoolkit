const express = require('express')
const { authenticateToken } = require('../middleware/auth')
const { getStandardItems, getMagicItems } = require('../data/itemsLoader')

const router = express.Router()

let allItemsCache = null

function getAllItems() {
  if (allItemsCache) return allItemsCache
  const magic = getMagicItems().map(i => ({ ...i, source_category: 'magic' }))
  const standard = getStandardItems().map(i => ({ ...i, source_category: 'standard' }))
  allItemsCache = [...magic, ...standard]
  return allItemsCache
}

getAllItems()

function handleList(req, res) {
  const all = [...getAllItems()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return res.json(all)
}

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

router.get('/', authenticateToken, handleList)
router.get('/search', authenticateToken, handleSearch)
router.get('/public/search', handleSearch)
// Public (sans auth) — parcours complet sans recherche, utilisé par l'écran joueur qui
// réutilise ItemSearch.vue en mode `player-mode`.
router.get('/public', handleList)

module.exports = router
