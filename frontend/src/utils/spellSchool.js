// Parsing du champ "école" des sorts D&D 5e (aidedd_spells.json) et couleur
// associée à chaque école, partagés entre la recherche de sorts admin/joueur
// et la palette de commande.
const SCHOOL_COLORS = {
  abjuration: 'var(--school-abjuration)',
  divination: 'var(--school-divination)',
  enchantement: 'var(--school-enchantement)',
  evocation: 'var(--school-evocation)',
  illusion: 'var(--school-illusion)',
  invocation: 'var(--school-invocation)',
  necromancie: 'var(--school-necromancie)',
  transmutation: 'var(--school-transmutation)',
}

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function parseEcole(ecole) {
  if (!ecole) return { level: null, school: '', ritual: false }
  const rituel = ecole.toLowerCase().includes('rituel')
  const match = ecole.match(/niveau\s+(\d+)\s*[-–]\s*(.+)/i)
  if (match) {
    let school = match[2].replace(/\s*\(rituel\)/i, '').trim()
    school = school.charAt(0).toUpperCase() + school.slice(1)
    return { level: parseInt(match[1]), school, ritual: rituel }
  }
  const cantrip = ecole.match(/tour de magie\s*[-–]?\s*(.*)/i)
  if (cantrip) {
    let school = cantrip[1].replace(/\s*\(rituel\)/i, '').trim()
    return { level: 0, school: school || ecole, ritual: rituel }
  }
  return { level: null, school: ecole, ritual: rituel }
}

export function levelLabel(level) {
  if (level === null) return ''
  if (level === 0) return 'Tour de magie'
  return `Niveau ${level}`
}

export function schoolColor(school) {
  if (!school) return 'var(--school-default)'
  const key = stripAccents(school.toLowerCase())
  for (const [k, v] of Object.entries(SCHOOL_COLORS)) {
    if (key.includes(k)) return v
  }
  return 'var(--school-default)'
}
