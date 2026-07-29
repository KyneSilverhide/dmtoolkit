// Classe de santé d'un pourcentage de PV (seuils 50%/20%, partagés par TvCombat.vue,
// PlayerList.vue et PlayerInboxView.vue). Chaque appelant reste responsable de son
// propre calcul de `hpPercent` (leur gestion de current_hp null/au-delà de max_hp diverge
// légèrement) et du mapping tier -> couleur (tokens --tv-*/--admin-*/--player-* propres à
// chaque famille de vue) : seul le seuil est mutualisé ici.
export function hpTier(percent) {
  if (percent > 50) return 'healthy'
  if (percent > 20) return 'warning'
  return 'critical'
}
