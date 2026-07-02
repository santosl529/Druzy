import type { Entry, Module, ModuleField, ChartConfig, ChartFilter, BucketBy, Aggregation } from './types'
import { todayInTimezone, daysAgoInTimezone } from './date'

// ----------------------------------------------------------------
// Output shapes
// ----------------------------------------------------------------

export interface TimeSeriesPoint {
  date: string
  value: number
}

export interface ScatterPoint {
  x: number
  y: number
  date: string
}

export interface PieSlice {
  name: string
  value: number
}

export interface HistogramBin {
  range: string
  count: number
}

export interface StackedBarPoint {
  date: string
  [key: string]: string | number
}

/** One joined row for a multi-series chart; series keys are 's0', 's1', … */
export interface MultiSeriesRow {
  date: string
  [seriesKey: string]: string | number | null
}

export interface SeriesMeta {
  key: string
  name: string
  color: string
  yAxis: 'left' | 'right'
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function getBucketKey(dateStr: string, bucketBy: BucketBy): string {
  const d = new Date(dateStr + 'T00:00:00Z') // parse as UTC to avoid timezone shifts
  switch (bucketBy) {
    case 'day':   return dateStr
    case 'week': {
      const day = d.getUTCDay()
      const diff = day === 0 ? -6 : 1 - day // shift to Monday
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() + diff)
      return monday.toISOString().split('T')[0]
    }
    case 'month': return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
    case 'year':  return `${d.getUTCFullYear()}-01-01`
    default:      return dateStr
  }
}

export function applyAggregation(values: number[], agg: Aggregation = 'none'): number {
  if (values.length === 0) return 0
  switch (agg) {
    case 'sum':    return values.reduce((a, b) => a + b, 0)
    case 'avg':    return values.reduce((a, b) => a + b, 0) / values.length
    case 'count':  return values.length
    case 'min':    return Math.min(...values)
    case 'max':    return Math.max(...values)
    case 'median': {
      const s = [...values].sort((a, b) => a - b)
      const m = Math.floor(s.length / 2)
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
    }
    default: return values[values.length - 1] // 'none' → last value in group
  }
}

function matchesFilter(vals: Record<string, unknown>, f: ChartFilter): boolean {
  const val = vals[f.field]
  switch (f.op) {
    case 'eq':       return val == f.value
    case 'neq':      return val != f.value
    case 'gt':       return Number(val) > Number(f.value)
    case 'gte':      return Number(val) >= Number(f.value)
    case 'lt':       return Number(val) < Number(f.value)
    case 'lte':      return Number(val) <= Number(f.value)
    case 'contains': return String(val ?? '').toLowerCase().includes(String(f.value).toLowerCase())
    default:         return true
  }
}

// ----------------------------------------------------------------
// Preprocessing
// ----------------------------------------------------------------

/**
 * Apply dateRange + filters from config. Always call before rendering.
 * `timezone` governs relative windows like "last N days" so they line up with
 * the user's day-boundary timezone (defaults to UTC when not supplied).
 */
function getFilteredEntries(entries: Entry[], config: ChartConfig, timezone = 'UTC'): Entry[] {
  let result = entries

  // Date range
  const dr = config.dateRange
  if (dr && dr.type !== 'all') {
    if (dr.type === 'last_n_days' && dr.n) {
      const cutoffStr = daysAgoInTimezone(dr.n, timezone)
      result = result.filter((e) => e.entry_date >= cutoffStr)
    } else if (dr.type === 'custom') {
      if (dr.start) result = result.filter((e) => e.entry_date >= dr.start!)
      if (dr.end)   result = result.filter((e) => e.entry_date <= dr.end!)
    }
  }

  // Row filters
  if (config.filters?.length) {
    result = result.filter((e) => {
      const vals = e.values as Record<string, unknown>
      return config.filters!.every((f) => matchesFilter(vals, f))
    })
  }

  return result
}

// ----------------------------------------------------------------
// Per-chart-type data prep
// All functions accept the full ChartConfig and read what they need.
// ----------------------------------------------------------------

export function getTimeSeries(entries: Entry[], config: ChartConfig, timezone = 'UTC'): TimeSeriesPoint[] {
  const field = config.series[0]?.field
  if (!field) return []

  const filtered = getFilteredEntries(entries, config, timezone)
  const bucketBy = config.bucketBy ?? 'none'
  const aggregation = config.aggregation ?? 'none'
  const dailyAggregation = config.dailyAggregation
  const fillForward = config.fillForward ?? false

  // ── Stage 1: optionally collapse multiple entries per calendar day ──────────
  // When dailyAggregation is set, reduce all entries on the same date to a
  // single value before any outer bucketing. This enables "sum per day, then
  // average per week" patterns that a single aggregation pass can't express.
  // When dailyAggregation is omitted, work directly with raw entries (existing behaviour).
  //
  // All date-based grouping reads entry_date exclusively — created_at is never
  // used for day attribution.
  let dailyPoints: TimeSeriesPoint[]

  if (dailyAggregation) {
    const byDay: Record<string, number[]> = {}
    for (const e of filtered) {
      const v = toNumber((e.values as Record<string, unknown>)[field])
      if (v !== null) {
        ;(byDay[e.entry_date] ??= []).push(v)
      }
    }
    dailyPoints = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, value: applyAggregation(values, dailyAggregation) }))
  } else {
    dailyPoints = [...filtered]
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .flatMap((e) => {
        const value = toNumber((e.values as Record<string, unknown>)[field])
        return value !== null ? [{ date: e.entry_date, value }] : []
      })
  }

  // ── Stage 2: outer bucketing + aggregation (or plot each point directly) ────
  if (bucketBy === 'none') {
    if (!fillForward) return dailyPoints

    // Fill-forward: carry last value across days with no entry
    const valueByDate: Record<string, number> = {}
    for (const { date, value } of dailyPoints) {
      valueByDate[date] = value
    }
    if (dailyPoints.length === 0) return []

    const today = todayInTimezone(timezone)
    const result: TimeSeriesPoint[] = []
    let last: number | null = null
    const cursor = new Date(dailyPoints[0].date + 'T00:00:00Z')
    const end = new Date(today + 'T00:00:00Z')

    while (cursor <= end) {
      const ds = cursor.toISOString().split('T')[0]
      if (valueByDate[ds] !== undefined) last = valueByDate[ds]
      if (last !== null) result.push({ date: ds, value: last })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return result
  }

  // Bucketed: group dailyPoints by bucket key, apply outer aggregation
  const bucketMap: Record<string, number[]> = {}
  for (const { date, value } of dailyPoints) {
    const key = getBucketKey(date, bucketBy)
    ;(bucketMap[key] ??= []).push(value)
  }

  return Object.entries(bucketMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, value: applyAggregation(values, aggregation) }))
}

/** Default palette for series without an explicit color (matches recharts-charts COLORS). */
export const SERIES_COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
]

/**
 * Build joined rows for a chart with 2+ series, possibly across modules.
 * Each series is computed independently via getTimeSeries (so dateRange,
 * bucketBy, aggregation, and fillForward apply per series), then full
 * outer-joined by date. Dates where a series has no data stay null —
 * values are never fabricated.
 */
export function getMultiSeriesData(
  config: ChartConfig,
  entriesByModule: Map<string, Entry[]>,
  modulesById: Map<string, Module>,
  timezone = 'UTC'
): { rows: MultiSeriesRow[]; series: SeriesMeta[] } {
  const seriesMeta: SeriesMeta[] = []
  const perSeriesPoints: TimeSeriesPoint[][] = []

  config.series.forEach((s, i) => {
    const mod = modulesById.get(s.moduleId)
    const field = mod?.fields.find((f) => f.key === s.field)
    const entries = entriesByModule.get(s.moduleId) ?? []

    const singleConfig: ChartConfig = { ...config, series: [s] }
    // Missing module/entries (e.g. dangling reference) yields an empty series.
    perSeriesPoints.push(mod ? getTimeSeries(entries, singleConfig, timezone) : [])

    seriesMeta.push({
      key: `s${i}`,
      name: s.label ?? field?.label ?? s.field,
      color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
      yAxis: s.yAxis ?? 'left',
    })
  })

  const valueMaps = perSeriesPoints.map(
    (points) => new Map(points.map((p) => [p.date, p.value]))
  )
  const allDates = [...new Set(perSeriesPoints.flat().map((p) => p.date))].sort()

  const rows: MultiSeriesRow[] = allDates.map((date) => {
    const row: MultiSeriesRow = { date }
    valueMaps.forEach((map, i) => {
      row[`s${i}`] = map.get(date) ?? null
    })
    return row
  })

  return { rows, series: seriesMeta }
}

export function getScatterData(entries: Entry[], config: ChartConfig, timezone = 'UTC'): ScatterPoint[] {
  const xField = config.series[0]?.field
  const yField = config.series[1]?.field
  if (!xField || !yField) return []

  return getFilteredEntries(entries, config, timezone).flatMap((e) => {
    const vals = e.values as Record<string, unknown>
    const x = toNumber(vals[xField])
    const y = toNumber(vals[yField])
    return x !== null && y !== null ? [{ x, y, date: e.entry_date }] : []
  })
}

export function getPieData(entries: Entry[], config: ChartConfig, timezone = 'UTC'): PieSlice[] {
  const field = config.series[0]?.field
  if (!field) return []

  const counts: Record<string, number> = {}
  for (const e of getFilteredEntries(entries, config, timezone)) {
    const val = String((e.values as Record<string, unknown>)[field] ?? 'Unknown')
    counts[val] = (counts[val] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export function getHistogramData(entries: Entry[], config: ChartConfig, numBins = 8, timezone = 'UTC'): HistogramBin[] {
  const field = config.series[0]?.field
  if (!field) return []

  const values = getFilteredEntries(entries, config, timezone).flatMap((e) => {
    const v = toNumber((e.values as Record<string, unknown>)[field])
    return v !== null ? [v] : []
  })
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [{ range: String(min), count: values.length }]

  const binWidth = (max - min) / numBins
  const bins: HistogramBin[] = Array.from({ length: numBins }, (_, i) => ({
    range: `${(min + i * binWidth).toFixed(1)}–${(min + (i + 1) * binWidth).toFixed(1)}`,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), numBins - 1)
    bins[idx].count++
  }
  return bins
}

export function getStackedBarData(
  entries: Entry[],
  config: ChartConfig,
  numericFields: ModuleField[],
  timezone = 'UTC'
): StackedBarPoint[] {
  return [...getFilteredEntries(entries, config, timezone)]
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .map((e) => {
      const vals = e.values as Record<string, unknown>
      const point: StackedBarPoint = { date: e.entry_date }
      for (const f of numericFields) {
        point[f.key] = toNumber(vals[f.key]) ?? 0
      }
      return point
    })
}

export function getCalendarData(entries: Entry[], config: ChartConfig, timezone = 'UTC'): Record<string, number> {
  const field = config.series[0]?.field ?? null
  const map: Record<string, number> = {}

  const filtered = getFilteredEntries(entries, config, timezone)

  if (!field) {
    // No field selected: classic activity heatmap (count entries per day).
    for (const e of filtered) {
      map[e.entry_date] = (map[e.entry_date] ?? 0) + 1
    }
    return map
  }

  // Treat the field as boolean when every logged value for it is a boolean
  // (true/false), so the heatmap is binary: a day is "on" (1) if any entry that
  // day is true, otherwise "off" (0). This keeps true days at full intensity
  // instead of being scaled down relative to busier multi-true days.
  const present = filtered
    .map((e) => (e.values as Record<string, unknown>)[field])
    .filter((v) => v !== null && v !== undefined && v !== '')
  const isBoolean =
    present.length > 0 &&
    present.every((v) => typeof v === 'boolean' || v === 'true' || v === 'false')

  for (const e of filtered) {
    const raw = (e.values as Record<string, unknown>)[field]
    if (isBoolean) {
      const truthy = raw === true || raw === 'true' ? 1 : 0
      map[e.entry_date] = Math.max(map[e.entry_date] ?? 0, truthy)
    } else {
      // Numeric field: sum per day. Non-numeric: count entries (default 1).
      map[e.entry_date] = (map[e.entry_date] ?? 0) + (toNumber(raw) ?? 1)
    }
  }
  return map
}

/** Returns entries sorted/filtered for the 'list' chart type. */
export function getListData(entries: Entry[], config: ChartConfig, timezone = 'UTC'): Entry[] {
  let result = getFilteredEntries(entries, config, timezone)

  const sortField = config.sort?.field ?? config.displayField ?? 'entry_date'
  const dir = config.sort?.direction ?? 'desc'

  result = [...result].sort((a, b) => {
    const av = sortField === 'entry_date'
      ? a.entry_date
      : String((a.values as Record<string, unknown>)[sortField] ?? '')
    const bv = sortField === 'entry_date'
      ? b.entry_date
      : String((b.values as Record<string, unknown>)[sortField] ?? '')
    return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  return result
}

// ----------------------------------------------------------------
// Helpers used externally (e.g. ModuleChart, dashboard)
// ----------------------------------------------------------------

