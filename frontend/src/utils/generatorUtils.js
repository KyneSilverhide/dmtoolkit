export const GENERATOR_TYPES = [
  {
    key: 'npc_name',
    label: 'Nom de PNJ',
    multiResult: true,
    options: [
      {
        key: 'race',
        label: 'Race',
        choices: ['humain', 'elfe', 'nain', 'halfelin', 'gnome', 'demi-elfe', 'demi-orc', 'tieffelin'],
        default: 'humain',
      },
      {
        key: 'genre',
        label: 'Genre',
        choices: ['masculin', 'féminin', 'neutre'],
        default: 'neutre',
      },
    ],
  },
  {
    key: 'place_name',
    label: 'Nom de lieu',
    multiResult: true,
    options: [
      {
        key: 'typeLieu',
        label: 'Type',
        choices: ['ville', 'village', 'auberge', 'donjon', 'forêt', 'montagne', 'ruine'],
        default: 'ville',
      },
    ],
  },
  {
    key: 'tavern_name',
    label: "Nom d'auberge",
    multiResult: true,
    options: [],
  },
  {
    key: 'quest_hook',
    label: 'Accroche de quête',
    multiResult: false,
    options: [],
  },
  {
    key: 'npc_description',
    label: 'Description PNJ',
    multiResult: false,
    options: [
      {
        key: 'race',
        label: 'Race',
        choices: ['humain', 'elfe', 'nain', 'halfelin', 'gnome', 'demi-elfe', 'demi-orc', 'tieffelin'],
        default: 'humain',
      },
    ],
  },
]

export function getGeneratorType(key) {
  return GENERATOR_TYPES.find((t) => t.key === key) || null
}

export function getDefaultOptions(type) {
  const def = getGeneratorType(type)
  if (!def) return {}
  return Object.fromEntries(def.options.map((o) => [o.key, o.default]))
}

export function formatQuotaDisplay(quota) {
  if (!quota || quota.remaining == null || quota.limit == null) return null
  const base = `${quota.remaining} / ${quota.limit} requêtes restantes`
  if (quota.resetAt && quota.resetAt !== '0') return `${base} — réinitialisation dans ${quota.resetAt}`
  return base
}

export function isQuotaLow(quota) {
  if (!quota || quota.remaining === null || quota.limit === null) return false
  if (quota.limit === 0) return false
  return quota.remaining / quota.limit < 0.1
}

export function isQuotaEmpty(quota) {
  if (!quota || quota.remaining === null) return false
  return quota.remaining === 0
}

export function parseGeneratorResult(result, type) {
  if (!result) return []
  const def = getGeneratorType(type)
  if (def?.multiResult) {
    return result
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [result]
}
