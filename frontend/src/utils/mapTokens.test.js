import { describe, it, expect } from 'vitest'
import { GROUP_TOKEN_ID, visibleTokens, centerOfPlayerTokens } from './mapTokens.js'

const tokens = {
  1: { nx: 0.2, ny: 0.4 },
  2: { nx: 0.4, ny: 0.6 },
  custom_9: { nx: 0.9, ny: 0.9, name: 'Démon' },
  [GROUP_TOKEN_ID]: { nx: 0.5, ny: 0.5, name: 'Groupe' },
}

describe('visibleTokens', () => {
  it('shows the group and custom tokens in group mode, never the players', () => {
    expect(Object.keys(visibleTokens(tokens, true)).sort()).toEqual(['custom_9', 'group'])
  })
  it('hides the group token otherwise', () => {
    expect(Object.keys(visibleTokens(tokens, false)).sort()).toEqual(['1', '2', 'custom_9'])
  })
  it('tolerates a legacy array payload', () => {
    expect(visibleTokens([], true)).toEqual({})
  })
})

describe('centerOfPlayerTokens', () => {
  it('averages player tokens only', () => {
    const c = centerOfPlayerTokens(tokens)
    expect(c.nx).toBeCloseTo(0.3)
    expect(c.ny).toBeCloseTo(0.5)
  })
  it('is null without player tokens', () => {
    expect(centerOfPlayerTokens({ custom_9: tokens.custom_9 })).toBeNull()
  })
})
