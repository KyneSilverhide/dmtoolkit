// Prix d'un article de marchand : en po (`price`) ou en troc (`price_mode = 'troc'`, texte libre
// dans `price_text`, `price` à 0). Un troc ne se négocie pas (pas de ristourne ni d'augmentation,
// refusées aussi côté serveur). Mêmes champs sur un article et sur une ligne de demande d'achat.

export function isTroc(entry) {
  return entry?.price_mode === 'troc'
}

// Prix unitaire d'un article : « 12 po » ou le texte du troc.
export function formatItemPrice(item) {
  if (isTroc(item)) return item.price_text || 'Troc'
  return `${item?.price ?? 0} po`
}

// Prix d'une ligne de demande (quantité déjà appliquée à `total_price`). Un troc garde son texte :
// c'est au MJ de l'interpréter selon la quantité.
export function formatLinePrice(line) {
  if (isTroc(line)) return line.price_text || 'Troc'
  return `${line?.total_price ?? 0} po`
}

// Total d'un panier ou d'une demande : la part en po, suivie de « troc » si une ligne en est un.
export function formatTotalPrice(goldTotal, hasTroc) {
  if (!hasTroc) return `${goldTotal} po`
  return goldTotal > 0 ? `${goldTotal} po + troc` : 'Troc'
}
