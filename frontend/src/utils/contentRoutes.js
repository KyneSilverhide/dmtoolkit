// Les onglets de contenu (Sorts/Objets/Races/Classes/…) sont désormais rendus par les MÊMES
// composants côté MJ (/admin/:tab) et côté joueur (/view/:code/:tab ou /player/:tab, voir
// PlayerInboxView.vue prop `player-mode`) — toute navigation interne (RefLink, boutons "Voir
// les sorts de cette classe"/"Voir la classe", clics délégués sur les spans d'état/sort en
// HTML brut) doit donc résoudre le bon préfixe de route selon le contexte plutôt que de
// coder en dur `/admin/...`.
export function contentBasePath(route) {
  if (route.name === 'player-view') return `/view/${route.params.code}`
  if (route.name === 'player-self') return '/player'
  return '/admin'
}
