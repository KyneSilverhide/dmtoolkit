import { describe, it, expect } from 'vitest'
import {
  formatQuotaDisplay,
  isQuotaLow,
  isQuotaEmpty,
  parseGeneratorResult,
  getGeneratorType,
  getDefaultOptions,
  GENERATOR_TYPES,
} from './generatorUtils.js'

describe('formatQuotaDisplay', () => {
  it('retourne null si quota absent', () => {
    expect(formatQuotaDisplay(null)).toBeNull()
    expect(formatQuotaDisplay(undefined)).toBeNull()
    expect(formatQuotaDisplay({})).toBeNull()
  })

  it('retourne null si remaining ou limit est null', () => {
    expect(formatQuotaDisplay({ remaining: null, limit: 150 })).toBeNull()
    expect(formatQuotaDisplay({ remaining: 45, limit: null })).toBeNull()
  })

  it('affiche remaining / limit sans resetAt', () => {
    const result = formatQuotaDisplay({ remaining: 45, limit: 150, resetAt: null })
    expect(result).toBe('45 / 150 requêtes restantes')
  })

  it('ignore resetAt si valeur est "0"', () => {
    const result = formatQuotaDisplay({ remaining: 10, limit: 150, resetAt: '0' })
    expect(result).toBe('10 / 150 requêtes restantes')
  })

  it('inclut resetAt si présent', () => {
    const result = formatQuotaDisplay({ remaining: 10, limit: 150, resetAt: '2h' })
    expect(result).toBe('10 / 150 requêtes restantes — réinitialisation dans 2h')
  })

  it('affiche quota à zéro', () => {
    const result = formatQuotaDisplay({ remaining: 0, limit: 150, resetAt: null })
    expect(result).toBe('0 / 150 requêtes restantes')
  })
})

describe('isQuotaLow', () => {
  it('retourne false si quota absent', () => {
    expect(isQuotaLow(null)).toBe(false)
    expect(isQuotaLow({})).toBe(false)
  })

  it('retourne false si remaining null', () => {
    expect(isQuotaLow({ remaining: null, limit: 150 })).toBe(false)
  })

  it('retourne false si quota suffisant (> 10%)', () => {
    expect(isQuotaLow({ remaining: 50, limit: 150 })).toBe(false)
    expect(isQuotaLow({ remaining: 15, limit: 150 })).toBe(false)
  })

  it('retourne true si remaining < 10% du limit', () => {
    expect(isQuotaLow({ remaining: 14, limit: 150 })).toBe(true)
    expect(isQuotaLow({ remaining: 1, limit: 150 })).toBe(true)
  })

  it('retourne false si limit est 0 (évite division par zéro)', () => {
    expect(isQuotaLow({ remaining: 0, limit: 0 })).toBe(false)
  })
})

describe('isQuotaEmpty', () => {
  it('retourne false si quota absent', () => {
    expect(isQuotaEmpty(null)).toBe(false)
    expect(isQuotaEmpty({ remaining: null })).toBe(false)
  })

  it('retourne false si remaining > 0', () => {
    expect(isQuotaEmpty({ remaining: 1 })).toBe(false)
  })

  it('retourne true si remaining === 0', () => {
    expect(isQuotaEmpty({ remaining: 0 })).toBe(true)
  })
})

describe('parseGeneratorResult', () => {
  it('retourne [] si result est vide', () => {
    expect(parseGeneratorResult('', 'npc_name')).toEqual([])
    expect(parseGeneratorResult(null, 'npc_name')).toEqual([])
  })

  it('split par ligne pour les types multiResult (npc_name)', () => {
    const raw = 'Aldric\nBertran\nCélestine\nDuvain\nElowen'
    expect(parseGeneratorResult(raw, 'npc_name')).toEqual([
      'Aldric', 'Bertran', 'Célestine', 'Duvain', 'Elowen',
    ])
  })

  it('filtre les lignes vides', () => {
    const raw = 'Aldric\n\nBertran\n'
    expect(parseGeneratorResult(raw, 'npc_name')).toEqual(['Aldric', 'Bertran'])
  })

  it('split par ligne pour place_name', () => {
    const raw = 'Porteclair\nRocsombre'
    expect(parseGeneratorResult(raw, 'place_name')).toEqual(['Porteclair', 'Rocsombre'])
  })

  it('split par ligne pour tavern_name', () => {
    const raw = "L'Épée Rouillée\nLe Sanglier Dansant"
    expect(parseGeneratorResult(raw, 'tavern_name')).toEqual(["L'Épée Rouillée", 'Le Sanglier Dansant'])
  })

  it('retourne texte complet en tableau d un élément pour quest_hook', () => {
    const raw = 'Un marchand a disparu. Sa charrette gît abandonnée sur la route. Une traînée de sang mène vers la forêt.'
    expect(parseGeneratorResult(raw, 'quest_hook')).toEqual([raw])
  })

  it('retourne texte complet en tableau d un élément pour npc_description', () => {
    const raw = 'Grand et mince, le visage marqué par les années.'
    expect(parseGeneratorResult(raw, 'npc_description')).toEqual([raw])
  })
})

describe('getGeneratorType', () => {
  it('retourne la définition pour un type valide', () => {
    const def = getGeneratorType('npc_name')
    expect(def).toBeTruthy()
    expect(def.key).toBe('npc_name')
    expect(def.multiResult).toBe(true)
  })

  it('retourne null pour un type inconnu', () => {
    expect(getGeneratorType('unknown')).toBeNull()
    expect(getGeneratorType('')).toBeNull()
  })

  it('chaque type a les champs requis', () => {
    for (const t of GENERATOR_TYPES) {
      expect(t).toHaveProperty('key')
      expect(t).toHaveProperty('label')
      expect(t).toHaveProperty('multiResult')
      expect(Array.isArray(t.options)).toBe(true)
    }
  })
})

describe('getDefaultOptions', () => {
  it('retourne les valeurs par défaut pour npc_name', () => {
    expect(getDefaultOptions('npc_name')).toMatchObject({ race: 'humain', genre: 'neutre' })
  })

  it('retourne les valeurs par défaut pour place_name', () => {
    expect(getDefaultOptions('place_name')).toMatchObject({ typeLieu: 'ville' })
  })

  it('retourne objet vide pour les types sans options', () => {
    expect(getDefaultOptions('tavern_name')).toEqual({})
    expect(getDefaultOptions('quest_hook')).toEqual({})
  })

  it('retourne objet vide pour un type inconnu', () => {
    expect(getDefaultOptions('unknown')).toEqual({})
  })
})
