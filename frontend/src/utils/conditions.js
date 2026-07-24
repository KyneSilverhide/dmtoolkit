/**
 * Shared D&D 5e conditions definition.
 * icon: iconify icon name (game-icons set for fantasy, lucide for UI fallback)
 * color: optional CSS color for the icon
 */
export const DND_CONDITIONS = [
  { id: 'blinded',      label: 'Aveuglé',     icon: 'game-icons:blindfold',        color: 'var(--color-text-dim)' },
  { id: 'charmed',      label: 'Charmé',      icon: 'game-icons:charm',             color: 'var(--cond-charmed)' },
  { id: 'deafened',     label: 'Assourdi',    icon: 'game-icons:hearing-disabled',  color: 'var(--color-text-dim)' },
  { id: 'exhaustion',   label: 'Épuisé',      icon: 'game-icons:dead-eye',          color: 'var(--cond-exhaustion)' },
  { id: 'frightened',   label: 'Effrayé',     icon: 'game-icons:screaming',         color: 'var(--cond-frightened)' },
  { id: 'grappled',     label: 'Agrippé',     icon: 'game-icons:grab',              color: 'var(--cond-grappled)' },
  { id: 'incapacitated',label: 'Incapacité',  icon: 'game-icons:internal-injury',   color: 'var(--cond-incapacitated)' },
  { id: 'invisible',    label: 'Invisible',   icon: 'game-icons:invisible',         color: 'var(--cond-invisible)' },
  { id: 'paralyzed',    label: 'Paralysé',    icon: 'game-icons:lightning-shout',   color: 'var(--cond-paralyzed)' },
  { id: 'petrified',    label: 'Pétrifié',    icon: 'game-icons:stone-pile',        color: 'var(--cond-petrified)' },
  { id: 'poisoned',     label: 'Empoisonné',  icon: 'game-icons:poison-bottle',     color: 'var(--cond-poisoned)' },
  { id: 'prone',        label: 'À terre',     icon: 'game-icons:falling',           color: 'var(--cond-grappled)' },
  { id: 'restrained',   label: 'Entravé',     icon: 'game-icons:handcuffed',        color: 'var(--cond-restrained)' },
  { id: 'stunned',      label: 'Étourdi',     icon: 'game-icons:stoned-skull',      color: 'var(--cond-frightened)' },
  { id: 'unconscious',  label: 'Inconscient', icon: 'game-icons:sleepy',            color: 'var(--cond-unconscious)' },
]

export const DND_CONDITIONS_MAP = Object.fromEntries(
  DND_CONDITIONS.map(c => [c.id, c])
)

