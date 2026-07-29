const { createContentRouter } = require('./contentRouterFactory')

function backgroundMatches(background, q) {
  if (background.name.toLowerCase().includes(q)) return true
  if ((background.skill_proficiencies || []).some(s => s.toLowerCase().includes(q))) return true
  if ((background.tool_proficiencies || []).some(t => t.toLowerCase().includes(q))) return true
  if (background.feature?.name.toLowerCase().includes(q) || background.feature?.description.toLowerCase().includes(q)) return true
  if (background.description?.toLowerCase().includes(q)) return true
  return ['personality_traits', 'ideals', 'bonds', 'flaws'].some(key =>
    (background[key] || []).some(entry => entry.toLowerCase().includes(q))
  )
}

const router = createContentRouter({
  jsonFile: 'dnd_backgrounds.json',
  dataKey: 'backgrounds',
  matches: backgroundMatches,
  // /public (sans auth) — utilisé par l'onglet Origines de l'écran joueur.
})

module.exports = router
