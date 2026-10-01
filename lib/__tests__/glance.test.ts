import { describe, it, expect } from 'vitest'
import { computeGlanceTiles, longestStreak, currentStreak } from '../glance'
import type { Module, ModuleField } from '../types'

const TODAY = '2026-09-30'

function makeModule(fields: ModuleField[], extra: Partial<Module> = {}): Module {
  return {
    id: 'm1', user_id: 'u1', name: 'Nutrition', fields, kind: 'standard', formula_config: null,
    crystal_type: 'citrine', card_config: null, dashboard_config: null, is_builtin: false, shared: false,
    created_at: '2026-01-01T00:00:00Z', ...extra,
  }
}
const e = (entry_date: string, values: Record<string, unknown>) => ({ entry_date, values, created_at: `${entry_date}T12:00:00Z` })

const cal: ModuleField = { key: 'cal', label: 'Calories', type: 'number', required: true, unit: 'kcal' }

describe('streak helpers', () => {
  it('current streak counts back from today, or from yesterday when today is empty', () => {
    expect(currentStreak(new Set(['2026-09-30', '2026-09-29', '2026-09-27']), TODAY)).toBe(2)
    expect(currentStreak(new Set(['2026-09-29', '2026-09-28']), TODAY)).toBe(2)
    expect(currentStreak(new Set(['2026-09-27']), TODAY)).toBe(0)
  })
  it('longest streak finds the longest consecutive run', () => {
    expect(longestStreak(new Set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10']))).toBe(3)
    expect(longestStreak(new Set())).toBe(0)
  })
})

describe('computeGlanceTiles', () => {
  const mod = makeModule([cal])
  const entries = [
    e('2026-09-30', { cal: 600 }), e('2026-09-30', { cal: 400 }),
    e('2026-09-29', { cal: 2000 }),
    e('2026-09-20', { cal: 1500 }),
    e('2026-08-25', { cal: 3000 }), // previous 7-day window? no — well before
  ]

  it('averages daily sums over logged days in the range', () => {
    const tiles = computeGlanceTiles(mod, entries, TODAY, 7)
    const avg = tiles.find((t) => t.key === 'avg:cal')!
    expect(avg.label).toBe('Avg Calories · 7 days')
    expect(avg.value).toBe('1,500') // (1000 + 2000) / 2
    expect(avg.unit).toBe('kcal')
    expect(avg.bars).toHaveLength(7)
    expect(avg.bars[6]).toBe(0.5) // today 1000 of max 2000
    expect(avg.bars[0]).toBeNull()
  })

  it('includes a streak tile and lists best/lowest day facts', () => {
    const tiles = computeGlanceTiles(mod, entries, TODAY, 30)
    const streak = tiles.find((t) => t.key === 'streak')!
    expect(streak.value).toBe('2')
    const avg = tiles.find((t) => t.key === 'avg:cal')!
    expect(avg.facts).toContainEqual({ k: 'Best day', v: '2,000 kcal · Sep 29' })
    expect(avg.facts).toContainEqual({ k: 'Days logged', v: '3 of 30' })
  })

  it('adds a goal tile when the tracker has a goal', () => {
    const goalMod = makeModule([cal], {
      dashboard_config: { mode: 'goal', goal: { conditions: [{ field: 'cal', op: 'lte', value: 1800 }], combine: 'all' } },
    })
    const goal = computeGlanceTiles(goalMod, entries, TODAY, 7).find((t) => t.key === 'goal')!
    expect(goal.value).toBe('1')
    expect(goal.unit).toBe('of 7 days')
  })

  it('reports the change against the previous window', () => {
    const tiles = computeGlanceTiles(mod, [e('2026-09-30', { cal: 1100 }), e('2026-09-22', { cal: 1000 })], TODAY, 7)
    expect(tiles.find((t) => t.key === 'avg:cal')!.delta).toBe('+10% vs previous 7 days')
  })
})
