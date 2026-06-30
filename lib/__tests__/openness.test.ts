import { describe, it, expect } from 'vitest'
import { computeOpenness } from '../openness'

describe('computeOpenness', () => {
  it('is 0 with no recent activity regardless of history', () => {
    expect(computeOpenness({ recentDays: 0, totalEntries: 500, daysSinceCreated: 600, isFormula: false })).toBe(0)
  })

  it('full bloom at exactly 80% of 30-day window with no lifetime bonus', () => {
    // 24/30 days = 80%, lifetimeScore = 0 → (0.8 / 0.8) * 1.0 = 1.0
    expect(computeOpenness({ recentDays: 24, totalEntries: 0, daysSinceCreated: 30, isFormula: false })).toBe(1)
  })

  it('applies the lifetime bonus for established trackers', () => {
    // recent 18/30 = 0.6; lifetime min(480/600,1)=0.8; (0.6/0.8) * (1 + 0.8*0.25) = 0.75 * 1.2 = 0.9
    const v = computeOpenness({ recentDays: 18, totalEntries: 480, daysSinceCreated: 600, isFormula: false })
    expect(v).toBeCloseTo(0.9, 5)
  })

  it('caps at 1', () => {
    expect(computeOpenness({ recentDays: 30, totalEntries: 900, daysSinceCreated: 900, isFormula: false })).toBe(1)
  })

  it('guards against divide-by-zero on brand-new trackers', () => {
    // daysSinceCreated 0 → treated as 1; lifetimeScore min(1/1,1)=1; (1/30/0.8) * 1.25
    const v = computeOpenness({ recentDays: 1, totalEntries: 1, daysSinceCreated: 0, isFormula: false })
    expect(v).toBeCloseTo((1 / 30 / 0.8) * 1.25, 5)
  })

  it('returns 1 for formula modules', () => {
    expect(computeOpenness({ recentDays: 0, totalEntries: 0, daysSinceCreated: 0, isFormula: true })).toBe(1)
  })
})
