import { z } from 'zod'
import { FIELD_TYPES, CHART_TYPES, JOURNAL_FIELD_TYPES, CARD_SUMMARY_MODES, CARD_TIME_WINDOWS } from './types'
import { validateExpression } from './formula'
import { CRYSTAL_KEYS } from './crystals'

export const crystalTypeSchema = z.enum(CRYSTAL_KEYS)

/** Card summary config (matches CardConfig in lib/types.ts). */
export const cardSummaryItemSchema = z.object({
  field: z.string().min(1),
  mode: z.enum(CARD_SUMMARY_MODES),
  timeWindow: z.enum(CARD_TIME_WINDOWS),
})

export const cardConfigSchema = z.object({
  items: z.array(cardSummaryItemSchema).min(1, 'Add at least one value').max(4, 'At most 4 values'),
})

// ----------------------------------------------------------------
// Dashboard config schema (matches DashboardConfig in lib/types.ts)
// ----------------------------------------------------------------

const goalConditionSchema = z.union([
  z.object({
    field: z.string().min(1),
    op: z.enum(['gte', 'lte', 'eq']),
    value: z.number(),
  }),
  z.object({
    field: z.string().min(1),
    op: z.literal('between'),
    min: z.number(),
    max: z.number(),
  }),
])

const goalConfigSchema = z.object({
  conditions: z.array(goalConditionSchema).min(1, 'Add at least one condition').max(10),
  combine: z.literal('all'),
})

export const dashboardConfigSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('binary') }),
  z.object({ mode: z.literal('goal'), goal: goalConfigSchema }),
  z.object({
    mode: z.literal('gradient'),
    gradientField: z.string().min(1, 'Pick a field for gradient intensity'),
    gradientRange: z
      .object({ min: z.number(), max: z.number() })
      .refine((r) => r.max > r.min, 'Max must be greater than min')
      .optional(),
  }),
])

export const moduleFieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be lowercase letters, numbers, or underscores'),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  /** Optional unit for number/rating fields (e.g. "lbs", "kcal", "min"). */
  unit: z.string().max(20).optional(),
})

// chart_config removed from modules; charts are their own table now
export const moduleSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    fields: z.array(moduleFieldSchema).min(1, 'At least one field is required'),
    crystal_type: crystalTypeSchema,
    card_config: cardConfigSchema.nullable().optional(),
    dashboard_config: dashboardConfigSchema.nullable().optional(),
  })
  .superRefine((mod, ctx) => {
    // Every configured card-summary value must point at a field that exists.
    if (mod.card_config) {
      const keys = new Set(mod.fields.map((f) => f.key))
      mod.card_config.items.forEach((it, i) => {
        if (!keys.has(it.field)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Card summary references an unknown field',
            path: ['card_config', 'items', i, 'field'],
          })
        }
      })
    }
  })

export type ModuleFormValues = z.infer<typeof moduleSchema>

// ----------------------------------------------------------------
// Formula module schema (matches FormulaConfig in lib/types.ts)
// ----------------------------------------------------------------

// Defense-in-depth: the evaluator already uses a null-prototype scope
// with own-property lookups, but these names are banned outright.
const RESERVED_ALIASES = new Set(['__proto__', 'constructor', 'prototype'])

export const formulaInputSchema = z.object({
  moduleId: z.string().uuid(),
  field: z.string().min(1, 'Pick a field for each input'),
  alias: z
    .string()
    .min(1, 'Each input needs an alias')
    .max(30, 'Alias too long')
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Alias must be letters, numbers, or underscores (not starting with a number)')
    .refine((a) => !RESERVED_ALIASES.has(a), 'This alias name is reserved'),
  defaultValue: z.number().finite().optional(),
})

export const formulaConfigSchema = z
  .object({
    inputs: z.array(formulaInputSchema).min(1, 'At least one input is required').max(10, 'Too many inputs'),
    expression: z.string().min(1, 'Expression is required').max(500, 'Expression too long'),
  })
  .superRefine((cfg, ctx) => {
    const aliases = cfg.inputs.map((i) => i.alias)
    if (new Set(aliases).size !== aliases.length) {
      ctx.addIssue({ code: 'custom', message: 'Aliases must be unique', path: ['inputs'] })
    }
    // Rejects anything that isn't arithmetic over the declared aliases.
    const err = validateExpression(cfg.expression, aliases)
    if (err) ctx.addIssue({ code: 'custom', message: err, path: ['expression'] })
  })

export const formulaModuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  config: formulaConfigSchema,
})

export type FormulaModuleFormValues = z.infer<typeof formulaModuleSchema>

// ----------------------------------------------------------------
// Chart config schema (matches ChartConfig in lib/types.ts)
// ----------------------------------------------------------------

const chartSeriesSchema = z.object({
  moduleId: z.string().min(1),
  field: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
  yAxis: z.enum(['left', 'right']).optional(),
})

const dateRangeSchema = z.object({
  type: z.enum(['all', 'last_n_days', 'custom']),
  n: z.number().positive().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
})

const chartFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

const referenceLineSchema = z.object({
  value: z.number(),
  label: z.string().optional(),
  color: z.string().optional(),
})

export const chartConfigSchema = z.object({
  chartType: z.enum(CHART_TYPES),
  title: z.string().optional(),
  series: z.array(chartSeriesSchema),
  bucketBy: z.enum(['none', 'day', 'week', 'month', 'year']).optional(),
  aggregation: z.enum(['none', 'sum', 'avg', 'count', 'min', 'max', 'median']).optional(),
  dateRange: dateRangeSchema.optional(),
  filters: z.array(chartFilterSchema).optional(),
  sort: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  yRightLabel: z.string().optional(),
  yAxisMin: z.number().optional(),
  yAxisMax: z.number().optional(),
  yRightAxisMin: z.number().optional(),
  yRightAxisMax: z.number().optional(),
  zeroBaseline: z.boolean().optional(),
  stacked: z.boolean().optional(),
  showPoints: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  fillForward: z.boolean().optional(),
  dailyAggregation: z.enum(['none', 'sum', 'avg', 'count', 'min', 'max', 'median']).optional(),
  referenceLines: z.array(referenceLineSchema).optional(),
  displayField: z.string().optional(),
  secondaryField: z.string().optional(),
})

export const chartSchema = z.object({
  module_id: z.string().uuid(),
  config: chartConfigSchema,
  position: z.number().int().min(0).optional(),
})

export type ChartFormValues = z.infer<typeof chartSchema>

// ----------------------------------------------------------------
// Bulk import schemas (matches ImportMapping in lib/import.ts)
// ----------------------------------------------------------------

export const importFieldMappingSchema = z.object({
  column: z.string().min(1),
  fieldKey: z.string().min(1),
})

export const importMappingSchema = z.object({
  dateColumn: z.string().min(1, 'Date column is required'),
  fieldMappings: z.array(importFieldMappingSchema).min(1, 'Map at least one field'),
})

export const importRowSchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  values: z.record(z.string(), z.unknown()),
})

export const bulkImportPayloadSchema = z.object({
  moduleId: z.string().uuid(),
  rows: z.array(importRowSchema).min(1).max(5000),
  includeDuplicates: z.boolean().optional(),
})

export type BulkImportPayload = z.infer<typeof bulkImportPayloadSchema>

// ----------------------------------------------------------------
// Journal template + entry schemas
// ----------------------------------------------------------------

export const journalFieldSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .regex(/^[a-z0-9_]+$/, 'Key must be lowercase letters, numbers, or underscores'),
    label: z.string().min(1, 'Label is required'),
    type: z.enum(JOURNAL_FIELD_TYPES),
    instruction: z.string().max(300).optional(),
    targetModuleId: z.string().uuid().optional(),
    targetFieldKey: z.string().min(1).optional(),
  })
  .refine(
    (f) => {
      // Tracker connections are only valid on number fields; server strips them from others.
      if (f.type !== 'number') return true
      // On number fields, both must be set or both must be unset.
      if (f.targetModuleId && !f.targetFieldKey) return false
      if (f.targetFieldKey && !f.targetModuleId) return false
      return true
    },
    { message: 'Tracker connection requires both a module and a field.' }
  )

export const journalTemplateSchema = z
  .object({
    fields: z.array(journalFieldSchema).max(20, 'Templates can have at most 20 fields'),
    /**
     * Optional binary tracker to mark as done when a journal entry is saved.
     * Server-side validated against the user's actual modules.
     */
    binaryModuleId: z.string().uuid().optional(),
  })
  .superRefine((t, ctx) => {
    const keys = t.fields.map((f) => f.key)
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', message: 'Field keys must be unique', path: ['fields'] })
    }
  })

export type JournalTemplateFormValues = z.infer<typeof journalTemplateSchema>

export const journalEntrySchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  transcription: z.string().optional(),
  extracted: z.record(z.string(), z.unknown()),
  /** IDs of tracker modules the user has opted to log connected fields into. */
  enabledModuleIds: z.array(z.string().uuid()),
})
