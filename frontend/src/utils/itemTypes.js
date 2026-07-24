// Maps an equipment/magic-item `item_type` string (French, from aidedd_*.json)
// to a category icon + CSS color variable, so the search results can visually
// distinguish weapons, armor, potions, etc. at a glance.
const ITEM_TYPE_CATEGORIES = [
  { test: /arme|munition/i, icon: 'game-icons:crossed-swords', color: 'var(--itemtype-weapon)' },
  { test: /armure|bouclier/i, icon: 'lucide:shield', color: 'var(--itemtype-armor)' },
  { test: /potion|poison/i, icon: 'game-icons:round-bottom-flask', color: 'var(--itemtype-consumable)' },
  { test: /parchemin/i, icon: 'game-icons:quill-ink', color: 'var(--itemtype-scroll)' },
  { test: /outil/i, icon: 'lucide:wrench', color: 'var(--itemtype-tool)' },
  { test: /monture|véhicule/i, icon: 'game-icons:horse-head', color: 'var(--itemtype-mount)' },
  { test: /instrument/i, icon: 'lucide:music', color: 'var(--itemtype-instrument)' },
  { test: /anneau|baguette|bâton|sceptre|objet merveilleux/i, icon: 'game-icons:magic-swirl', color: 'var(--itemtype-wondrous)' },
]

const DEFAULT_ITEM_TYPE_STYLE = { icon: 'lucide:package', color: 'var(--color-text-dim)' }

export function itemTypeStyle(itemType) {
  if (!itemType) return DEFAULT_ITEM_TYPE_STYLE
  const match = ITEM_TYPE_CATEGORIES.find(cat => cat.test.test(itemType))
  return match ? { icon: match.icon, color: match.color } : DEFAULT_ITEM_TYPE_STYLE
}
