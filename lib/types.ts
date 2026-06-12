// ----------------------------------------------------------------
// Field types
// ----------------------------------------------------------------
export const FIELD_TYPES = ['text', 'number', 'date', 'rating', 'boolean', 'select', 'photo'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

// ----------------------------------------------------------------
// Chart types
// ----------------------------------------------------------------
export const CHART_TYPES = [
  'line',
  'bar',
  'area',
  'scatter',
  'pie',
  'heatmap',
  'calendar-heatmap',
  'histogram',
  'stacked-bar',
  'number-stat',
  'table',
  'list',
] as const
export type ChartType = (typeof CHART_TYPES)[number]

// ----------------------------------------------------------------
// Chart config — declarative; computation runs in app code
// ----------------------------------------------------------------

export type Aggregation = 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median'
export type BucketBy = 'none' | 'day' | 'week' | 'month' | 'year'

/** Specifies which module + field contributes data to this chart. */
export interface ChartSeries {
  moduleId: string
  field: string
  label?: string
  color?: string
  /** Which y-axis this series plots against. Default: 'left'. */
  yAxis?: 'left' | 'right'
}

/** Date range for filtering entries. */
export interface DateRange {
  type: 'all' | 'last_n_days' | 'custom'
  n?: number      // used when type = 'last_n_days'
  start?: string  // ISO date, used when type = 'custom'
  end?: string    // ISO date, used when type = 'custom'
}

/** Row-level filter applied before rendering. */
export interface ChartFilter {
  field: string
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'
  value: string | number | boolean
}

/** Horizontal reference line drawn on axis charts. */
export interface ReferenceLine {
  value: number
  label?: string
  color?: string
}

export interface ChartConfig {
  chartType: ChartType
  title?: string

  /**
   * Data sources. Today always length 1 (single module).
   * Shape is multi-module-ready so future cross-module charts
   * don't require a migration.
   */
  series: ChartSeries[]

  // ── Time axis ─────────────────────────────────────────────
  /** Group entries into time buckets before plotting. Default: 'none'. */
  bucketBy?: BucketBy
  /** How to combine values within a bucket. Default: 'none' (last value wins). */
  aggregation?: Aggregation

  // ── Date filter ───────────────────────────────────────────
  dateRange?: DateRange

  // ── Row filters ───────────────────────────────────────────
  filters?: ChartFilter[]

  // ── Sort (used by list + table) ────────────────────────────
  sort?: { field: string; direction: 'asc' | 'desc' }

  // ── Display ────────────────────────────────────────────────
  xLabel?: string
  yLabel?: string
  /** Label for the secondary (right) y-axis, when any series uses it. */
  yRightLabel?: string
  /**
   * Y-axis scaling overrides.
   * Omit all three to use type-driven auto-scaling:
   *   line/scatter — fit-to-data with ~10% headroom
   *   bar/area — zero-baseline (always starts at 0)
   * Set zeroBaseline=false on a bar/area to opt into fit-to-data instead.
   */
  yAxisMin?: number
  yAxisMax?: number
  yRightAxisMin?: number
  yRightAxisMax?: number
  /** Force (true) or suppress (false) zero baseline; omit to use chart-type default. */
  zeroBaseline?: boolean
  stacked?: boolean
  showPoints?: boolean
  showGrid?: boolean
  showLegend?: boolean
  fillForward?: boolean
  referenceLines?: ReferenceLine[]

  // ── List-specific ──────────────────────────────────────────
  /** Primary field to display in list rows. */
  displayField?: string
  /** Optional secondary field shown alongside displayField. */
  secondaryField?: string
}

// ----------------------------------------------------------------
// Domain objects
// ----------------------------------------------------------------

export interface ModuleField {
  key: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
}

// ----------------------------------------------------------------
// Formula modules — daily value computed from other modules' data
// ----------------------------------------------------------------

export const MODULE_KINDS = ['standard', 'formula'] as const
export type ModuleKind = (typeof MODULE_KINDS)[number]

/** One named input a formula reads from another module. */
export interface FormulaInput {
  moduleId: string
  /** Numeric field key on the source module. */
  field: string
  /** Name the expression uses to refer to this input. */
  alias: string
  /** Used when no entry is logged for this input on a given day. */
  defaultValue?: number
}

/**
 * Declarative formula definition. The expression is plain arithmetic
 * over the input aliases (e.g. "sleep*0.4 + practiced*0.3"), parsed
 * and evaluated by the sandboxed evaluator in lib/formula.ts.
 * Values are computed on read from current source data — never stored.
 */
export interface FormulaConfig {
  inputs: FormulaInput[]
  expression: string
}

export interface Module {
  id: string
  user_id: string
  name: string
  fields: ModuleField[]
  /** 'standard' logs entries directly; 'formula' computes a daily value. */
  kind: ModuleKind
  /** Present only when kind = 'formula'. */
  formula_config: FormulaConfig | null
  is_builtin: boolean
  shared: boolean
  created_at: string
}

export interface Chart {
  id: string
  module_id: string
  user_id: string
  config: ChartConfig
  position: number
  created_at: string
}

export interface Entry {
  id: string
  module_id: string
  user_id: string
  values: Record<string, unknown>
  entry_date: string
  created_at: string
}
