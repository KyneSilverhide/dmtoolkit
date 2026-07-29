const { createContentRouter } = require('./contentRouterFactory')

function conditionMatches(condition, q) {
  if (condition.name.toLowerCase().includes(q)) return true
  if ((condition.name_vo || '').toLowerCase().includes(q)) return true
  if ((condition.aliases || []).some(a => a.toLowerCase().includes(q))) return true
  return (condition.description || '').toLowerCase().includes(q)
}

const router = createContentRouter({
  jsonFile: 'dnd_conditions.json',
  dataKey: 'conditions',
  matches: conditionMatches,
  // /public (sans auth) : contenu de règles générique, non sensible (déjà dupliqué en clair
  // dans le bundle frontend via utils/glossary.js) — utilisé par l'écran TV (spectateur) et
  // l'écran joueur, qui n'ont pas de token JWT admin. Champs complets (contrairement aux
  // endpoints /public de races/classes qui tronquent la description) : rien à cacher ici.
})

module.exports = router
