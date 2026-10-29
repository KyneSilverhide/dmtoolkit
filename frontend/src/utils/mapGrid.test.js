import { describe, it, expect } from 'vitest'
import { getCellNeighbors } from './mapGrid.js'

describe('getCellNeighbors', () => {
  it('returns 8 neighbours for an inner square cell', () => {
    const n = getCellNeighbors(12, 'square', 5, 5).sort((a, b) => a - b)
    expect(n).toEqual([6, 7, 8, 11, 13, 16, 17, 18])
  })
  it('clips at the grid edge', () => {
    expect(getCellNeighbors(0, 'square', 5, 5).sort((a, b) => a - b)).toEqual([1, 5, 6])
  })
  it('returns 6 neighbours for an inner hex cell', () => {
    expect(getCellNeighbors(12, 'hex', 5, 5, 'flat')).toHaveLength(6)
    expect(getCellNeighbors(12, 'hex', 5, 5, 'pointy')).toHaveLength(6)
  })
})
