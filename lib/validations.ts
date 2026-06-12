import { z } from 'zod'
import { FIELD_TYPES, CHART_TYPES } from './types'
import { validateExpression } from './formula'

export const moduleFieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be lowercase letters, numbers, or underscores'),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
})

// chart_config removed from modules; charts are their own table now
export const moduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  fields: z.array(moduleFieldSchema).min(1, 'At least one field is required'),
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
  stacked: z.boolean().optional(),
  showPoints: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  fillForward: z.boolean().optional(),
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
