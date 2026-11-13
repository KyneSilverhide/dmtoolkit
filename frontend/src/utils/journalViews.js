// Vues du journal de session : chaque type d'événement (colonne `event_type`) appartient à une
// catégorie, et une vue est l'ensemble des catégories qu'elle affiche. Un type inconnu n'est
// visible que dans la vue « Tout » : une nouvelle journalisation côté serveur n'est jamais perdue,
// il suffit de la classer ici pour qu'elle apparaisse aussi dans la vue qui lui correspond.

export const EVENT_CATEGORIES = {
  join: 'table',
  leave: 'table',
  vote_started: 'table',
  vote_closed: 'table',
  damage: 'combat',
  heal: 'combat',
  death: 'combat',
  critical_hit: 'combat',
  critical_miss: 'combat',
  combat_round: 'combat',
  hexcrawl_started: 'exploration',
  hexcrawl_step: 'exploration',
  timescale_started: 'exploration',
  timescale_advanced: 'exploration',
  timescale_rest: 'exploration',
  timescale_ended: 'exploration',
  purchase_accepted: 'marchands',
  purchase_rejected: 'marchands',
  doom_clock_started: 'rythme',
  doom_clock_stopped: 'rythme',
  tension_started: 'rythme',
  tension_updated: 'rythme',
  tension_ended: 'rythme',
  gauge_fullscreen: 'rythme',
  gauge_fullscreen_hidden: 'rythme',
  dashboard_updated: 'rythme',
  dashboard_ended: 'rythme',
  dashboard_gauge_created: 'rythme',
  dashboard_gauge_deleted: 'rythme',
}

// `categories: null` = aucune restriction (vue exhaustive).
export const JOURNAL_VIEWS = [
  { key: 'all', label: 'Tout', categories: null },
  { key: 'combat', label: 'Combat', categories: ['combat'] },
  { key: 'exploration', label: 'Exploration', categories: ['exploration'] },
  { key: 'marchands', label: 'Marchands', categories: ['marchands'] },
  { key: 'table', label: 'Table', categories: ['table'] },
  { key: 'rythme', label: 'Rythme', categories: ['rythme'] },
]

export function eventTypeOf(evt) {
  return evt?.eventType || evt?.event_type
}

export function eventCategory(evt) {
  return EVENT_CATEGORIES[eventTypeOf(evt)] || null
}

export function eventInView(evt, viewKey) {
  const view = JOURNAL_VIEWS.find(v => v.key === viewKey)
  if (!view || !view.categories) return true
  const cat = eventCategory(evt)
  return cat !== null && view.categories.includes(cat)
}

export function filterByView(events, viewKey) {
  return events.filter(e => eventInView(e, viewKey))
}

export function countByView(events) {
  const counts = {}
  for (const v of JOURNAL_VIEWS) counts[v.key] = filterByView(events, v.key).length
  return counts
}
