import { stripAccents } from './slugify.js'

// Couleur associée à une rareté d'objet D&D 5e (utilisé par les recherches
// d'objets/objets magiques admin et joueur, et par la palette de commande).
// Ordre important : les clés les plus spécifiques d'abord, car le matching se fait par
// includes() et "commun"/"rare" sont des sous-chaînes de "peu commun"/"tres rare".
const RARITY_COLORS = {
  'peu commun': 'var(--rarity-uncommon)',
  'tres rare': 'var(--rarity-epic)',
  'commun': 'var(--color-text-dim)',
  'rare': 'var(--rarity-rare)',
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
