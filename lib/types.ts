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

export interface Module {
  id: string
  user_id: string
  name: string
  fields: ModuleField[]
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
