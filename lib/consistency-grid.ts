import type { DashboardConfig, DashboardMode, GoalCondition, GoalConfig, Module, Entry } from './types'
import { getBinaryField } from './card'

// ----------------------------------------------------------------
// Output types
// ----------------------------------------------------------------

export type CellState = 'done' | 'not-done' | 'inactive'

export interface GridCell {
  state: CellState
  /** 0–1: always 1 for binary done, 0 for not-done; varies for gradient. */
  intensity: number
  /** The day's summed field value (gradient mode only, for hover display). */
  rawValue?: number
}

export interface GridData {
  modules: Module[]
  /** All dates in descending order (newest first, oldest last). */
  dates: string[]
  /**
   * cells[moduleIndex][dateIndex] — parallel to `modules` and `dates`.
   * dateIndex 0 = today, dateIndex 1 = yesterday, etc.
   */
  cells: GridCell[][]
}

export interface ColumnStats {
  currentStreak: number
  longestStreak: number
  /** Percentage of active (non-inactive) days that are done. 0–100, integer. */
  completionPct: number
}

// ----------------------------------------------------------------
// Goal evaluation
// ----------------------------------------------------------------

export function evaluateCondition(condition: GoalCondition, value: number): boolean {
  switch (condition.op) {
    case 'gte': return value >= condition.value!
    case 'lte': return value <= condition.value!
    case 'eq': return value === condition.value!
    case 'between': return value >= condition.min! && value <= condition.max!
  }
}

/**
 * Evaluates a goal against all entries for a single day.
 * Multi-entry fields are summed (e.g. calories across multiple meals).
 * Returns false when no entries exist.
 */
export function evaluateGoal(
  goal: GoalConfig,
  dayEntries: Record<string, unknown>[],
): boolean {
  if (dayEntries.length === 0) return false
  return goal.conditions.every((cond) => {
    const total = dayEntries.reduce((sum, entry) => {
      const v = Number(entry[cond.field])
      return isNaN(v) ? sum : sum + v
    }, 0)
    return evaluateCondition(cond, total)
  })
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function getEffectiveMode(mod: Module, config: DashboardConfig | null): DashboardMode {
  if (config?.mode) return config.mode
  // Formula modules default to gradient (they always produce a numeric value).
  if (mod.kind === 'formula') return 'gradient'
  return 'binary'
}

function getFirstNumericFieldKey(mod: Module): string | null {
  // Formula modules expose their computed output as the 'value' field.
  if (mod.kind === 'formula') return 'value'
  const f = mod.fields.find((f) => f.type === 'number' || f.type === 'rating')
  return f?.key ?? null
}

// ----------------------------------------------------------------
// Cell state
// ----------------------------------------------------------------

/**
 * Compute the grid cell state for one module on one day.
 *
 * @param mod           - The module (includes dashboard_config and fields).
 * @param dayEntries    - entries.values[] for entries logged on this day for this module.
 * @param date          - The day (YYYY-MM-DD).
 * @param gradientRange - Normalization range for gradient mode.
 *                        Pass null to produce intensity=0 (caller handles auto-fit).
 */
export function computeCellState(
  mod: Module,
  dayEntries: Record<string, unknown>[],
  date: string,
  gradientRange: { min: number; max: number } | null,
): GridCell {
  // Days before the module existed are inactive (not failures).
  const createdDate = mod.created_at.split('T')[0]
  if (date < createdDate) return { state: 'inactive', intensity: 0 }

  const config = mod.dashboard_config
  const mode = getEffectiveMode(mod, config)

  if (dayEntries.length === 0) {
    return { state: 'not-done', intensity: 0 }
  }

  switch (mode) {
    case 'binary': {
      const binaryField = getBinaryField(mod)
      if (binaryField) {
        // Single-boolean module: check the boolean value in any entry.
        const done = dayEntries.some((e) => e[binaryField.key] === true)
        return { state: done ? 'done' : 'not-done', intensity: done ? 1 : 0 }
      }
      // Multi-field module: any logged entry = done.
      return { state: 'done', intensity: 1 }
    }

    case 'goal': {
      if (!config?.goal) return { state: 'done', intensity: 1 }
      const done = evaluateGoal(config.goal, dayEntries)
      return { state: done ? 'done' : 'not-done', intensity: done ? 1 : 0 }
    }

    case 'gradient': {
      const fieldKey = config?.gradientField ?? getFirstNumericFieldKey(mod)
      if (!fieldKey) return { state: 'done', intensity: 1 }
      const rawValue = dayEntries.reduce((sum, e) => {
        const v = Number(e[fieldKey])
        return isNaN(v) ? sum : sum + v
      }, 0)
      if (!gradientRange || gradientRange.max <= gradientRange.min) {
        return { state: 'done', intensity: 0.5, rawValue }
      }
      const intensity = Math.min(
        1,
        Math.max(0, (rawValue - gradientRange.min) / (gradientRange.max - gradientRange.min)),
      )
      return { state: 'done', intensity, rawValue }
    }
  }
}

// ----------------------------------------------------------------
// Grid data builder
// ----------------------------------------------------------------

/**
 * Build the full grid data from modules and entries.
 * All computation runs in O(entries + modules × dates) — no nested loops over entries.
 *
 * @param modules - All user modules (standard + formula; formula entries must already
 *                  be computed via withFormulaEntries before calling this).
 * @param entries - All entries in the display window (pre-computed formula entries included).
 * @param today   - The current date (YYYY-MM-DD, day-boundary timezone resolved server-side).
 */
export function buildGridData(modules: Module[], entries: Entry[], today: string): GridData {
  if (modules.length === 0) return { modules: [], dates: [today], cells: [] }

  // 1. Build index: moduleId → date → values[]
  const index = new Map<string, Map<string, Record<string, unknown>[]>>()
  let earliest = today
  for (const e of entries) {
    let byDate = index.get(e.module_id)
    if (!byDate) { byDate = new Map(); index.set(e.module_id, byDate) }
    const day = byDate.get(e.entry_date) ?? []
    day.push(e.values as Record<string, unknown>)
    byDate.set(e.entry_date, day)
    if (e.entry_date < earliest) earliest = e.entry_date
  }

  // Extend the date range back to one day before each module's creation date,
  // so the inactive zone boundary is visible in the grid. We cap how far back
  // we'll extend at MAX_LOOKBACK_DAYS to prevent old modules from expanding
  // the window back years (beyond what's useful to display).
  const MAX_LOOKBACK_DAYS = 60
  const lookbackFloor = new Date(today + 'T00:00:00Z')
  lookbackFloor.setUTCDate(lookbackFloor.getUTCDate() - MAX_LOOKBACK_DAYS)
  const lookbackFloorStr = lookbackFloor.toISOString().split('T')[0]
  for (const mod of modules) {
    const created = mod.created_at.split('T')[0]
    const dayBeforeCreation = new Date(created + 'T00:00:00Z')
    dayBeforeCreation.setUTCDate(dayBeforeCreation.getUTCDate() - 1)
    const dayBefore = dayBeforeCreation.toISOString().split('T')[0]
    // Only extend the window if the module was created recently enough
    // (i.e., within MAX_LOOKBACK_DAYS of today). Old modules' inactive zones
    // are not shown beyond the lookback window.
    if (dayBefore >= lookbackFloorStr && dayBefore < earliest) earliest = dayBefore
  }

  // 2. Generate descending date list from today back to earliest
  const dates: string[] = []
  const cursor = new Date(today + 'T00:00:00Z')
  const end = new Date(earliest + 'T00:00:00Z')
  while (cursor >= end) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  // 3. Compute gradient ranges (auto-fit per module, using configured range if set)
  const gradientRanges = new Map<string, { min: number; max: number }>()
  for (const mod of modules) {
    const config = mod.dashboard_config
    if (config?.gradientRange) {
      gradientRanges.set(mod.id, config.gradientRange)
      continue
    }
    const mode = getEffectiveMode(mod, config)
    if (mode !== 'gradient') continue
    const fieldKey = config?.gradientField ?? getFirstNumericFieldKey(mod)
    if (!fieldKey) continue
    const byDate = index.get(mod.id)
    if (!byDate) continue
    let min = Infinity, max = -Infinity
    for (const dayEntries of byDate.values()) {
      const total = dayEntries.reduce((sum, e) => {
        const v = Number(e[fieldKey]); return isNaN(v) ? sum : sum + v
      }, 0)
      if (dayEntries.length > 0) { min = Math.min(min, total); max = Math.max(max, total) }
    }
    if (min <= max && isFinite(min) && isFinite(max)) gradientRanges.set(mod.id, { min, max })
  }

  // 4. Build cells[moduleIdx][dateIdx]
  const cells: GridCell[][] = modules.map((mod) => {
    const byDate = index.get(mod.id)
    const range = gradientRanges.get(mod.id) ?? null
    return dates.map((date) => {
      const dayEntries = byDate?.get(date) ?? []
      return computeCellState(mod, dayEntries, date, range)
    })
  })

  return { modules, dates, cells }
}

// ----------------------------------------------------------------
// Column statistics
// ----------------------------------------------------------------

/**
 * Compute streak and completion stats for one module column.
 * Operates over the passed cells/dates slice (caller controls the window).
 * Note: current/longest streak may be shorter than reality if the window
 * is narrower than the actual streak — acceptable for a personal tool.
 */
export function computeColumnStats(
  cells: GridCell[],
  dates: string[],  // same order as cells (descending)
  today: string,
): ColumnStats {
  if (cells.length === 0) return { currentStreak: 0, longestStreak: 0, completionPct: 0 }

  // Completion %: done / (done + not-done), excluding inactive.
  const activeCells = cells.filter((c) => c.state !== 'inactive')
  const doneCells = cells.filter((c) => c.state === 'done')
  const completionPct =
    activeCells.length > 0 ? Math.round((doneCells.length / activeCells.length) * 100) : 0

  // Build a Set of done dates for streak computation.
  const doneDateSet = new Set(dates.filter((_, i) => cells[i].state === 'done'))

  // Current streak: count backwards from today.
  const yesterday = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().split('T')[0]
  })()

  let currentStreak = 0
  if (doneDateSet.has(today) || doneDateSet.has(yesterday)) {
    const start = doneDateSet.has(today) ? today : yesterday
    const cur = new Date(start + 'T00:00:00Z')
    while (doneDateSet.has(cur.toISOString().split('T')[0])) {
      currentStreak++
      cur.setUTCDate(cur.getUTCDate() - 1)
    }
  }

  // Longest streak: scan ascending done dates.
  const ascDoneDates = [...doneDateSet].sort()
  let longestStreak = ascDoneDates.length > 0 ? 1 : 0
  let runLen = ascDoneDates.length > 0 ? 1 : 0
  for (let i = 1; i < ascDoneDates.length; i++) {
    const prev = new Date(ascDoneDates[i - 1] + 'T00:00:00Z')
    const curr = new Date(ascDoneDates[i] + 'T00:00:00Z')
    const diff = (curr.getTime() - prev.getTime()) / 86_400_000
    if (diff === 1) {
      runLen++
      longestStreak = Math.max(longestStreak, runLen)
    } else {
      runLen = 1
    }
  }

  return { currentStreak, longestStreak, completionPct }
}
