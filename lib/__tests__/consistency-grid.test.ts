// lib/__tests__/consistency-grid.test.ts
import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  evaluateGoal,
  computeCellState,
  buildGridData,
  computeColumnStats,
} from '../consistency-grid'
import type { Module, Entry } from '../types'

// ── evaluateCondition ───────────────────────────────────────────

describe('evaluateCondition', () => {
  it('gte: value equals threshold → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'gte', value: 150 }, 150)).toBe(true)
  })
  it('gte: value below threshold → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'gte', value: 150 }, 149)).toBe(false)
  })
  it('lte: value equals threshold → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'lte', value: 3000 }, 3000)).toBe(true)
  })
  it('lte: value above threshold → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'lte', value: 3000 }, 3001)).toBe(false)
  })
  it('eq: exact match → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'eq', value: 5 }, 5)).toBe(true)
  })
  it('eq: no match → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'eq', value: 5 }, 6)).toBe(false)
  })
  it('between: value in range → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 150)).toBe(true)
  })
  it('between: value below range → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 50)).toBe(false)
  })
  it('between: value above range → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 201)).toBe(false)
  })
  it('between: inclusive lower bound → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 100)).toBe(true)
  })
})

// ── evaluateGoal ────────────────────────────────────────────────

describe('evaluateGoal', () => {
  it('single gte condition: sum meets threshold → true', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 150 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ cal: 160 }])).toBe(true)
  })
  it('single gte condition: sum misses threshold → false', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 150 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ cal: 100 }])).toBe(false)
  })
  it('multiple entries: sums field values across entries', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 2800 }], combine: 'all' as const }
    // Two meals: 1500 + 1400 = 2900 ≥ 2800
    expect(evaluateGoal(goal, [{ cal: 1500 }, { cal: 1400 }])).toBe(true)
  })
  it('multiple conditions: all pass → true', () => {
    const goal = {
      conditions: [
        { field: 'cal', op: 'between' as const, min: 2800, max: 3000 },
        { field: 'protein', op: 'gte' as const, value: 150 },
      ],
      combine: 'all' as const,
    }
    expect(evaluateGoal(goal, [{ cal: 2900, protein: 160 }])).toBe(true)
  })
  it('multiple conditions: one fails → false', () => {
    const goal = {
      conditions: [
        { field: 'cal', op: 'between' as const, min: 2800, max: 3000 },
        { field: 'protein', op: 'gte' as const, value: 150 },
      ],
      combine: 'all' as const,
    }
    // cal OK but protein too low
    expect(evaluateGoal(goal, [{ cal: 2900, protein: 100 }])).toBe(false)
  })
  it('no entries → false', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 100 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [])).toBe(false)
  })
})

// ── computeCellState ─────────────────────────────────────────────

// Minimal module factory
function makeMod(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    user_id: 'u-1',
    name: 'Test',
    fields: [{ key: 'done', label: 'Done', type: 'boolean', required: false }],
    kind: 'standard',
    formula_config: null,
    crystal_type: 'amethyst',
    card_config: null,
    dashboard_config: null,
    is_builtin: false,
    shared: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeCellState', () => {
  it('date before module creation → inactive', () => {
    const mod = makeMod({ created_at: '2026-06-01T00:00:00Z' })
    const cell = computeCellState(mod, [], '2026-05-31', null)
    expect(cell.state).toBe('inactive')
  })

  it('binary mode, single boolean true → done', () => {
    const mod = makeMod() // single boolean field
    const cell = computeCellState(mod, [{ done: true }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.intensity).toBe(1)
  })

  it('binary mode, single boolean false → not-done', () => {
    const mod = makeMod()
    const cell = computeCellState(mod, [{ done: false }], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
  })

  it('binary mode, multi-field module, has entry → done', () => {
    const mod = makeMod({
      fields: [
        { key: 'calories', label: 'Calories', type: 'number', required: false },
        { key: 'protein', label: 'Protein', type: 'number', required: false },
      ],
    })
    const cell = computeCellState(mod, [{ calories: 2000, protein: 150 }], '2026-06-28', null)
    expect(cell.state).toBe('done')
  })

  it('binary mode, no entry → not-done', () => {
    const mod = makeMod()
    const cell = computeCellState(mod, [], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
  })

  it('goal mode, conditions met → done', () => {
    const mod = makeMod({
      fields: [{ key: 'cal', label: 'Cal', type: 'number', required: false }],
      dashboard_config: {
        mode: 'goal',
        goal: { conditions: [{ field: 'cal', op: 'gte', value: 150 }], combine: 'all' },
      },
    })
    const cell = computeCellState(mod, [{ cal: 200 }], '2026-06-28', null)
    expect(cell.state).toBe('done')
  })

  it('goal mode, conditions not met → not-done', () => {
    const mod = makeMod({
      fields: [{ key: 'cal', label: 'Cal', type: 'number', required: false }],
      dashboard_config: {
        mode: 'goal',
        goal: { conditions: [{ field: 'cal', op: 'gte', value: 150 }], combine: 'all' },
      },
    })
    const cell = computeCellState(mod, [{ cal: 100 }], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
  })

  it('gradient mode, returns intensity proportional to value', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 75 }], '2026-06-28', { min: 0, max: 100 })
    expect(cell.state).toBe('done')
    expect(cell.intensity).toBeCloseTo(0.75)
    expect(cell.rawValue).toBe(75)
  })

  it('gradient mode, value at max → intensity 1', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 100 }], '2026-06-28', { min: 0, max: 100 })
    expect(cell.intensity).toBe(1)
  })

  it('gradient mode, value exceeds max → intensity clamped to 1', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 150 }], '2026-06-28', { min: 0, max: 100 })
    expect(cell.intensity).toBe(1)
  })

  it('category mode, no entry → not-done (handled by shared early-return above switch)', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    const cell = computeCellState(mod, [], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
    expect(cell.intensity).toBe(0)
  })

  it('category mode, entry with mapped category → done with crystalOverride and label', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    const cell = computeCellState(mod, [{ session_type: 'Rest' }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.intensity).toBe(1)
    expect(cell.crystalOverride).toBe('obsidian')
    expect(cell.categoryLabel).toBe('Rest')
  })

  it('category mode, entry with unmapped category → done, no crystalOverride', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst' },
      },
    })
    // 'Rest' has no mapping → crystalOverride undefined
    const cell = computeCellState(mod, [{ session_type: 'Rest' }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.crystalOverride).toBeUndefined()
    expect(cell.categoryLabel).toBe('Rest')
  })

  it('category mode, multiple entries → last entry wins for category', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    // dayEntries order: first entry is Lift, second (last) is Rest
    const cell = computeCellState(
      mod,
      [{ session_type: 'Lift' }, { session_type: 'Rest' }],
      '2026-06-28',
      null,
    )
    expect(cell.crystalOverride).toBe('obsidian')
    expect(cell.categoryLabel).toBe('Rest')
  })
})

// ── computeColumnStats ──────────────────────────────────────────

describe('computeColumnStats', () => {
  it('no cells → 0 streak, 0%', () => {
    const stats = computeColumnStats([], [], '2026-06-28')
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(0)
    expect(stats.completionPct).toBe(0)
  })

  it('today done → currentStreak = 1', () => {
    const cells = [{ state: 'done' as const, intensity: 1 }]
    const dates = ['2026-06-28']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(1)
  })

  it('today done, yesterday done → currentStreak = 2', () => {
    const cells = [
      { state: 'done' as const, intensity: 1 },  // 2026-06-28 (today)
      { state: 'done' as const, intensity: 1 },  // 2026-06-27
    ]
    const dates = ['2026-06-28', '2026-06-27']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(2)
  })

  it('gap yesterday breaks current streak', () => {
    const cells = [
      { state: 'done' as const, intensity: 1 },      // today
      { state: 'not-done' as const, intensity: 0 },   // yesterday - gap
      { state: 'done' as const, intensity: 1 },      // 2 days ago
    ]
    const dates = ['2026-06-28', '2026-06-27', '2026-06-26']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(1)
    expect(stats.longestStreak).toBe(1) // days ago: ... wait, longest is 1 segment of 1 + 1 segment of 1. Actually longest = 1 since no 2 consecutive.
  })

  it('3 consecutive days in the past → longestStreak 3, currentStreak 0 if not recent', () => {
    // Data from 7 days ago: 3 consecutive, then a gap
    const cells = [
      { state: 'not-done' as const, intensity: 0 }, // today
      { state: 'not-done' as const, intensity: 0 }, // yesterday
      { state: 'not-done' as const, intensity: 0 },
      { state: 'done' as const, intensity: 1 },
      { state: 'done' as const, intensity: 1 },
      { state: 'done' as const, intensity: 1 },
      { state: 'not-done' as const, intensity: 0 },
    ]
    const dates = [
      '2026-06-28', '2026-06-27', '2026-06-26',
      '2026-06-25', '2026-06-24', '2026-06-23',
      '2026-06-22',
    ]
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(3)
  })

  it('completionPct: 3 done out of 4 active (1 inactive)', () => {
    const cells = [
      { state: 'done' as const, intensity: 1 },
      { state: 'done' as const, intensity: 1 },
      { state: 'not-done' as const, intensity: 0 },
      { state: 'done' as const, intensity: 1 },
      { state: 'inactive' as const, intensity: 0 }, // inactive: doesn't count
    ]
    const dates = ['2026-06-28', '2026-06-27', '2026-06-26', '2026-06-25', '2026-06-24']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.completionPct).toBe(75) // 3/4 = 75%
  })
})

// ── buildGridData ────────────────────────────────────────────────

describe('buildGridData', () => {
  function makeEntry(moduleId: string, date: string, values: Record<string, unknown> = {}): Entry {
    return {
      id: `e-${moduleId}-${date}`,
      module_id: moduleId,
      user_id: 'u-1',
      values,
      entry_date: date,
      created_at: `${date}T10:00:00Z`,
    }
  }

  it('entry exists on a date → done cell for that column+row', () => {
    const mod = makeMod({ id: 'mod-1' })
    const entries = [makeEntry('mod-1', '2026-06-28', { done: true })]
    const grid = buildGridData([mod], entries, '2026-06-28')
    expect(grid.dates[0]).toBe('2026-06-28')
    expect(grid.cells[0][0].state).toBe('done')
  })

  it('date before module creation → inactive cell', () => {
    const mod = makeMod({ id: 'mod-1', created_at: '2026-06-15T00:00:00Z' })
    const entries = [makeEntry('mod-1', '2026-06-28')]
    const grid = buildGridData([mod], entries, '2026-06-28')
    // find the index for 2026-06-14 (before creation)
    const idx = grid.dates.indexOf('2026-06-14')
    expect(idx).toBeGreaterThan(-1)
    expect(grid.cells[0][idx].state).toBe('inactive')
  })

  it('entry predating module creation is active, not inactive (backdated/imported data)', () => {
    // Module row created 2026-06-09, but the user bulk-imported history back to
    // 2026-05-20. Those imported days are real tracking, not pre-tracking blanks.
    const mod = makeMod({ id: 'mod-1', created_at: '2026-06-09T00:00:00Z' })
    const entries = [makeEntry('mod-1', '2026-05-20', { done: true })]
    const grid = buildGridData([mod], entries, '2026-06-28')
    const idx = grid.dates.indexOf('2026-05-20')
    expect(idx).toBeGreaterThan(-1)
    // The day with imported data must show its real state, never inactive.
    expect(grid.cells[0][idx].state).toBe('done')
    // A day before the earliest data (and before creation) is still inactive.
    const preIdx = grid.dates.indexOf('2026-05-19')
    expect(preIdx).toBeGreaterThan(-1)
    expect(grid.cells[0][preIdx].state).toBe('inactive')
  })

  it('dates are in descending order (newest first)', () => {
    const mod = makeMod({ id: 'mod-1' })
    const entries = [
      makeEntry('mod-1', '2026-06-26'),
      makeEntry('mod-1', '2026-06-28'),
    ]
    const grid = buildGridData([mod], entries, '2026-06-28')
    expect(grid.dates[0]).toBe('2026-06-28')  // newest is today
    expect(grid.dates.length).toBeGreaterThanOrEqual(90)  // at least 90 days
    // Dates are in descending order
    for (let i = 1; i < grid.dates.length; i++) {
      expect(grid.dates[i] < grid.dates[i - 1]).toBe(true)
    }
  })

  it('always generates at least 90 dates even with no entries', () => {
    const mod = makeMod({ id: 'mod-1' })
    const grid = buildGridData([mod], [], '2026-06-28')
    expect(grid.dates.length).toBeGreaterThanOrEqual(90)
    expect(grid.dates[0]).toBe('2026-06-28')
  })

  it('gradient mode auto-fits range to window data', () => {
    const mod = makeMod({
      id: 'mod-1',
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const entries = [
      makeEntry('mod-1', '2026-06-28', { score: 10 }),
      makeEntry('mod-1', '2026-06-27', { score: 20 }),
    ]
    const grid = buildGridData([mod], entries, '2026-06-28')
    const cell28 = grid.cells[0][0]
    const cell27 = grid.cells[0][1]
    // 10 is min, 20 is max. 10→intensity 0, 20→intensity 1
    expect(cell28.intensity).toBeCloseTo(0)
    expect(cell27.intensity).toBeCloseTo(1)
  })
})

// ── category mode types (compile-time smoke) ─────────────────────

describe('category mode config shape', () => {
  it('DashboardConfig accepts category mode shape', () => {
    const cfg: import('../types').DashboardConfig = {
      mode: 'category',
      categoryField: 'session_type',
      categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
    }
    expect(cfg.mode).toBe('category')
  })
})
