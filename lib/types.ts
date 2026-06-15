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
  /**
   * Two-stage aggregation: first collapse multiple entries on the same calendar
   * day using this operation, then apply the outer `bucketBy` + `aggregation`.
   *
   * Example: dailyAggregation='sum', bucketBy='week', aggregation='avg'
   * → sum entries per day → average those daily totals per week.
   *
   * When omitted, each entry is its own data point (existing behaviour).
   */
  dailyAggregation?: Aggregation
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
  /**
   * Optional unit label for number/rating fields (e.g. "lbs", "kcal", "min").
   * Displayed alongside values in entry lists, form placeholders, and axis labels.
   * Has no effect on other field types.
   */
  unit?: string
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

// ----------------------------------------------------------------
// User profile
// ----------------------------------------------------------------

export interface Profile {
  id: string
  display_name: string | null
  theme: string
  is_admin: boolean
  /**
   * IANA timezone string (e.g. 'America/New_York', 'Europe/Rome').
   * Null = unset; the UI defaults to the browser-detected timezone.
   * Governs which calendar day a "now" entry belongs to.
   *
   * Per-tracker override: modules.day_boundary_tz (same IANA string, null =
   * inherit from profile) can be added later without migrating this table.
   */
  day_boundary_tz: string | null
  created_at: string
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

// ----------------------------------------------------------------
// Food entries (dedicated table)
// ----------------------------------------------------------------

export interface FoodEntry {
  id: string
  user_id: string
  entry_date: string
  calories: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  source: 'photo' | 'manual'
  photo_path: string | null
  created_at: string
}

export interface DailyTotals {
  calories: number
  protein_g: number
  fat_g: number
  carbs_g: number
}

export interface MacroEstimate {
  calories: number
  protein_g: number
  fat_g: number
  carbs_g: number
  notes: string
}

/**
 * Lightweight view of a module used by the food page to offer
 * "also log to tracker" — only standard modules, only numeric fields.
 */
export interface TrackerModuleField {
  key: string
  label: string
  unit?: string
}

export interface TrackerModule {
  id: string
  name: string
  numericFields: TrackerModuleField[]
}

// ----------------------------------------------------------------
// Journal extraction template + entries
// ----------------------------------------------------------------

/** The three field types a journal extraction template supports. */
export const JOURNAL_FIELD_TYPES = ['text', 'list', 'number'] as const
export type JournalFieldType = (typeof JOURNAL_FIELD_TYPES)[number]

/**
 * One field in the user's journal extraction template.
 * - text: a single extracted string (e.g. mood, one-sentence summary)
 * - list: array of extracted strings (e.g. "things that happened today")
 * - number: a single numeric value (e.g. calories, weight)
 *
 * number fields can optionally be wired to a tracker module field so the
 * extracted value is also logged as a tracker entry on save.
 */
export interface JournalField {
  key: string
  label: string
  type: JournalFieldType
  /** Optional instruction passed to the AI to guide extraction for this field. */
  instruction?: string
  /** UUID of the tracker module to log this value into (number fields only). */
  targetModuleId?: string
  /** Key of the numeric field on that module to fill (number fields only). */
  targetFieldKey?: string
}

/** One row in journal_templates (at most one per user). */
export interface JournalTemplate {
  id: string
  user_id: string
  fields: JournalField[]
  created_at: string
}

/** One row in journal_entries. Photo is never stored — stays on device. */
export interface JournalEntry {
  id: string
  user_id: string
  entry_date: string
  transcription: string | null
  /** Extracted field values keyed by JournalField.key. */
  extracted: Record<string, unknown>
  created_at: string
}
