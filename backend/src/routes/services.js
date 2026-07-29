const { createContentRouter } = require('./contentRouterFactory')

function serviceMatches(service, q) {
  if (service.name.toLowerCase().includes(q)) return true
  if ((service.price || '').toLowerCase().includes(q)) return true
  return (service.description || '').toLowerCase().includes(q)
}

const router = createContentRouter({
  jsonFile: 'dnd_services.json',
  dataKey: 'services',
  matches: serviceMatches,
  // /public (sans auth) — utilisé par l'onglet Services de l'écran joueur.
})

module.exports = router
