const { createContentRouter } = require('./contentRouterFactory')

function raceMatches(race, q) {
  if (race.name.toLowerCase().includes(q)) return true
  if ((race.ability_bonus || '').toLowerCase().includes(q)) return true
  if ((race.traits || []).some(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))) return true
  return (race.subraces || []).some(sr =>
    sr.name.toLowerCase().includes(q) ||
    (sr.traits || []).some(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
  )
}

const router = createContentRouter({
  jsonFile: 'dnd_races.json',
  dataKey: 'races',
  matches: raceMatches,
  // /public — liste allégée nom uniquement, utilisée par l'écran de connexion joueur
  // (PlayerJoinView) pour peupler la liste déroulante race sans exposer les descriptions
  // complètes (contenu de référence) à un client non authentifié.
  publicProjection: races => races.map(race => ({ slug: race.slug, name: race.name })),
  // /public/full — fiches complètes, utilisées par l'onglet Races de l'écran joueur
  // (parité de contenu avec le MJ, masqué en mode démo côté client). Contenu de règles
  // générique, non sensible — même raisonnement que GET /api/conditions/public.
  withPublicFull: true,
})

module.exports = router
