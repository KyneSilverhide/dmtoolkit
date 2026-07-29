import { describe, it, expect } from 'vitest'
import { parsePlayerConditions } from './conditions.js'

describe('parsePlayerConditions', () => {
  it('renvoie [] pour null/undefined/chaîne vide', () => {
    expect(parsePlayerConditions(null)).toEqual([])
    expect(parsePlayerConditions(undefined)).toEqual([])
    expect(parsePlayerConditions('')).toEqual([])
  })

  it('parse une chaîne JSON valide', () => {
    expect(parsePlayerConditions('["prone","poisoned"]')).toEqual(['prone', 'poisoned'])
  })

  it('renvoie [] pour du JSON invalide plutôt que de lever', () => {
    expect(parsePlayerConditions('{not valid json')).toEqual([])
  })

  it('passe au travers un tableau déjà parsé', () => {
    expect(parsePlayerConditions(['blinded'])).toEqual(['blinded'])
  })

  it('renvoie [] si la valeur parsée n’est pas un tableau', () => {
    expect(parsePlayerConditions('{"not":"an array"}')).toEqual([])
  })
})
