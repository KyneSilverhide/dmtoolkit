// Doit rester identique à la fonction slugify() de backend/src/routes/classes.js —
// utilisée côté client pour reconstruire les mêmes id d'aptitude sans appel API
// supplémentaire (voir utils/textLinker.js).
export function slugify(str) {
  return str
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
