import { stripAccents } from './slugify.js'

// Couleur associée à une rareté d'objet D&D 5e (utilisé par les recherches
// d'objets/objets magiques admin et joueur, et par la palette de commande).
const RARITY_COLORS = {
  'commun': 'var(--color-text-dim)',
  'peu commun': 'var(--rarity-uncommon)',
  'rare': 'var(--rarity-rare)',
  'tres rare': 'var(--rarity-epic)',
  'legendaire': 'var(--rarity-legendary)',
  'artefact': 'var(--rarity-artifact)',
}

export function rarityColor(rarity) {
  if (!rarity) return 'var(--color-text-dim)'
  const key = stripAccents(rarity.toLowerCase())
  for (const [k, v] of Object.entries(RARITY_COLORS)) {
    if (key.includes(k)) return v
  }
  return 'var(--color-text-dim)'
}
