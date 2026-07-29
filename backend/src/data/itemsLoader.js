const path = require('path')
const fs = require('fs')

// Source unique de chargement des catalogues d'objets (aidedd_standard_items.json /
// aidedd_magic_items.json), partagée par les routes /api/equipment (vue "Objets") et
// /api/magic-items (vue "Objets magiques" — qui recherche aussi parmi les objets
// standards, cf. getAllItems()) pour éviter que le même JSON soit lu et mis en cache
// deux fois indépendamment.
let standardItemsCache = null
let magicItemsCache = null

function loadJson(filename) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, filename), 'utf8')
    return JSON.parse(raw).items || []
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err)
    return []
  }
}

function getStandardItems() {
  if (!standardItemsCache) standardItemsCache = loadJson('aidedd_standard_items.json')
  return standardItemsCache
}

function getMagicItems() {
  if (!magicItemsCache) magicItemsCache = loadJson('aidedd_magic_items.json')
  return magicItemsCache
}

module.exports = { getStandardItems, getMagicItems }
