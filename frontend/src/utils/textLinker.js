// Détecte, dans un texte de description (trait de classe, sort, etc.), les mentions de
// sorts et d'aptitudes connus pour les transformer en segments cliquables (voir
// components/RefLink.vue et LinkedText.vue). Matching insensible à la casse, sur mots
// entiers (bornes = caractère non-lettre), plus longue correspondance en premier pour ne
// pas couper un nom de sort à cheval sur un autre.
import { RULE_TERMS, CONCEPT_TERMS, CONDITION_TERMS } from './glossary.js'

const LETTER_RE = /[a-zA-ZÀ-ÿ]/

function isBoundary(str, idx) {
  if (idx < 0 || idx >= str.length) return true
  return !LETTER_RE.test(str[idx])
}

const MIN_CANDIDATE_LENGTH = 4

// Un nom de sort d'un seul mot (ex: "Résistance", "Lumière", "Bouclier", "Saut") est très
// souvent aussi un mot du vocabulaire courant des règles (résistance aux dégâts, bouclier
// porté, etc.) — le lier systématiquement produit surtout de faux positifs (mesuré : ~260
// occurrences fausses sur ~270 dans dnd_classes.json). On ne lie donc un candidat "sort"
// sans espace que dans un contexte qui ressemble vraiment à une liste/mention de sort :
// nom du trait contenant "sort(s)" (voir SPELL_LIST_NAME_RE, passé par l'appelant via
// spellListContext), ou verbe d'incantation juste avant (lance/apprend/connaît...).
const SPACELESS_TRIGGER_RE = /\b(lance|lancer|lançant|lancée?s?|apprend(?:re|ent)?|connaît|connait|maîtrise[sz]?)\s+$/i
export const SPELL_LIST_NAME_RE = /sorts?\b|sortilège/i

/**
 * @param {Array<{type: string, name: string, payload: any}>} entries
 * @returns {Array<{type: string, lower: string, len: number, payload: any, spaceless: boolean}>} trié par longueur décroissante
 */
export function buildCandidates(entries) {
  const seen = new Set()
  const candidates = []
  for (const { type, name, payload } of entries) {
    if (!name || name.length < MIN_CANDIDATE_LENGTH) continue
    const lower = name.toLowerCase()
    const key = `${type}:${lower}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ type, lower, len: lower.length, payload, spaceless: !/[ \-/]/.test(lower) })
  }
  candidates.sort((a, b) => b.len - a.len)
  return candidates
}

/**
 * Segmente `text` en alternant texte brut et correspondances connues.
 * @param {string} text
 * @param {Array} candidates - voir buildCandidates()
 * @param {string|null} excludeId - id d'aptitude à ne jamais lier (évite l'auto-référence)
 * @param {boolean} spellListContext - true si le texte appartient à un trait dont le nom
 *   évoque une liste de sorts (voir SPELL_LIST_NAME_RE) — assouplit le filtre anti-faux-positif
 *   ci-dessus pour les candidats "sort" sans espace.
 * @returns {Array<{type: 'text'|string, value: string, payload?: any}>}
 */
export function linkify(text, candidates, excludeId = null, spellListContext = false) {
  if (!text || candidates.length === 0) return [{ type: 'text', value: text || '' }]

  const lower = text.toLowerCase()
  const consumed = new Array(text.length).fill(false)
  const matches = []

  for (const c of candidates) {
    if (excludeId && c.payload && c.payload.id === excludeId) continue
    let fromIdx = 0
    let idx
    while ((idx = lower.indexOf(c.lower, fromIdx)) !== -1) {
      const end = idx + c.lower.length
      fromIdx = idx + 1
      let blocked = false
      for (let i = idx; i < end; i++) { if (consumed[i]) { blocked = true; break } }
      if (blocked) continue
      if (!isBoundary(text, idx - 1) || !isBoundary(text, end)) continue
      if (c.type === 'spell' && c.spaceless && !spellListContext) {
        const before = text.slice(Math.max(0, idx - 20), idx)
        if (!SPACELESS_TRIGGER_RE.test(before)) continue
      }
      matches.push({ start: idx, end, type: c.type, payload: c.payload })
      for (let i = idx; i < end; i++) consumed[i] = true
    }
  }

  if (matches.length === 0) return [{ type: 'text', value: text }]

  matches.sort((a, b) => a.start - b.start)

  const segments = []
  let cursor = 0
  for (const m of matches) {
    if (m.start > cursor) segments.push({ type: 'text', value: text.slice(cursor, m.start) })
    segments.push({ type: m.type, value: text.slice(m.start, m.end), payload: m.payload })
    cursor = m.end
  }
  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) })
  return segments
}

// --- Construction des dictionnaires de candidats ---

export function spellCandidates(spells) {
  return buildCandidates(
    (spells || []).map(s => ({ type: 'spell', name: s.name, payload: s }))
  )
}

// Objets d'équipement standard (armes, armures, outils, sacs...) mentionnés dans
// l'équipement de départ des classes/origines, ou dans une description de trait.
// En plus du nom exact, on enregistre deux alias par objet pour coller au phrasé libre des
// textes d'équipement de départ (qui ne reprennent jamais le nom exact de la base) :
// - le nom sans son suffixe parenthétique de variante (ex: "Symbole sacré (argent)" ->
//   "Symbole sacré"), pour lier une mention générique à une variante concrète ;
// - le pluriel simple en +s du nom (nu de parenthèse) quand il ne se termine pas déjà par
//   "s", pour lier "deux dagues"/"quatre javelines" au singulier de la base (le français
//   pluralise presque toujours par +s ; un alias grammaticalement approximatif sur les noms
//   composés — ex: "Symbole sacrés" — est inoffensif, il ne sert qu'à la détection).
export function itemCandidates(items) {
  const entries = []
  for (const i of items || []) {
    if (!i.name) continue
    entries.push({ type: 'item', name: i.name, payload: i })
    const stripped = i.name.replace(/\s*\([^)]*\)\s*$/, '').trim()
    if (stripped && stripped !== i.name) {
      entries.push({ type: 'item', name: stripped, payload: i })
    }
    const base = stripped || i.name
    if (!/s$/i.test(base)) {
      entries.push({ type: 'item', name: base + 's', payload: i })
    }
  }
  return buildCandidates(entries)
}

// --- Glossaire de règles (voir utils/glossary.js) ---

export function glossaryCandidates(terms) {
  return buildCandidates((terms || []).map(t => ({ type: 'glossary', name: t.name, payload: t })))
}

export function conceptCandidates(names) {
  return buildCandidates((names || []).map(name => ({ type: 'concept', name, payload: { name } })))
}

// États D&D (voir utils/glossary.js CONDITION_TERMS) — NAVIGABLES (type 'condition', comme
// 'item'), contrairement à glossaryCandidates()/conceptCandidates(). Chaque alias d'accord
// (genre/nombre, ex: "Aveuglée"/"Aveuglés") est enregistré comme candidat séparé mais
// partage le payload canonique (nom/slug/description) de l'état, pour que le lien navigue
// toujours vers la bonne fiche quelle que soit la forme rencontrée dans le texte.
export function conditionCandidates(terms) {
  const entries = []
  for (const t of terms || []) {
    entries.push({ type: 'condition', name: t.name, payload: t })
    for (const alias of t.aliases || []) {
      entries.push({ type: 'condition', name: alias, payload: t })
    }
  }
  return buildCandidates(entries)
}

const GLOSSARY_CANDIDATES = glossaryCandidates(RULE_TERMS)
const CONCEPT_CANDIDATES = conceptCandidates(CONCEPT_TERMS)
const CONDITION_CANDIDATES = conditionCandidates(CONDITION_TERMS)
const GLOSSARY_AND_CONCEPT_CANDIDATES = [...GLOSSARY_CANDIDATES, ...CONCEPT_CANDIDATES, ...CONDITION_CANDIDATES].sort((a, b) => b.len - a.len)

// Fusionne des candidats "sort"/"aptitude" existants avec le glossaire de règles, les
// concepts sans règle propre, et les états D&D. Re-trie par longueur décroissante : la
// concaténation de deux listes déjà triées séparément (voir buildCandidates) ne l'est plus
// globalement, et linkify() dépend de cet ordre pour faire gagner la correspondance la plus
// longue en cas de chevauchement.
export function withGlossary(candidates) {
  return [...candidates, ...GLOSSARY_AND_CONCEPT_CANDIDATES].sort((a, b) => b.len - a.len)
}

function escapeAttr(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Surligne le glossaire de règles + les concepts + les états dans un texte déjà au format
// HTML (ex: description_html des sorts/objets, qui peut contenir des balises simples comme
// <strong> ou complexes comme <table>/<svg>). On alterne balises et texte via
// split(/(<[^>]+>)/g) — une balise commence toujours par '<' dans cette alternance — et on
// n'applique linkify() qu'aux segments de texte, jamais à l'intérieur d'une balise : les
// tableaux/listes/liens existants restent intacts quelle que soit leur complexité. Pas de
// candidats sort/aptitude ici : une description de sort ne référence quasi jamais un autre
// sort par son nom.
// Les états sont rendus avec un attribut data-condition-slug plutôt qu'un vrai lien : on ne
// peut pas monter de composant Vue (RefLink) à l'intérieur d'un v-html. Les composants admin
// qui affichent ce HTML (SpellSearch/ItemSearch) ajoutent un handler de clic délégué sur le
// conteneur pour naviguer vers /admin/conditions ; ailleurs (outils joueur), le span reste
// un simple indice visuel avec tooltip natif, sans navigation.
export function highlightGlossaryHtml(html) {
  if (!html) return html
  return html
    .split(/(<[^>]+>)/g)
    .map(part => {
      if (part.startsWith('<')) return part
      return linkify(part, GLOSSARY_AND_CONCEPT_CANDIDATES)
        .map(seg => {
          if (seg.type === 'glossary') return `<span class="glossary-term" title="${escapeAttr(seg.payload.description)}">${seg.value}</span>`
          if (seg.type === 'concept') return `<span class="concept-term">${seg.value}</span>`
          if (seg.type === 'condition') return `<span class="condition-term" data-condition-slug="${escapeAttr(seg.payload.slug)}" data-condition-name="${escapeAttr(seg.payload.name)}" title="${escapeAttr(seg.payload.description)}">${seg.value}</span>`
          return seg.value
        })
        .join('')
    })
    .join('')
}

// Aplatit les features de classe + traits de sous-classe (+ leurs options) d'UNE classe en
// candidats "aptitude", avec un id synthétique identique à celui de GET
// /api/classes/abilities (voir buildAbility côté backend) pour permettre la navigation
// directe vers l'onglet Aptitudes.
export function classAbilityCandidates(dndClass, slugify) {
  const entries = []
  const push = (item, subclass) => {
    const id = [dndClass.slug, subclass ? slugify(subclass.name) : null, slugify(item.name), item.level]
      .filter(Boolean).join('__')
    entries.push({
      type: 'ability',
      name: item.name,
      payload: {
        id,
        name: item.name,
        description: item.description,
        className: dndClass.name,
        classSlug: dndClass.slug,
        subclassName: subclass ? subclass.name : null,
      },
    })
    for (const opt of item.options || []) {
      const optId = [dndClass.slug, subclass ? slugify(subclass.name) : null, slugify(item.name), slugify(opt.name)]
        .filter(Boolean).join('__')
      entries.push({
        type: 'ability',
        name: opt.name,
        payload: {
          id: optId,
          name: opt.name,
          description: opt.description,
          className: dndClass.name,
          classSlug: dndClass.slug,
          subclassName: subclass ? subclass.name : null,
        },
      })
    }
  }
  for (const f of dndClass.features || []) push(f, null)
  for (const sc of dndClass.subclasses || []) {
    for (const t of sc.traits || []) push(t, sc)
  }
  return buildCandidates(entries)
}
