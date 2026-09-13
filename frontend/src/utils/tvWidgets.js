// Registre des widgets « Rythme » composables dans la vue dynamique de la TV (tv_mode
// = 'dashboard'). Deux familles :
// - widgets statiques (TV_WIDGETS) : un par session, valeur de `widgetType` fixe (ex.
//   'timer'). Ajouter un widget statique = une entrée ici + DASHBOARD_WIDGET_TYPES
//   (backend/src/socket.js) + une branche de rendu dans TvDashboard.vue.
// - jauges (dashboard_gauges) : multi-instance — une session peut avoir plusieurs
//   jauges nommées (ex. « Peur » et « Vagues du siège » simultanément), gérées dans
//   TvControls.vue et référencées dans un slot via `widgetType: 'gauge:<id>'`. Pas dans
//   TV_WIDGETS : la liste des jauges disponibles est dynamique, pas un catalogue fixe.
export const TV_WIDGETS = [
  { key: 'timer', label: 'Minuteur libre' },
]

// Layouts disponibles pour la vue dynamique — mirrors DASHBOARD_LAYOUT_SLOTS côté
// backend (backend/src/socket.js), qui valide indépendamment les clés de cellule reçues.
export const DASHBOARD_LAYOUTS = [
  { key: '2-col', label: '2 colonnes', slots: ['col-1', 'col-2'] },
  { key: '3-col', label: '3 colonnes', slots: ['col-1', 'col-2', 'col-3'] },
  { key: '2-row', label: '2 lignes (haut/bas)', slots: ['row-1', 'row-2'] },
  { key: '4-corners', label: '4 coins', slots: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] },
]

export const DASHBOARD_SLOT_LABELS = {
  'col-1': 'Colonne 1',
  'col-2': 'Colonne 2',
  'col-3': 'Colonne 3',
  'row-1': 'Ligne haute',
  'row-2': 'Ligne basse',
  'top-left': 'Coin haut-gauche',
  'top-right': 'Coin haut-droit',
  'bottom-left': 'Coin bas-gauche',
  'bottom-right': 'Coin bas-droit',
}

export function gaugeWidgetType(gaugeId) {
  return `gauge:${gaugeId}`
}

export function gaugeIdFromWidgetType(widgetType) {
  const match = /^gauge:(\d+)$/.exec(widgetType || '')
  return match ? parseInt(match[1], 10) : null
}
