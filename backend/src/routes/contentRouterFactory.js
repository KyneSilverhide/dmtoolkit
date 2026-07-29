const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

// Fabrique un routeur Express pour un contenu de référence statique servi depuis
// backend/src/data/ (races, classes, origines, conditions, services...), suivant le
// pattern commun : cache en mémoire chargé au démarrage + GET / (auth) + GET /public
// [+ GET /public/full] + GET /search?q=. Chaque route de contenu garde son comportement
// propre via les options ci-dessous (aucun comportement n'est changé par cette factory,
// seul le code dupliqué est mutualisé) :
//  - jsonFile/dataKey : fichier JSON et clé racine à charger (ignorés si `loadItems` fourni)
//  - loadItems() : source alternative des items (ex: contenu dérivé d'un autre cache)
//  - matches(item, q) : prédicat de filtre pour /search
//  - publicProjection(items) : forme renvoyée par /public (par défaut : items complets)
//  - withPublicFull : ajoute /public/full renvoyant les fiches complètes
//  - searchTransform(item, q) : mappe chaque item filtré avant de le renvoyer sur /search
function createContentRouter({
  jsonFile,
  dataKey,
  loadItems,
  matches,
  publicProjection = null,
  withPublicFull = false,
  searchTransform = null,
}) {
  const router = express.Router()
  let cache = null

  function getItems() {
    if (cache) return cache
    if (loadItems) {
      cache = loadItems()
      return cache
    }
    try {
      const filePath = path.join(__dirname, '..', 'data', jsonFile)
      const raw = fs.readFileSync(filePath, 'utf8')
      const data = JSON.parse(raw)
      cache = data[dataKey] || []
    } catch (err) {
      console.error(`Failed to load ${jsonFile}:`, err)
      cache = []
    }
    return cache
  }

  // Pre-load on module import
  getItems()

  router.get('/', authenticateToken, (req, res) => {
    res.json(getItems())
  })

  router.get('/public', (req, res) => {
    const items = getItems()
    res.json(publicProjection ? publicProjection(items) : items)
  })

  if (withPublicFull) {
    router.get('/public/full', (req, res) => {
      res.json(getItems())
    })
  }

  router.get('/search', authenticateToken, (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase()
    const items = getItems()
    if (!q) return res.json(items)
    const filtered = items.filter(item => matches(item, q))
    res.json(searchTransform ? filtered.map(item => searchTransform(item, q)) : filtered)
  })

  router.getItems = getItems
  return router
}

module.exports = { createContentRouter }
