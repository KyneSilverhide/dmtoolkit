import { describe, it, expect } from 'vitest'
import { hpTier } from './hp.js'

describe('hpTier', () => {
  it('healthy au-dessus de 50%', () => {
    expect(hpTier(100)).toBe('healthy')
    expect(hpTier(51)).toBe('healthy')
  })

  it('warning entre 21% et 50% inclus', () => {
    expect(hpTier(50)).toBe('warning')
    expect(hpTier(21)).toBe('warning')
  })

  it('critical à 20% et en dessous', () => {
    expect(hpTier(20)).toBe('critical')
    expect(hpTier(1)).toBe('critical')
    expect(hpTier(0)).toBe('critical')
  })
})
