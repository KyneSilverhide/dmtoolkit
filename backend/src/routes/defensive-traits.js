const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Résumé des résistances/immunités/sens des joueurs par race et par classe/sous-classe,
// curé manuellement depuis dnd_races.json/dnd_classes.json (voir dnd_defensive_traits.json).
// Volontairement limité aux traits permanents et inconditionnels : tout trait temporaire
// ou activé (« en rage », « pendant 1 minute », choix renouvelé à chaque repos, etc.) est
// exclu, car l'app ne suit pas le niveau des personnages et une extraction par simple
// mot-clé produirait trop de faux positifs (ex: « résistance » mentionnée dans un sort).
// Clé : slug de race (dnd_races.json), ou slug de classe pour un trait de base, ou
// `${classSlug}__${slugify(sousClasseNom)}` pour un trait de sous-classe.
let traitsCache = null

function getDefensiveTraits() {
  if (traitsCache) return traitsCache
  try {
    const filePath = path.join(__dirname, '../data/dnd_defensive_traits.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    traitsCache = JSON.parse(raw)
  } catch (err) {
    console.error('Failed to load defensive traits JSON:', err)
    traitsCache = { races: {}, classes: {} }
  }
  return traitsCache
}

// Pre-load on module import
getDefensiveTraits()

router.get('/', authenticateToken, (req, res) => {
  res.json(getDefensiveTraits())
})

module.exports = router
