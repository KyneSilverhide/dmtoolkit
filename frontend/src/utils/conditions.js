/**
 * Configuration de PRÉSENTATION (icône/couleur) des 15 états D&D côté combat, plus leur `id`
 * (clé de persistance : c'est cette valeur qui est stockée dans players.conditions et
 * échangée via le socket 'update-conditions'/'toggle-condition' — ne jamais la renommer sans
 * migrer les données existantes).
 *
 * Le contenu de règles (nom affiché, description) n'est PAS dupliqué ici : il vient de
 * backend/src/data/dnd_conditions.json via GET /api/conditions/public, seule source de
 * vérité, chargé et fusionné par composables/useConditions.js (clé commune : `slug`).
 * `fallbackLabel` n'est utilisé que tant que ce chargement n'est pas terminé (ou s'il échoue)
 * — jamais affiché si le fetch a réussi, donc ne peut pas dériver silencieusement de la vraie
 * donnée en usage normal.
 */
export const CONDITION_STYLES = [
  { id: 'blinded',      fallbackLabel: 'Aveuglé',     slug: 'aveugle',            icon: 'game-icons:blindfold',        color: 'var(--color-text-dim)' },
  { id: 'charmed',      fallbackLabel: 'Charmé',      slug: 'charme',             icon: 'game-icons:charm',             color: 'var(--cond-charmed)' },
  { id: 'deafened',     fallbackLabel: 'Assourdi',    slug: 'assourdi',          icon: 'game-icons:hearing-disabled',  color: 'var(--color-text-dim)' },
  { id: 'exhaustion',   fallbackLabel: 'Épuisé',      slug: 'epuisement',        icon: 'game-icons:dead-eye',          color: 'var(--cond-exhaustion)' },
  { id: 'frightened',   fallbackLabel: 'Effrayé',     slug: 'effraye',           icon: 'game-icons:screaming',         color: 'var(--cond-frightened)' },
  { id: 'grappled',     fallbackLabel: 'Agrippé',     slug: 'agrippe',           icon: 'game-icons:grab',              color: 'var(--cond-grappled)' },
  { id: 'incapacitated',fallbackLabel: 'Incapacité',  slug: 'incapable-d-agir',  icon: 'game-icons:internal-injury',   color: 'var(--cond-incapacitated)' },
  { id: 'invisible',    fallbackLabel: 'Invisible',   slug: 'invisible',         icon: 'game-icons:invisible',         color: 'var(--cond-invisible)' },
  { id: 'paralyzed',    fallbackLabel: 'Paralysé',    slug: 'paralyse',          icon: 'game-icons:lightning-shout',   color: 'var(--cond-paralyzed)' },
  { id: 'petrified',    fallbackLabel: 'Pétrifié',    slug: 'petrifie',          icon: 'game-icons:stone-pile',        color: 'var(--cond-petrified)' },
  { id: 'poisoned',     fallbackLabel: 'Empoisonné',  slug: 'empoisonne',        icon: 'game-icons:poison-bottle',     color: 'var(--cond-poisoned)' },
  { id: 'prone',        fallbackLabel: 'À terre',     slug: 'a-terre',           icon: 'game-icons:falling',           color: 'var(--cond-grappled)' },
  { id: 'restrained',   fallbackLabel: 'Entravé',     slug: 'entrave',           icon: 'game-icons:handcuffed',        color: 'var(--cond-restrained)' },
  { id: 'stunned',      fallbackLabel: 'Étourdi',     slug: 'etourdi',           icon: 'game-icons:stoned-skull',      color: 'var(--cond-frightened)' },
  { id: 'unconscious',  fallbackLabel: 'Inconscient', slug: 'inconscient',       icon: 'game-icons:sleepy',            color: 'var(--cond-unconscious)' },
]

export const CONDITION_STYLES_MAP = Object.fromEntries(
  CONDITION_STYLES.map(c => [c.id, c])
)

