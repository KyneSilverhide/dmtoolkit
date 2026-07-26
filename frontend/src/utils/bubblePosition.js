// Positionnement d'une bulle flottante (RefLink.vue, HtmlSpanTooltip.vue) relative à
// l'élément survolé : à droite si la place le permet, sinon à gauche, sinon en dessous.
// Extrait de RefLink.vue pour être réutilisé par HtmlSpanTooltip.vue (mentions de sort/état
// dans le HTML pré-rendu des sorts/objets, voir textLinker.js) sans dupliquer la géométrie.
export function computeBubblePosition(rect, width, offset = 10) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const prefersRight = rect.right + offset + width <= vw
  const prefersLeft = rect.left - offset - width >= 0
  const dir = prefersRight ? 'right' : prefersLeft ? 'left' : 'bottom'

  let top, left
  if (dir === 'right') {
    left = rect.right + offset
    top = rect.top + rect.height / 2
  } else if (dir === 'left') {
    left = rect.left - offset - width
    top = rect.top + rect.height / 2
  } else {
    left = Math.max(8, Math.min(vw - width - 8, rect.left + rect.width / 2 - width / 2))
    top = rect.bottom + offset
  }

  if (dir !== 'bottom' && top + 100 > vh) top = vh - 110
  if (top < 8) top = 8

  return { top, left, dir }
}
