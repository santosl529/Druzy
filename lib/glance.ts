// ----------------------------------------------------------------
// At a glance — the stat tiles on a tracker's detail page.
//
// Pure computation over a module's entries for a trailing window ending today
// (already resolved in the user's day-boundary timezone): per-field daily
// averages, goal hit rate, and the logging streak, each with a small per-day
// bar series and a few supporting facts for the expanded tile.
// ----------------------------------------------------------------

import { evaluateGoal } from './consistency-grid'
import { addDaysISO, formatDisplayDate } from './date'
import type { CardEntry } from './card-summary'
import type { Module, ModuleField } from './types'

export type GlanceRange = number | 'all'

export interface GlanceTile {
  key: string
  /** Full label, e.g. "Avg Calories · 30 days". */
  label: string
  /** Label without the window, for the collapsed chip. */
  short: string
  value: string
  unit?: string
  /** One value per day (oldest → today), normalized 0–1; null = nothing logged. */
  bars: (number | null)[]
  /** Goal threshold on the bars' 0–1 scale, when the tile has one. */
  goalLine?: number
  /** Change against the previous window of the same length. */
  delta?: string
  facts: { k: string; v: string }[]
}

/** Most bars a tile draws; longer windows are averaged into buckets. */
const MAX_BARS = 90

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })
const shortDate = (d: string) => formatDisplayDate(d, { month: 'short', day: 'numeric' })

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Consecutive logged days ending today (or yesterday, if today isn't logged yet). */
export function currentStreak(logged: Set<string>, today: string): number {
  let day = logged.has(today) ? today : addDaysISO(today, -1)
  let n = 0
  while (logged.has(day)) {
    n++
    day = addDaysISO(day, -1)
  }
  return n
}

/** Longest run of consecutive logged days. */
export function longestStreak(logged: Set<string>): number {
  let best = 0
  for (const d of logged) {
    if (logged.has(addDaysISO(d, -1))) continue // not the start of a run
    let n = 1
    while (logged.has(addDaysISO(d, n))) n++
    best = Math.max(best, n)
  }
  return best
}

/** Averages a long series into at most `max` buckets (nulls ignored). */
function bucket(values: (number | null)[], max: number): (number | null)[] {
  if (values.length <= max) return values
  const size = Math.ceil(values.length / max)
  const out: (number | null)[] = []
  for (let i = 0; i < values.length; i += size) {
    const chunk = values.slice(i, i + size).filter((v): v is number => v !== null)
    out.push(chunk.length ? chunk.reduce((a, b) => a + b, 0) / chunk.length : null)
  }
  return out
}

function normalize(values: (number | null)[], max: number): (number | null)[] {
  return values.map((v) => (v === null ? null : max > 0 ? v / max : 0))
}

/** The window's dates, oldest → today. */
function windowDates(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDaysISO(today, i - days + 1))
}

function numericFields(mod: Module): ModuleField[] {
  if (mod.kind === 'formula') return [{ key: 'value', label: 'Value', type: 'number', required: false }]
  return mod.fields.filter((f) => f.type === 'number' || f.type === 'rating')
}

export function computeGlanceTiles(
  mod: Module,
  entries: CardEntry[],
  today: string,
  range: GlanceRange,
): GlanceTile[] {
  const byDay = new Map<string, Record<string, unknown>[]>()
  let earliest = today
  for (const e of entries) {
    if (e.entry_date > today) continue
    const list = byDay.get(e.entry_date) ?? []
    list.push(e.values)
    byDay.set(e.entry_date, list)
    if (e.entry_date < earliest) earliest = e.entry_date
  }

  const days =
    range === 'all'
      ? Math.max(1, Math.round((Date.parse(today) - Date.parse(earliest)) / 86_400_000) + 1)
      : range
  const windowLabel = range === 'all' ? 'all time' : `${days} days`
  const dates = windowDates(today, days)
  const prevDates = range === 'all' ? [] : windowDates(addDaysISO(today, -days), days)
  const loggedInWindow = dates.filter((d) => byDay.has(d)).length

  const tiles: GlanceTile[] = []

  // Per-field daily average (sum per day for numbers, mean per day for ratings).
  for (const f of numericFields(mod).slice(0, 2)) {
    const daily = (d: string): number | null => {
      const vals = (byDay.get(d) ?? []).map((v) => toNumber(v[f.key])).filter((n): n is number => n !== null)
      if (vals.length === 0) return null
      const sum = vals.reduce((a, b) => a + b, 0)
      return f.type === 'rating' ? sum / vals.length : sum
    }
    const series = dates.map(daily)
    const present = series.filter((v): v is number => v !== null)
    if (present.length === 0) continue
    const avg = present.reduce((a, b) => a + b, 0) / present.length
    const max = Math.max(...present)
    const unitSuffix = f.unit ? ` ${f.unit}` : ''

    let best = { d: '', v: -Infinity }
    let low = { d: '', v: Infinity }
    series.forEach((v, i) => {
      if (v === null) return
      if (v > best.v) best = { d: dates[i], v }
      if (v < low.v) low = { d: dates[i], v }
    })

    let delta: string | undefined
    const prev = prevDates.map(daily).filter((v): v is number => v !== null)
    if (prev.length > 0) {
      const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length
      if (prevAvg !== 0) {
        const pct = Math.round(((avg - prevAvg) / Math.abs(prevAvg)) * 100)
        delta = `${pct >= 0 ? '+' : ''}${pct}% vs previous ${days} days`
      }
    }

    tiles.push({
      key: `avg:${f.key}`,
      label: `Avg ${f.label} · ${windowLabel}`,
      short: `Avg ${f.label}`,
      value: fmt(avg >= 100 ? Math.round(avg) : avg),
      unit: f.unit,
      bars: bucket(normalize(series, max), MAX_BARS),
      delta,
      facts: [
        { k: 'Best day', v: `${fmt(best.v)}${unitSuffix} · ${shortDate(best.d)}` },
        { k: 'Lowest day', v: `${fmt(low.v)}${unitSuffix} · ${shortDate(low.d)}` },
        { k: 'Days logged', v: `${loggedInWindow} of ${days}` },
      ],
    })
  }

  // Goal hit rate, when the tracker has one.
  const goal = mod.dashboard_config?.mode === 'goal' ? mod.dashboard_config.goal : undefined
  if (goal) {
    const hits = dates.map((d) => {
      const day = byDay.get(d)
      return day ? (evaluateGoal(goal, day) ? 1 : 0) : null
    })
    const met = hits.filter((h) => h === 1).length
    tiles.push({
      key: 'goal',
      label: `Goal met · ${windowLabel}`,
      short: 'Goal met',
      value: fmt(met),
      unit: `of ${days} days`,
      bars: bucket(hits, MAX_BARS),
      facts: [
        { k: 'Hit rate on logged days', v: loggedInWindow ? `${Math.round((met / loggedInWindow) * 100)}%` : '—' },
        { k: 'Days logged', v: `${loggedInWindow} of ${days}` },
      ],
    })
  }

  // Logging streak.
  const logged = new Set(byDay.keys())
  const lastLogged = [...logged].sort().pop()
  tiles.push({
    key: 'streak',
    label: 'Current streak',
    short: 'Streak',
    value: fmt(currentStreak(logged, today)),
    unit: 'days',
    bars: bucket(dates.map((d) => (byDay.has(d) ? 1 : 0)), MAX_BARS),
    facts: [
      { k: 'Best streak', v: `${longestStreak(logged)} days` },
      { k: 'Days logged', v: `${loggedInWindow} of ${days}` },
      { k: 'Last logged', v: lastLogged ? shortDate(lastLogged) : 'Never' },
    ],
  })

  return tiles.slice(0, 4)
}
