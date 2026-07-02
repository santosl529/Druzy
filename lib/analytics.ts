import type { Entry } from './types'
import { todayInTimezone, isoDate } from './date'

// ----------------------------------------------------------------
// Output shapes
// ----------------------------------------------------------------

export interface SummaryResult {
  operation: 'summary'
  count: number
  avg: number
  min: number
  max: number
  total: number
  stdDev: number
  lastValue: number | null
  lastDate: string | null
  firstDate: string | null
}

export interface TrendResult {
  operation: 'trend'
  count: number
  direction: 'up' | 'down' | 'flat'
  percentChange: number | null
  slope: number // change per day
  firstValue: number | null
  lastValue: number | null
  firstDate: string | null
  lastDate: string | null
}

export interface CorrelationResult {
  operation: 'correlation'
  coefficient: number
  strength: 'strong' | 'moderate' | 'weak' | 'negligible'
  direction: 'positive' | 'negative' | 'none'
  count: number
}

export interface StreakResult {
  operation: 'streak'
  currentStreak: number
  longestStreak: number
  lastLoggedDate: string | null
  totalDaysLogged: number
}

export type AnalyticsResult = SummaryResult | TrendResult | CorrelationResult | StreakResult

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function extractValues(entries: Entry[], field: string): Array<{ date: string; value: number }> {
  return entries
    .flatMap((e) => {
      const v = toNumber((e.values as Record<string, unknown>)[field])
      return v !== null ? [{ date: e.entry_date, value: v }] : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ----------------------------------------------------------------
// computeSummary
// ----------------------------------------------------------------

export function computeSummary(entries: Entry[], field: string): SummaryResult {
  const points = extractValues(entries, field)

  if (points.length === 0) {
    return {
      operation: 'summary',
      count: 0,
      avg: 0,
      min: 0,
      max: 0,
      total: 0,
      stdDev: 0,
      lastValue: null,
      lastDate: null,
      firstDate: null,
    }
  }

  const values = points.map((p) => p.value)
  const count = values.length
  const total = values.reduce((a, b) => a + b, 0)
  const avg = total / count
  const min = Math.min(...values)
  const max = Math.max(...values)
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / count
  const stdDev = Math.sqrt(variance)

  return {
    operation: 'summary',
    count,
    avg: round(avg),
    min,
    max,
    total: round(total),
    stdDev: round(stdDev),
    lastValue: points[points.length - 1].value,
    lastDate: points[points.length - 1].date,
    firstDate: points[0].date,
  }
}

// ----------------------------------------------------------------
// computeTrend — linear regression over time
// ----------------------------------------------------------------

export function computeTrend(entries: Entry[], field: string): TrendResult {
  const points = extractValues(entries, field)

  if (points.length === 0) {
    return {
      operation: 'trend',
      count: 0,
      direction: 'flat',
      percentChange: null,
      slope: 0,
      firstValue: null,
      lastValue: null,
      firstDate: null,
      lastDate: null,
    }
  }

  if (points.length === 1) {
    return {
      operation: 'trend',
      count: 1,
      direction: 'flat',
      percentChange: null,
      slope: 0,
      firstValue: points[0].value,
      lastValue: points[0].value,
      firstDate: points[0].date,
      lastDate: points[0].date,
    }
  }

  // Convert dates to numeric x values (days since first entry)
  const epoch = new Date(points[0].date + 'T00:00:00Z').getTime()
  const xy = points.map((p) => ({
    x: (new Date(p.date + 'T00:00:00Z').getTime() - epoch) / 86_400_000,
    y: p.value,
  }))

  const n = xy.length
  const sumX = xy.reduce((a, p) => a + p.x, 0)
  const sumY = xy.reduce((a, p) => a + p.y, 0)
  const sumXY = xy.reduce((a, p) => a + p.x * p.y, 0)
  const sumXX = xy.reduce((a, p) => a + p.x * p.x, 0)

  const denom = n * sumXX - sumX * sumX
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom

  const firstValue = points[0].value
  const lastValue = points[points.length - 1].value

  const percentChange =
    firstValue === 0 ? null : round(((lastValue - firstValue) / Math.abs(firstValue)) * 100)

  const FLAT_THRESHOLD = 0.001
  const direction: 'up' | 'down' | 'flat' =
    Math.abs(slope) < FLAT_THRESHOLD ? 'flat' : slope > 0 ? 'up' : 'down'

  return {
    operation: 'trend',
    count: n,
    direction,
    percentChange,
    slope: round(slope, 4),
    firstValue,
    lastValue,
    firstDate: points[0].date,
    lastDate: points[points.length - 1].date,
  }
}

// ----------------------------------------------------------------
// computeCorrelation — Pearson r, joined by entry_date
// ----------------------------------------------------------------

export function computeCorrelation(
  entriesA: Entry[],
  fieldA: string,
  entriesB: Entry[],
  fieldB: string
): CorrelationResult {
  const mapA = new Map(extractValues(entriesA, fieldA).map((p) => [p.date, p.value]))
  const mapB = new Map(extractValues(entriesB, fieldB).map((p) => [p.date, p.value]))

  // Only dates where both series have a value
  const pairs: Array<{ a: number; b: number }> = []
  for (const [date, a] of mapA) {
    const b = mapB.get(date)
    if (b !== undefined) pairs.push({ a, b })
  }

  if (pairs.length < 2) {
    return {
      operation: 'correlation',
      coefficient: 0,
      strength: 'negligible',
      direction: 'none',
      count: pairs.length,
    }
  }

  const n = pairs.length
  const meanA = pairs.reduce((s, p) => s + p.a, 0) / n
  const meanB = pairs.reduce((s, p) => s + p.b, 0) / n

  let num = 0, denA = 0, denB = 0
  for (const { a, b } of pairs) {
    num += (a - meanA) * (b - meanB)
    denA += (a - meanA) ** 2
    denB += (b - meanB) ** 2
  }

  const coefficient = denA === 0 || denB === 0 ? 0 : num / Math.sqrt(denA * denB)
  const r = round(coefficient, 3)
  const abs = Math.abs(r)

  const strength: CorrelationResult['strength'] =
    abs >= 0.7 ? 'strong' : abs >= 0.4 ? 'moderate' : abs >= 0.2 ? 'weak' : 'negligible'

  const direction: CorrelationResult['direction'] =
    abs < 0.2 ? 'none' : r > 0 ? 'positive' : 'negative'

  return { operation: 'correlation', coefficient: r, strength, direction, count: n }
}

// ----------------------------------------------------------------
// computeStreak — consecutive calendar days with at least one entry
// ----------------------------------------------------------------

export function computeStreak(entries: Entry[], timezone = 'UTC'): StreakResult {
  if (entries.length === 0) {
    return {
      operation: 'streak',
      currentStreak: 0,
      longestStreak: 0,
      lastLoggedDate: null,
      totalDaysLogged: 0,
    }
  }

  // Unique dates, sorted ascending
  const dates = [...new Set(entries.map((e) => e.entry_date))].sort()

  let longestStreak = 1
  let currentRun = 1

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00Z')
    const curr = new Date(dates[i] + 'T00:00:00Z')
    const diffDays = (curr.getTime() - prev.getTime()) / 86_400_000

    if (diffDays === 1) {
      currentRun++
      longestStreak = Math.max(longestStreak, currentRun)
    } else {
      currentRun = 1
    }
  }

  // Current streak: count backwards from today (in the user's day-boundary tz)
  const today = todayInTimezone(timezone)
  const yesterday = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return isoDate(d)
  })()

  const lastDate = dates[dates.length - 1]
  let currentStreak = 0

  // Active streak if last entry was today or yesterday
  if (lastDate === today || lastDate === yesterday) {
    currentStreak = 1
    for (let i = dates.length - 2; i >= 0; i--) {
      const prev = new Date(dates[i] + 'T00:00:00Z')
      const next = new Date(dates[i + 1] + 'T00:00:00Z')
      const diffDays = (next.getTime() - prev.getTime()) / 86_400_000
      if (diffDays === 1) {
        currentStreak++
      } else {
        break
      }
    }
  }

  return {
    operation: 'streak',
    currentStreak,
    longestStreak,
    lastLoggedDate: lastDate,
    totalDaysLogged: dates.length,
  }
}

// ----------------------------------------------------------------
// Utility
// ----------------------------------------------------------------

function round(n: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}
