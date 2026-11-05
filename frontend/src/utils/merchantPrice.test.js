import { describe, it, expect } from 'vitest'
import { isTroc, formatItemPrice, formatLinePrice, formatTotalPrice } from './merchantPrice.js'

describe('formatItemPrice', () => {
  it('affiche le prix en po par défaut', () => {
    expect(formatItemPrice({ price: 12 })).toBe('12 po')
    expect(formatItemPrice({ price: 0, price_mode: 'po' })).toBe('0 po')
  })

  it('affiche le texte du troc', () => {
    expect(formatItemPrice({ price: 0, price_mode: 'troc', price_text: '4 jetons' })).toBe('4 jetons')
  })

  it('affiche « Troc » quand le texte est vide', () => {
    expect(formatItemPrice({ price: 0, price_mode: 'troc', price_text: null })).toBe('Troc')
  })
})

describe('formatLinePrice', () => {
  it('utilise le total de la ligne en po', () => {
    expect(formatLinePrice({ total_price: 30, quantity: 3 })).toBe('30 po')
  })

  it('garde le texte du troc quelle que soit la quantité', () => {
    expect(formatLinePrice({ total_price: 0, quantity: 2, price_mode: 'troc', price_text: '1 jeton' })).toBe('1 jeton')
  })
})

describe('formatTotalPrice', () => {
  it('total en po sans troc', () => {
    expect(formatTotalPrice(15, false)).toBe('15 po')
  })

  it('panier mixte', () => {
    expect(formatTotalPrice(15, true)).toBe('15 po + troc')
  })

  it('panier tout en troc', () => {
    expect(formatTotalPrice(0, true)).toBe('Troc')
  })
})

describe('isTroc', () => {
  it('reconnaît le mode troc', () => {
    expect(isTroc({ price_mode: 'troc' })).toBe(true)
    expect(isTroc({ price_mode: 'po' })).toBe(false)
    expect(isTroc(null)).toBe(false)
  })
})
