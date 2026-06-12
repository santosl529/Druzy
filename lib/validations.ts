import { z } from 'zod'
import { FIELD_TYPES, CHART_TYPES } from './types'

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
