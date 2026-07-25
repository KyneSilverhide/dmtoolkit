import { slugify } from './slugify.js'

// Combine les traits défensifs permanents (résistances/immunités/sens/avantages) d'un
// joueur à partir de sa race, sa classe et sa sous-classe. Les données viennent de
// GET /api/defensive-traits (voir backend/src/routes/defensive-traits.js pour la
// méthodologie de curation — traits permanents/inconditionnels uniquement). Une race,
// classe ou sous-classe personnalisée (texte libre, absente de la base) ne matche
// simplement aucune entrée et n'ajoute rien au résumé.
export function getDefensiveSummary(traitsData, { race, dndClass, subclass }) {
  if (!traitsData) return null
  const parts = []
  if (race) {
    const entry = traitsData.races?.[slugify(race)]
    if (entry) parts.push(entry)
  }
  if (dndClass) {
    const classSlug = slugify(dndClass)
    const baseEntry = traitsData.classes?.[classSlug]
    if (baseEntry) parts.push(baseEntry)
    if (subclass) {
      const subEntry = traitsData.classes?.[`${classSlug}__${slugify(subclass)}`]
      if (subEntry) parts.push(subEntry)
    }
  }
  if (parts.length === 0) return null

  const merge = (key) => [...new Set(parts.flatMap(p => p[key] || []))]
  const summary = {
    resistances: merge('resistances'),
    immunities: merge('immunities'),
    senses: merge('senses'),
    advantages: merge('advantages'),
    other: merge('other'),
  }
  const isEmpty = Object.values(summary).every(arr => arr.length === 0)
  return isEmpty ? null : summary
}
