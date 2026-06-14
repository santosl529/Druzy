import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { chatModel } from '@/lib/ai/config'
import { moduleSchema, formulaConfigSchema, chartConfigSchema } from '@/lib/validations'
import { createClient } from '@/lib/supabase/server'
import { validateExpression } from '@/lib/formula'
import { getMultiSeriesData, SERIES_COLORS } from '@/lib/chart-data'
import { FIELD_TYPES } from '@/lib/types'
import type { Module, ModuleField, Entry, ChartConfig } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// ----------------------------------------------------------------
// Context helpers
// ----------------------------------------------------------------

interface ModuleSummary {
  id: string
  name: string
  kind: string
  numericFields: Array<{ key: string; label: string; unit?: string }>
  allFields: ModuleField[]
}

function buildModuleSummaries(modules: Module[]): ModuleSummary[] {
  return modules.map((m) => ({
    id: m.id,
    name: m.name,
    kind: m.kind ?? 'standard',
    numericFields: m.fields
      .filter((f) => f.type === 'number' || f.type === 'rating')
      .map((f) => ({ key: f.key, label: f.label, unit: f.unit })),
    allFields: m.fields,
  }))
}

function buildContextBlock(summaries: ModuleSummary[]): string {
  if (summaries.length === 0) {
    return "## Existing trackers\nNone yet — this will be the user's first tracker.\n"
  }
  const lines = summaries.map((m) => {
    const fieldLines = m.allFields
      .map((f) => {
        const unit = (f as { unit?: string }).unit ? ` (${(f as { unit?: string }).unit})` : ''
        return `    - ${f.label} | key: ${f.key} | type: ${f.type}${unit}`
      })
      .join('\n')
    return `- **"${m.name}"** | id: \`${m.id}\` | kind: ${m.kind}\n${fieldLines}`
  })
  return `## Existing trackers\n${lines.join('\n')}\n`
}

// ----------------------------------------------------------------
// System prompt
// ----------------------------------------------------------------

function buildSystemPrompt(contextBlock: string): string {
  return `\
You are the AI assistant inside Druzy, a personal life-tracker app.
You help users create trackers and visualize their data.

${contextBlock}
---

## Standard tracker — createModule
Call this when the user wants to log something new day-to-day.
Field type rules (ONLY these are valid):
  text      — free-form text (notes, songs, book titles, etc.)
  number    — any measurable quantity (steps, weight, hours, etc.)
  date      — a specific date
  rating    — integer 1–5 (for difficulty, mood, quality, satisfaction)
  boolean   — yes/no flag
  select    — one option from a fixed list; always include sensible options[]
  photo     — image attachment (only when explicitly requested)

Field keys: lowercase snake_case only (e.g. "hours_slept"). No spaces, hyphens, or capitals.
Units: for number/rating fields with an obvious unit set "unit" (e.g. "lbs", "km", "min", "kcal").
Field count: 2–5 is almost always right.
Required: only when the tracker makes no sense without that field.

## Formula tracker — createFormulaModule
Call this when the user wants a value COMPUTED from other trackers.
- inputs[].moduleId MUST be an exact ID from the list above.
- inputs[].field MUST be a numeric field key on that module.
- inputs[].alias: short name used in the expression, e.g. "w" or "cals".
- expression: arithmetic only — numbers, aliases, + - * / % ^ ( ) and unary minus.
- Only reference standard trackers (not other formula trackers).

## Chart preview — proposeChart
Call this when the user asks to SEE, VISUALIZE, PLOT, or CHART their data.
Also call it when they describe comparing two things over time.
- series[].moduleId MUST be an exact ID from the list above.
- series[].field MUST be a numeric field key on that module.
- For comparing two trackers over time: use chartType "line", two series, bucketBy "week", aggregation "avg".
- For dual-axis (very different scales, e.g. weight in lbs vs. calories in kcal): set yAxis "right" on the second series.
- DO NOT give text instructions about how to create a chart — call proposeChart instead.
- A live interactive preview will appear in the chat, and the user clicks "Add chart" to save it.

After calling any tool, briefly explain what you designed and why.
If you're asked a general question, answer helpfully and invite a tracker or chart request.`
}

// ----------------------------------------------------------------
// createModule tool
// ----------------------------------------------------------------

const createModuleTool = tool({
  description:
    'Propose a new standard tracker schema. Call this when the user wants to log something new.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Human-readable tracker name, e.g. "Sleep Tracker"'),
    fields: z
      .array(
        z.object({
          key: z.string().describe('Lowercase snake_case identifier'),
          label: z.string().describe('Human-readable field label'),
          type: z.enum(FIELD_TYPES).describe('Field type'),
          required: z.boolean(),
          options: z.array(z.string()).optional().describe('Required when type is "select"'),
          unit: z.string().optional().describe('Unit for number/rating fields, e.g. "lbs"'),
        })
      )
      .min(1),
  }),
  execute: async ({ name, fields }) => {
    const parsed = moduleSchema.safeParse({ name, fields })
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      }
    }
    return { success: true as const, proposal: parsed.data }
  },
})

// ----------------------------------------------------------------
// createFormulaModule tool
// ----------------------------------------------------------------

function makeCreateFormulaModuleTool(summaries: ModuleSummary[]) {
  const byId = new Map(summaries.map((m) => [m.id, m]))

  return tool({
    description:
      "Propose a formula tracker whose daily value is computed from existing trackers. " +
      "Only call this when the referenced moduleIds already exist in the user's tracker list.",
    inputSchema: z.object({
      name: z.string().min(1).describe('Human-readable name for the formula tracker'),
      inputs: z
        .array(
          z.object({
            moduleId: z.string().describe('Exact UUID of an existing tracker'),
            field: z.string().describe('Numeric field key on that tracker'),
            alias: z.string().describe('Short name the expression uses, e.g. "w" or "cals"'),
            defaultValue: z.number().optional().describe('Value to use when no entry logged on a day'),
          })
        )
        .min(1),
      expression: z
        .string()
        .describe('Arithmetic expression over the aliases, e.g. "cals / weight"'),
    }),
    execute: async ({ name, inputs, expression }) => {
      for (const inp of inputs) {
        const mod = byId.get(inp.moduleId)
        if (!mod) {
          return { success: false as const, error: `Tracker id "${inp.moduleId}" not found. Use only IDs from the existing trackers list.` }
        }
        if (mod.kind === 'formula') {
          return { success: false as const, error: `"${mod.name}" is a formula tracker. Formulas can only read from standard trackers.` }
        }
        const field = mod.allFields.find((f) => f.key === inp.field)
        if (!field) {
          return { success: false as const, error: `Field "${inp.field}" not found on "${mod.name}". Available: ${mod.allFields.map((f) => f.key).join(', ')}.` }
        }
        if (field.type !== 'number' && field.type !== 'rating') {
          return { success: false as const, error: `Field "${field.label}" on "${mod.name}" is not numeric (type: ${field.type}).` }
        }
      }

      const aliases = inputs.map((i) => i.alias)
      if (new Set(aliases).size !== aliases.length) {
        return { success: false as const, error: 'Input aliases must be unique.' }
      }
      const exprError = validateExpression(expression, aliases)
      if (exprError) return { success: false as const, error: `Expression error: ${exprError}` }

      const parsed = formulaConfigSchema.safeParse({ inputs, expression })
      if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues.map((i) => i.message).join('; ') }
      }

      const enrichedInputs = inputs.map((inp) => {
        const mod = byId.get(inp.moduleId)!
        const field = mod.allFields.find((f) => f.key === inp.field)!
        return { ...inp, moduleName: mod.name, fieldLabel: field.label, fieldUnit: (field as { unit?: string }).unit }
      })

      return {
        success: true as const,
        proposal: { name, config: { inputs: parsed.data.inputs, expression: parsed.data.expression }, enrichedInputs },
      }
    },
  })
}

// ----------------------------------------------------------------
// proposeChart tool
// ----------------------------------------------------------------

function makeProposedChartTool(
  supabase: SupabaseClient,
  summaries: ModuleSummary[],
  userId: string
) {
  const byId = new Map(summaries.map((m) => [m.id, m]))

  return tool({
    description:
      'Show a live chart preview built from the user\'s actual data. ' +
      'Call this whenever the user asks to see, visualize, plot, or chart their data. ' +
      'Do NOT give text instructions — call this tool and a preview card will appear.',
    inputSchema: z.object({
      title: z.string().optional().describe('Optional chart title'),
      chartType: z
        .enum(['line', 'bar', 'area'])
        .default('line')
        .describe('Chart type — use "line" for trends, "bar" for totals, "area" for cumulative'),
      series: z
        .array(
          z.object({
            moduleId: z.string().describe('Exact UUID of an existing tracker'),
            field: z.string().describe('Numeric field key on that tracker'),
            label: z.string().optional().describe('Display label for this series'),
            yAxis: z
              .enum(['left', 'right'])
              .optional()
              .describe('Set "right" for a second y-axis when scales differ greatly'),
          })
        )
        .min(1),
      bucketBy: z
        .enum(['none', 'day', 'week', 'month', 'year'])
        .optional()
        .describe('Time grouping — "week" or "month" is best for trends'),
      aggregation: z
        .enum(['none', 'sum', 'avg', 'count', 'min', 'max', 'median'])
        .optional()
        .describe('How to combine multiple values per bucket — "avg" for most trends'),
    }),
    execute: async ({ title, chartType, series, bucketBy, aggregation }) => {
      // Validate each series references a real numeric field.
      for (const s of series) {
        const mod = byId.get(s.moduleId)
        if (!mod) {
          return { success: false as const, error: `Tracker id "${s.moduleId}" not found. Use only IDs from the existing trackers list.` }
        }
        const field = mod.allFields.find((f) => f.key === s.field)
        if (!field) {
          return { success: false as const, error: `Field "${s.field}" not found on "${mod.name}". Numeric fields: ${mod.numericFields.map((f) => f.key).join(', ') || 'none'}.` }
        }
        if (field.type !== 'number' && field.type !== 'rating') {
          return { success: false as const, error: `Field "${field.label}" on "${mod.name}" is not numeric.` }
        }
      }

      // Build the full chart config.
      const config: ChartConfig = {
        chartType,
        title,
        series: series.map((s, i) => ({
          moduleId: s.moduleId,
          field: s.field,
          label: s.label ?? (() => {
            const mod = byId.get(s.moduleId)!
            const field = mod.allFields.find((f) => f.key === s.field)
            return field?.label ?? s.field
          })(),
          color: SERIES_COLORS[i % SERIES_COLORS.length],
          yAxis: s.yAxis,
        })),
        bucketBy: bucketBy ?? (series.length > 1 ? 'week' : 'none'),
        aggregation: aggregation ?? (bucketBy && bucketBy !== 'none' ? 'avg' : 'none'),
      }

      // Validate against the schema.
      const parsed = chartConfigSchema.safeParse(config)
      if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues.map((i) => i.message).join('; ') }
      }

      // Fetch entries for all referenced modules.
      const moduleIds = [...new Set(series.map((s) => s.moduleId))]
      const { data: rawEntries } = await supabase
        .from('entries')
        .select('id, module_id, user_id, values, entry_date, created_at')
        .eq('user_id', userId)
        .in('module_id', moduleIds)

      const entries = (rawEntries ?? []) as Entry[]
      const entriesByModule = new Map<string, Entry[]>()
      for (const e of entries) {
        const list = entriesByModule.get(e.module_id) ?? []
        list.push(e)
        entriesByModule.set(e.module_id, list)
      }

      // Build minimal Module-shaped objects for getMultiSeriesData.
      const modulesById = new Map(
        summaries.map((m) => [
          m.id,
          {
            id: m.id,
            name: m.name,
            fields: m.allFields,
            kind: m.kind,
            formula_config: null,
            user_id: userId,
            is_builtin: false,
            shared: false,
            created_at: '',
          } as Module,
        ])
      )

      const { rows, series: seriesMeta } = getMultiSeriesData(parsed.data, entriesByModule, modulesById)

      // Module options for the "attach to" dropdown — any of the user's trackers.
      const moduleOptions = summaries.map((m) => ({ id: m.id, name: m.name }))
      const defaultModuleId = series[0].moduleId

      return {
        success: true as const,
        config: parsed.data,
        previewData: { rows, series: seriesMeta },
        moduleOptions,
        defaultModuleId,
      }
    },
  })
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: rawModules } = await supabase
    .from('modules')
    .select('id, name, kind, fields, formula_config')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const summaries = buildModuleSummaries((rawModules ?? []) as Module[])
  const systemPrompt = buildSystemPrompt(buildContextBlock(summaries))

  const { messages } = await req.json()

  const result = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(3),
    tools: {
      createModule: createModuleTool,
      createFormulaModule: makeCreateFormulaModuleTool(summaries),
      proposeChart: makeProposedChartTool(supabase, summaries, user.id),
    },
  })

  return result.toUIMessageStreamResponse()
}
