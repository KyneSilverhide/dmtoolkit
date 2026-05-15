/**
 * Shared D&D 5e conditions definition.
 * icon: iconify icon name (game-icons set for fantasy, lucide for UI fallback)
 * color: optional CSS color for the icon
 */
export const DND_CONDITIONS = [
  { id: 'blinded',      label: 'Aveuglé',     icon: 'game-icons:blind-fold',       color: 'var(--color-text-dim)' },
  { id: 'charmed',      label: 'Charmé',      icon: 'game-icons:charm',             color: '#e879a8' },
  { id: 'deafened',     label: 'Assourdi',    icon: 'game-icons:ear-plug',          color: 'var(--color-text-dim)' },
  { id: 'exhaustion',   label: 'Épuisé',      icon: 'game-icons:dead-eye',          color: '#a0a0b0' },
  { id: 'frightened',   label: 'Effrayé',     icon: 'game-icons:screaming',         color: '#d4a840' },
  { id: 'grappled',     label: 'Agrippé',     icon: 'game-icons:grab',              color: '#c08040' },
  { id: 'incapacitated',label: 'Incapacité',  icon: 'game-icons:internal-injury',   color: '#e05050' },
  { id: 'invisible',    label: 'Invisible',   icon: 'game-icons:invisible',         color: '#80b0d0' },
  { id: 'paralyzed',    label: 'Paralysé',    icon: 'game-icons:lightning-shout',   color: '#b070e0' },
  { id: 'petrified',    label: 'Pétrifié',    icon: 'game-icons:stone-pile',        color: '#808090' },
  { id: 'poisoned',     label: 'Empoisonné',  icon: 'game-icons:poison-bottle',     color: '#60c060' },
  { id: 'prone',        label: 'À terre',     icon: 'game-icons:falling',           color: '#c08040' },
  { id: 'restrained',   label: 'Entravé',     icon: 'game-icons:shackles',          color: '#909090' },
  { id: 'stunned',      label: 'Étourdi',     icon: 'game-icons:stoned-skull',      color: '#d4a840' },
  { id: 'unconscious',  label: 'Inconscient', icon: 'game-icons:sleepy',            color: '#6080a0' },
]

export const DND_CONDITIONS_MAP = Object.fromEntries(
  DND_CONDITIONS.map(c => [c.id, c])
)

