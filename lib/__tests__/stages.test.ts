import { describe, it, expect } from 'vitest'
import { getStageIndex, daysUntilNextStage, STAGES } from '../stages'

describe('getStageIndex', () => {
  it('openness 0 → Dormant (0)', () => {
    expect(getStageIndex(0)).toBe(0)
    expect(STAGES[0].name).toBe('Dormant')
  })
  it('openness just below a threshold stays in lower stage', () => {
    expect(getStageIndex(0.19)).toBe(0)
    expect(getStageIndex(0.39)).toBe(1)
    expect(getStageIndex(0.59)).toBe(2)
    expect(getStageIndex(0.79)).toBe(3)
  })
  it('openness exactly at a threshold enters the higher stage', () => {
    expect(getStageIndex(0.2)).toBe(1)
    expect(getStageIndex(0.4)).toBe(2)
    expect(getStageIndex(0.6)).toBe(3)
    expect(getStageIndex(0.8)).toBe(4)
  })
  it('openness 1 → Bloomed (4)', () => {
    expect(getStageIndex(1)).toBe(4)
    expect(STAGES[4].name).toBe('Bloomed')
  })
})

describe('daysUntilNextStage', () => {
  it('formula modules have no next stage', () => {
    const result = daysUntilNextStage({
      loggedDates: [],
      totalEntries: 0,
      daysSinceCreated: 0,
      isFormula: true,
      today: '2026-06-29',
    })
    expect(result).toBeNull()
  })

  it('already-bloomed module has no next stage', () => {
    // 30 consecutive logged days ending today, with a high lifetime ratio → openness ≈ 1.
    const loggedDates: string[] = []
    for (let i = 0; i < 30; i++) {
      const d = new Date('2026-06-29T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - i)
      loggedDates.push(d.toISOString().split('T')[0])
    }
    const result = daysUntilNextStage({
      loggedDates,
      totalEntries: 200,
      daysSinceCreated: 200,
      isFormula: false,
      today: '2026-06-29',
    })
    expect(result).toBeNull()
  })

  it('dormant module: logging daily reaches Stirring in a positive number of days', () => {
    // Only today logged, low lifetime ratio → openness ~0.03 (Dormant).
    const result = daysUntilNextStage({
      loggedDates: ['2026-06-29'],
      totalEntries: 10,
      daysSinceCreated: 100,
      isFormula: false,
      today: '2026-06-29',
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Stirring')
    expect(result!.days).toBeGreaterThan(0)
    expect(result!.days).toBeLessThanOrEqual(30)
  })

  it('next stage name is the immediate successor of the current stage', () => {
    // ~12 distinct recent days, low lifetime ratio → openness ~0.51 → Cracking, next Breaking.
    const loggedDates: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date('2026-06-29T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - i)
      loggedDates.push(d.toISOString().split('T')[0])
    }
    const result = daysUntilNextStage({
      loggedDates,
      totalEntries: 20,
      daysSinceCreated: 300,
      isFormula: false,
      today: '2026-06-29',
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Breaking')
  })
})
