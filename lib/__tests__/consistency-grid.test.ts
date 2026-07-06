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

// ── evaluateGoal value coercion (Step 1: string/null/boolean/missing) ──────

describe('evaluateGoal value coercion', () => {
  it('string numeric value coerces: "150" satisfies gte 150', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 150 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ cal: '150' }])).toBe(true)
  })

  it('string numeric values sum across entries: "100" + "50" satisfies gte 150', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 150 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ cal: '100' }, { cal: '50' }])).toBe(true)
  })

  it('null value does not throw and is ignored, not coerced to 0 (bug: Number(null)===0)', () => {
    // A single null entry must not satisfy an lte condition the way a real 0 would need to.
    const goal = { conditions: [{ field: 'cal', op: 'lte' as const, value: 0 }], combine: 'all' as const }
    expect(() => evaluateGoal(goal, [{ cal: null }])).not.toThrow()
    expect(evaluateGoal(goal, [{ cal: null }])).toBe(false)
  })

  it('boolean true value does not throw and is ignored, not coerced to 1 (bug: Number(true)===1)', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 1 }], combine: 'all' as const }
    expect(() => evaluateGoal(goal, [{ cal: true }])).not.toThrow()
    expect(evaluateGoal(goal, [{ cal: true }])).toBe(false)
  })

  it('boolean false value does not throw and does not falsely satisfy an eq-0 condition', () => {
    const goal = { conditions: [{ field: 'cal', op: 'eq' as const, value: 0 }], combine: 'all' as const }
    expect(() => evaluateGoal(goal, [{ cal: false }])).not.toThrow()
    expect(evaluateGoal(goal, [{ cal: false }])).toBe(false)
  })

  it('missing field key across all entries → false when threshold is positive (gte)', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 100 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ other: 5 }])).toBe(false)
  })

  it('missing field key, "between" range straddling 0 → false (bug: reduce seed 0 phantom-satisfies)', () => {
    // The reduce seed is 0 and a genuinely-missing field is skipped (not summed), so a day
    // with ZERO valid numeric values for the goal field evaluates the condition against a
    // "phantom" 0 — indistinguishable from the user having actually logged 0. For any
    // condition satisfied by 0 (between straddling 0, lte 0, eq 0), this incorrectly reports
    // the goal as met on a day nothing was logged for that field at all.
    const goal = { conditions: [{ field: 'cal', op: 'between' as const, min: -10, max: 10 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ other: 5 }])).toBe(false)
  })

  it('missing field key, "lte 0" condition → false (same phantom-zero bug)', () => {
    const goal = { conditions: [{ field: 'cal', op: 'lte' as const, value: 0 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ other: 5 }])).toBe(false)
  })

  it('missing field key with a real (non-zero-straddling) between range → false', () => {
    const goal = { conditions: [{ field: 'cal', op: 'between' as const, min: 100, max: 200 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ other: 5 }])).toBe(false)
  })

  it('a genuinely logged 0 still counts as a real value (does not regress to the phantom-zero bug fix)', () => {
    const goal = { conditions: [{ field: 'cal', op: 'lte' as const, value: 0 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ cal: 0 }])).toBe(true)
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

  it('gradient mode, day has an entry but the gradient field is non-numeric ("abc") → renders as no-data (not-done, intensity 0), not phantom-zero (F-07)', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 'abc' }], '2026-06-28', { min: 0, max: 100 })
    // Must match the shared "no entries" no-data rendering exactly (line ~148-150).
    expect(cell.state).toBe('not-done')
    expect(cell.intensity).toBe(0)
    expect(cell.rawValue).toBeUndefined()
  })

  it('gradient mode, day has an entry but the gradient field is null/boolean → renders as no-data, not phantom-zero (F-07)', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cellNull = computeCellState(mod, [{ score: null }], '2026-06-28', { min: 0, max: 100 })
    expect(cellNull.state).toBe('not-done')
    expect(cellNull.intensity).toBe(0)
    expect(cellNull.rawValue).toBeUndefined()

    const cellBool = computeCellState(mod, [{ score: true }], '2026-06-28', { min: 0, max: 100 })
    expect(cellBool.state).toBe('not-done')
    expect(cellBool.intensity).toBe(0)
    expect(cellBool.rawValue).toBeUndefined()
  })

  it('gradient mode, a genuinely logged 0 still renders as real data (anti-regression, mirrors F-06 pattern)', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 0 }], '2026-06-28', { min: 0, max: 100 })
    expect(cell.state).toBe('done')
    expect(cell.rawValue).toBe(0)
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

  it('category mode, entry with empty-string categoryField value → done, no crash, no crystalOverride, label undefined', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    expect(() => computeCellState(mod, [{ session_type: '' }], '2026-06-28', null)).not.toThrow()
    const cell = computeCellState(mod, [{ session_type: '' }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.crystalOverride).toBeUndefined()
    // Falsy label ('') is normalized to undefined (matches the `label || undefined` guard),
    // so the renderer's aria-label falls back to plain "done" instead of "done ()".
    expect(cell.categoryLabel).toBeUndefined()
  })

  it('category mode, entry missing the categoryField key entirely → done, no crash, no crystalOverride', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    // Entry has no session_type key at all (e.g. logged before the field existed).
    expect(() => computeCellState(mod, [{ unrelated: 1 }], '2026-06-28', null)).not.toThrow()
    const cell = computeCellState(mod, [{ unrelated: 1 }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.crystalOverride).toBeUndefined()
    expect(cell.categoryLabel).toBeUndefined()
  })

  it('category mode, categoryColors maps to a crystal key not in CRYSTAL_KEYS → computeCellState treats it as unmapped, falls back to module crystal (F-09)', () => {
    // computeCellState now validates categoryColors values against CRYSTAL_KEYS.
    // A present-but-invalid mapped value (e.g. stale config data from a renamed/
    // removed crystal key) is treated the same as unmapped: crystalOverride stays
    // undefined, so the renderer falls back to the module's own crystalType instead
    // of getCrystal()'s hardcoded 'amethyst' default.
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'not_a_real_crystal' as unknown as import('../crystals').CrystalKey },
      },
    })
    expect(() => computeCellState(mod, [{ session_type: 'Lift' }], '2026-06-28', null)).not.toThrow()
    const cell = computeCellState(mod, [{ session_type: 'Lift' }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.crystalOverride).toBeUndefined()
  })

  it('category mode, categoryColors maps to a valid CRYSTAL_KEYS value → crystalOverride passes through unchanged (F-09 anti-regression)', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'ruby' },
      },
    })
    const cell = computeCellState(mod, [{ session_type: 'Lift' }], '2026-06-28', null)
    expect(cell.crystalOverride).toBe('ruby')
  })

  it('category mode, missing categoryField in config (empty string) → done, no crash, label undefined', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: '',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    expect(() => computeCellState(mod, [{ session_type: 'Lift' }], '2026-06-28', null)).not.toThrow()
    const cell = computeCellState(mod, [{ session_type: 'Lift' }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.categoryLabel).toBeUndefined()
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

  it('module created today with an entry today → today done, no inactive bleed', () => {
    const mod = makeMod({ id: 'mod-1', created_at: '2026-06-28T09:00:00Z' })
    const entries = [makeEntry('mod-1', '2026-06-28', { done: true })]
    const grid = buildGridData([mod], entries, '2026-06-28')
    expect(grid.cells[0][0].state).toBe('done')
    // Yesterday (before creation, no entry) is inactive, not not-done.
    const yIdx = grid.dates.indexOf('2026-06-27')
    expect(grid.cells[0][yIdx].state).toBe('inactive')
  })

  it('90-day window at a month boundary: earliest date is exactly 89 days before today (inclusive span of 90)', () => {
    // today = 2026-03-01 (month boundary). No entries, no recent module creation
    // to extend the window further, so the floor is driven purely by the
    // "guarantee at least 90 days" rule: today - 89 days.
    const mod = makeMod({ id: 'mod-1', created_at: '2020-01-01T00:00:00Z' })
    const grid = buildGridData([mod], [], '2026-03-01')
    expect(grid.dates[0]).toBe('2026-03-01')
    expect(grid.dates.length).toBe(90)
    // 89 days before 2026-03-01 (crossing Feb, a non-leap-adjacent boundary here
    // since 2026 is not a leap year) = 2025-12-02.
    const last = grid.dates[grid.dates.length - 1]
    const expectedEarliest = new Date('2026-03-01T00:00:00Z')
    expectedEarliest.setUTCDate(expectedEarliest.getUTCDate() - 89)
    const expectedStr = expectedEarliest.toISOString().split('T')[0]
    expect(last).toBe(expectedStr)
    // Dates must remain strictly descending and unique across the boundary.
    const seen = new Set(grid.dates)
    expect(seen.size).toBe(grid.dates.length)
  })

  it('duplicate same-day entries (binary mode) → one done cell, not double-counted', () => {
    const mod = makeMod({ id: 'mod-1' })
    const entries = [
      makeEntry('mod-1', '2026-06-28', { done: true }),
      makeEntry('mod-1', '2026-06-28', { done: true }),
    ]
    const grid = buildGridData([mod], entries, '2026-06-28')
    expect(grid.cells[0][0].state).toBe('done')
    // Streak counts the day once regardless of how many entries logged that day.
    const stats = computeColumnStats(grid.cells[0], grid.dates, '2026-06-28')
    expect(stats.currentStreak).toBe(1)
  })

  it('duplicate same-day entries, same category value → deterministic done cell (no ambiguity when values agree)', () => {
    const mod = makeMod({
      id: 'mod-1',
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    const entries = [
      makeEntry('mod-1', '2026-06-28', { session_type: 'Lift' }),
      makeEntry('mod-1', '2026-06-28', { session_type: 'Lift' }),
    ]
    const grid = buildGridData([mod], entries, '2026-06-28')
    expect(grid.cells[0][0].state).toBe('done')
    expect(grid.cells[0][0].crystalOverride).toBe('amethyst')
  })

  it('same-day category conflict resolves by entry_date creation order (created_at), not raw array/query order', () => {
    // Two entries logged the same calendar day with DIFFERENT category values.
    // The spec says "most-recent-entry wins" (chronologically), not "whatever
    // order the DB query happened to return rows in." The caller
    // (app/(app)/dashboard/page.tsx) issues an unordered `.select()` — Postgres
    // gives no ordering guarantee without ORDER BY — so if buildGridData just
    // pushes entries in array-arrival order, the winning category becomes
    // nondeterministic per the brief's explicit bug carve-out. Pin that
    // buildGridData resolves ties by created_at regardless of input array order.
    const mod = makeMod({
      id: 'mod-1',
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    const earlier = { ...makeEntry('mod-1', '2026-06-28', { session_type: 'Lift' }), id: 'e-a', created_at: '2026-06-28T08:00:00Z' }
    const later = { ...makeEntry('mod-1', '2026-06-28', { session_type: 'Rest' }), id: 'e-b', created_at: '2026-06-28T20:00:00Z' }

    // Array order: chronologically-later entry arrives FIRST in the input array
    // (simulating unordered DB row order not matching created_at order).
    const gridReversed = buildGridData([mod], [later, earlier], '2026-06-28')
    // Array order: chronologically-later entry arrives LAST (natural order).
    const gridNatural = buildGridData([mod], [earlier, later], '2026-06-28')

    // Both must agree: the chronologically most recent entry (Rest, 20:00) wins,
    // regardless of array order.
    expect(gridReversed.cells[0][0].categoryLabel).toBe('Rest')
    expect(gridNatural.cells[0][0].categoryLabel).toBe('Rest')
    expect(gridReversed.cells[0][0].crystalOverride).toBe(gridNatural.cells[0][0].crystalOverride)
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

  it('gradient mode auto-fit range is unaffected by a day whose only entry has a non-numeric gradient value (F-07)', () => {
    const mod = makeMod({
      id: 'mod-1',
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const entries = [
      makeEntry('mod-1', '2026-06-28', { score: 10 }),
      makeEntry('mod-1', '2026-06-27', { score: 20 }),
      // A non-numeric day: must NOT drag the auto-fit min down to 0.
      makeEntry('mod-1', '2026-06-26', { score: 'abc' }),
    ]
    const grid = buildGridData([mod], entries, '2026-06-28')
    const cell28 = grid.cells[0][0]
    const cell27 = grid.cells[0][1]
    const cell26 = grid.cells[0][2]
    // Range should still be [10, 20], not [0, 20] — the non-numeric day contributes nothing.
    expect(cell28.intensity).toBeCloseTo(0)
    expect(cell27.intensity).toBeCloseTo(1)
    // The non-numeric day itself renders as no-data, not a phantom 0.
    expect(cell26.state).toBe('not-done')
    expect(cell26.rawValue).toBeUndefined()
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
