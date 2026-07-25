const express = require('express')
const path = require('path')
const fs = require('fs')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Load classes once at startup
let classesCache = null

function getClasses() {
  if (classesCache) return classesCache
  try {
    const filePath = path.join(__dirname, '../data/dnd_classes.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    classesCache = data.classes || []
  } catch (err) {
    console.error('Failed to load classes JSON:', err)
    classesCache = []
  }
  return classesCache
}

// Pre-load on module import
getClasses()

function classMatches(dndClass, q) {
  if (dndClass.name.toLowerCase().includes(q)) return true
  if ((dndClass.primary_ability || '').toLowerCase().includes(q)) return true
  if ((dndClass.features || []).some(f => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))) return true
  return (dndClass.subclasses || []).some(sc =>
    sc.name.toLowerCase().includes(q) ||
    (sc.traits || []).some(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
  )
}

// Si le match provient d'un trait précis (trait de classe ou de sous-classe) plutôt que
// du nom/de la caractéristique clé, on renvoie ce trait pour permettre à l'UI d'afficher
// un aperçu pertinent au lieu du résumé générique de la classe.
function findMatchedTrait(dndClass, q) {
  const feature = (dndClass.features || []).find(f =>
    f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
  )
  if (feature) return { name: feature.name, description: feature.description, source: dndClass.name }

  for (const sc of dndClass.subclasses || []) {
    const trait = (sc.traits || []).find(t =>
      t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    )
    if (trait) return { name: trait.name, description: trait.description, source: `${dndClass.name} · ${sc.name}` }
  }
  return null
}

router.get('/', authenticateToken, (req, res) => {
  res.json(getClasses())
})

// Public (sans auth) — liste allégée nom + sous-classes, utilisée par l'écran de
// connexion joueur (PlayerJoinView) pour peupler les listes déroulantes classe/sous-classe
// sans exposer les descriptions complètes (contenu de référence) à un client non authentifié.
router.get('/public', (req, res) => {
  res.json(getClasses().map(dndClass => ({
    slug: dndClass.slug,
    name: dndClass.name,
    subclasses: (dndClass.subclasses || []).map(sc => ({ name: sc.name })),
  })))
})

router.get('/search', authenticateToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  const classes = getClasses()
  if (!q) return res.json(classes)
  res.json(
    classes
      .filter(dndClass => classMatches(dndClass, q))
      .map(dndClass => {
        const matchedTrait = findMatchedTrait(dndClass, q)
        return matchedTrait ? { ...dndClass, matchedTrait } : dndClass
      })
  )
})

function slugify(str) {
  return str
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Aplatit les features de classe et les traits de sous-classe en une liste unique
// « aptitudes » recherchable (ex: Conduit divin, Paume frémissante), chaque entrée
// pointant vers sa classe d'origine (classSlug) pour un lien retour. Les entrées ayant
// une liste d'options (ex: Métamagie, Invocations occultes, Manoeuvres — voir champ
// `options` sur la feature/trait source) sont elles-mêmes aplaties en sous-entrées
// individuellement recherchables (Métamagie : Sort distant, etc.).
let abilitiesCache = null

function buildAbility({ name, description, level, options }, dndClass, subclass) {
  const id = [dndClass.slug, subclass ? slugify(subclass.name) : null, slugify(name), level]
    .filter(Boolean).join('__')
  return {
    id,
    name,
    description,
    level,
    hasOptions: Array.isArray(options) && options.length > 0,
    optionCount: Array.isArray(options) ? options.length : 0,
    className: dndClass.name,
    classSlug: dndClass.slug,
    classIcon: dndClass.icon,
    classDetailUrl: dndClass.detail_url,
    subclassName: subclass ? subclass.name : null,
    source: dndClass.source,
  }
}

function buildOptionAbilities({ name: parentName, level, options }, dndClass, subclass) {
  if (!Array.isArray(options)) return []
  return options.map(opt => {
    const id = [dndClass.slug, subclass ? slugify(subclass.name) : null, slugify(parentName), slugify(opt.name)]
      .filter(Boolean).join('__')
    return {
      id,
      name: opt.name,
      description: opt.description,
      level,
      hasOptions: false,
      optionCount: 0,
      parentName,
      className: dndClass.name,
      classSlug: dndClass.slug,
      classIcon: dndClass.icon,
      classDetailUrl: dndClass.detail_url,
      subclassName: subclass ? subclass.name : null,
      source: dndClass.source,
    }
  })
}

function getAbilities() {
  if (abilitiesCache) return abilitiesCache
  const abilities = []
  for (const dndClass of getClasses()) {
    for (const feature of dndClass.features || []) {
      abilities.push(buildAbility(feature, dndClass, null))
      abilities.push(...buildOptionAbilities(feature, dndClass, null))
    }
    for (const subclass of dndClass.subclasses || []) {
      for (const trait of subclass.traits || []) {
        abilities.push(buildAbility(trait, dndClass, subclass))
        abilities.push(...buildOptionAbilities(trait, dndClass, subclass))
      }
    }
  }
  abilitiesCache = abilities
  return abilitiesCache
}

function abilityMatches(ability, q) {
  if (ability.name.toLowerCase().includes(q)) return true
  if (ability.description.toLowerCase().includes(q)) return true
  if (ability.className.toLowerCase().includes(q)) return true
  if ((ability.subclassName || '').toLowerCase().includes(q)) return true
  return false
}

router.get('/abilities', authenticateToken, (req, res) => {
  res.json(getAbilities())
})

router.get('/abilities/search', authenticateToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  const abilities = getAbilities()
  if (!q) return res.json(abilities)
  res.json(abilities.filter(ability => abilityMatches(ability, q)))
})

module.exports = router
