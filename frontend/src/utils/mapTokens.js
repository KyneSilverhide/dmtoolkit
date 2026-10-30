// Jeton « groupe » de la carte : une entrée de map_tokens sous une clé réservée. Les pions joueurs
// et le jeton groupe coexistent dans map_tokens ; seul l'affichage choisit lesquels montrer, pour
// que basculer l'option ne perde aucune position.
export const GROUP_TOKEN_ID = 'group'
export const GROUP_TOKEN_NAME = 'Groupe'

function isPlayerToken(id) {
  return id !== GROUP_TOKEN_ID && !id.startsWith('custom_')
}

export function visibleTokens(tokens, groupMode) {
  const out = {}
  for (const [id, token] of Object.entries(tokens || {})) {
    const hidden = groupMode ? isPlayerToken(id) : id === GROUP_TOKEN_ID
    if (!hidden) out[id] = token
  }
  return out
}

// Centre des pions joueurs placés, ou null s'il n'y en a aucun.
export function centerOfPlayerTokens(tokens) {
  const players = Object.entries(tokens || {}).filter(([id]) => isPlayerToken(id)).map(([, t]) => t)
  if (players.length === 0) return null
  return {
    nx: players.reduce((sum, t) => sum + t.nx, 0) / players.length,
    ny: players.reduce((sum, t) => sum + t.ny, 0) / players.length,
  }
}
