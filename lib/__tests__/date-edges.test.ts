// lib/__tests__/date-edges.test.ts
// Phase 2 bug-hunt probes: date/timezone edge behavior. Passing probes are
// characterization tests that pin current edge behavior; see
// docs/superpowers/reviews/2026-07-02-phase2-findings.md for findings.
import { describe, expect, it } from 'vitest'
import { todayInTimezone, clientEffectiveTimezone, daysAgoInTimezone, addDaysISO } from '../date'
import { computeStreak } from '../analytics'
import { getTimeSeries } from '../chart-data'
import type { Entry, ChartConfig } from '../types'

// All streak fixtures use the UTC day boundary so `day(0)` matches the `today`
// that computeStreak(…, 'UTC') resolves internally.
const TODAY = todayInTimezone('UTC')
const day = (offset: number) => addDaysISO(TODAY, offset)

function makeEntry(date: string, values: Record<string, unknown> = { v: 1 }): Entry {
  return {
    id: `e-${date}-${Math.random().toString(36).slice(2, 8)}`,
    module_id: 'mod-1',
    user_id: 'u-1',
    values,
    entry_date: date,
    created_at: `${date}T10:00:00Z`,
  }
}

// ── timezone fallbacks ───────────────────────────────────────────

describe('timezone fallbacks', () => {
  it('todayInTimezone falls back to UTC for garbage tz', () => {
    expect(todayInTimezone('Not/AZone')).toBe(todayInTimezone('UTC'))
  })

  it('clientEffectiveTimezone returns a usable tz for null/undefined/empty', () => {
    for (const v of [null, undefined, '']) {
      expect(() => todayInTimezone(clientEffectiveTimezone(v))).not.toThrow()
    }
  })

  it('daysAgoInTimezone(0, tz) equals todayInTimezone(tz)', () => {
    expect(daysAgoInTimezone(0, 'America/New_York')).toBe(todayInTimezone('America/New_York'))
  })
})

// ── computeStreak edges ──────────────────────────────────────────

describe('computeStreak edges', () => {
  it('unsorted entries still yield the correct streak', () => {
    // [today, today-1] passed newest-first (not ascending)
    const result = computeStreak([makeEntry(day(0)), makeEntry(day(-1))], 'UTC')
    expect(result.currentStreak).toBe(2)
    expect(result.longestStreak).toBe(2)
  })

  it('duplicate entries on one day count once', () => {
    const result = computeStreak(
      [makeEntry(day(0)), makeEntry(day(0)), makeEntry(day(-1))],
      'UTC',
    )
    expect(result.currentStreak).toBe(2)
    expect(result.totalDaysLogged).toBe(2)
  })

  it('future-dated entry does not break the streak computation', () => {
    // e.g. client tz ahead of the day-boundary tz can produce a "tomorrow" entry
    const entries = [makeEntry(day(1)), makeEntry(day(0))]
    expect(() => computeStreak(entries, 'UTC')).not.toThrow()
    const result = computeStreak(entries, 'UTC')
    expect(result.currentStreak).toBeGreaterThanOrEqual(1)
  })

  it('gap yesterday but entry today → streak 1', () => {
    const result = computeStreak([makeEntry(day(0)), makeEntry(day(-2))], 'UTC')
    expect(result.currentStreak).toBe(1)
  })

  it('no entry today but entry yesterday → streak still counts from yesterday', () => {
    // Pins the implemented semantic: "streak alive until a full day is missed"
    // (a last entry on today OR yesterday keeps the current streak active).
    // lib/consistency-grid.ts computeColumnStats implements the same semantic,
    // and the UI copy ("Nd streak" / "Current streak") doesn't contradict it.
    const result = computeStreak([makeEntry(day(-1)), makeEntry(day(-2))], 'UTC')
    expect(result.currentStreak).toBe(2)
    expect(result.lastLoggedDate).toBe(day(-1))
  })
})

// ── weekly bucketing across a year boundary ──────────────────────

describe('getTimeSeries weekly bucketing across a year boundary', () => {
  it('Mon 2025-12-29 and Sun 2026-01-04 land in the same week bucket with a valid date label', () => {
    const config: ChartConfig = {
      chartType: 'line',
      series: [{ moduleId: 'mod-1', field: 'v' }],
      bucketBy: 'week',
      aggregation: 'sum',
    }
    const entries = [makeEntry('2025-12-29', { v: 1 }), makeEntry('2026-01-04', { v: 2 })]
    const points = getTimeSeries(entries, config, 'UTC')

    expect(points).toHaveLength(1) // same ISO week → one bucket
    expect(points[0].date).toBe('2025-12-29') // labeled by the week's Monday
    expect(points[0].value).toBe(3)
    expect(points[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(points[0].date + 'T00:00:00Z'))).toBe(false)
  })
})
