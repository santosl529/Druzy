import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { chatModel } from '@/lib/ai/config'
import { moduleProposalSchema, formulaConfigSchema, chartConfigSchema } from '@/lib/validations'
import { createModuleInputSchema } from '@/lib/ai/tool-schemas'
import { getAuthContext, getUserTimezone } from '@/lib/supabase/auth'
import { validateExpression } from '@/lib/formula'
import { getMultiSeriesData, SERIES_COLORS } from '@/lib/chart-data'
import { daysAgoInTimezone } from '@/lib/date'
import { computeSummary, computeTrend, computeCorrelation, computeStreak } from '@/lib/analytics'
import type { Module, ModuleField, Entry, ChartConfig, DateRange } from '@/lib/types'
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
Call this AT MOST ONCE per user request. It returns a card the user confirms; calling it
again only stacks a duplicate card under the first one.

## Formula tracker — createFormulaModule
Call this when the user wants a value COMPUTED from other trackers.
- inputs[].moduleId MUST be an exact ID from the list above.
- inputs[].field MUST be a numeric field key on that module.
- inputs[].alias: short name used in the expression, e.g. "w" or "cals".
- expression: arithmetic only — numbers, aliases, + - * / % ^ ( ) and unary minus.
- Only reference standard trackers (not other formula trackers).
- Call this AT MOST ONCE per user request, for the same reason as createModule.

## Chart preview — proposeChart
Call this when the user asks to SEE, VISUALIZE, PLOT, or CHART their data.
Also call it when they describe comparing two things over time.
- series[].moduleId MUST be an exact ID from the list above.
- series[].field MUST be a numeric field key on that module.
- For comparing two trackers over time: use chartType "line", two series, bucketBy "week", aggregation "avg".
- For dual-axis (very different scales, e.g. weight in lbs vs. calories in kcal): set yAxis "right" on the second series.
- When a tracker can have MULTIPLE entries per day (e.g. logging each meal, each workout set), set dailyAggregation first: use "sum" for additive data (calories, reps), "avg" for repeated measurements. Example: "weekly average of daily calorie total" → dailyAggregation="sum", bucketBy="week", aggregation="avg".
- DO NOT give text instructions about how to create a chart — call proposeChart instead.
- A live interactive preview will appear in the chat, and the user clicks "Add chart" to save it.

## Analytics — queryAnalytics
Call this when the user asks a QUESTION about their data — averages, trends, correlations, streaks, totals.
Examples: "What's my average sleep?", "Is my weight trending down?", "Do sleep and mood correlate?", "What's my logging streak?"
- seriesA.moduleId and seriesA.field MUST be an exact ID/key from the list above.
- For "correlation", also provide seriesB (a second tracker/field). Both fields must be numeric.
- For "streak", the field parameter inside seriesA is ignored — streak counts unique days with any entry on that tracker.
- dateRange is optional; omit to use all data.
- Do NOT use this for visualization — call proposeChart for that. Use queryAnalytics for stats/insight questions.
- The computed result appears in an insight card; do not repeat it in text.

Tool calls are rendered as interactive UI. When calling a tool, emit only the
structured tool call: do not announce it, narrate it, repeat its result, expose
its name or arguments, or add text before or after it.
If you're asked a general question, answer helpfully and invite a tracker or chart request.`
}

// ----------------------------------------------------------------
// createModule tool
// ----------------------------------------------------------------

const createModuleTool = tool({
  description:
    'Propose a new standard tracker schema. Call this when the user wants to log something new.',
  inputSchema: createModuleInputSchema,
  execute: async ({ name, fields }) => {
    // moduleProposalSchema, not moduleSchema: the crystal is picked by the user
    // in the proposal card, so a proposal has no crystal_type yet.
    const parsed = moduleProposalSchema.safeParse({ name, fields })
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      }
    }
    return {
      success: true as const,
      proposal: parsed.data,
    }
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
  userId: string,
  timezone: string
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
      dailyAggregation: z
        .enum(['sum', 'avg', 'min', 'max'])
        .optional()
        .describe(
          'First-pass aggregation: collapse multiple entries on the same day into one value. ' +
          'Use "sum" when entries are additive (e.g. multiple meals logged per day). ' +
          'Use "avg" when entries represent repeated measurements of the same thing. ' +
          'Omit when each entry is already one measurement per day.'
        ),
      bucketBy: z
        .enum(['none', 'day', 'week', 'month', 'year'])
        .optional()
        .describe('Time grouping — "week" or "month" is best for trends'),
      aggregation: z
        .enum(['none', 'sum', 'avg', 'count', 'min', 'max', 'median'])
        .optional()
        .describe('How to combine values per bucket — "avg" for most trends. Applied after dailyAggregation if set.'),
    }),
    execute: async ({ title, chartType, series, dailyAggregation, bucketBy, aggregation }) => {
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
        dailyAggregation,
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

      const { rows, series: seriesMeta } = getMultiSeriesData(parsed.data, entriesByModule, modulesById, timezone)

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
// queryAnalytics tool
// ----------------------------------------------------------------

const dateRangeSchema = z.object({
  type: z.enum(['all', 'last_n_days', 'custom']),
  n: z.number().positive().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
})

function applyDateRangeFilter(entries: Entry[], dateRange?: DateRange, timezone = 'UTC'): Entry[] {
  if (!dateRange || dateRange.type === 'all') return entries
  if (dateRange.type === 'last_n_days' && dateRange.n) {
    const cutoffStr = daysAgoInTimezone(dateRange.n, timezone)
    return entries.filter((e) => e.entry_date >= cutoffStr)
  }
  if (dateRange.type === 'custom') {
    let result = entries
    if (dateRange.start) result = result.filter((e) => e.entry_date >= dateRange.start!)
    if (dateRange.end) result = result.filter((e) => e.entry_date <= dateRange.end!)
    return result
  }
  return entries
}

function makeQueryAnalyticsTool(
  supabase: SupabaseClient,
  summaries: ModuleSummary[],
  userId: string,
  timezone: string
) {
  const byId = new Map(summaries.map((m) => [m.id, m]))

  const seriesSchema = z.object({
    moduleId: z.string().describe('Exact UUID of an existing tracker'),
    field: z.string().describe('Numeric field key on that tracker (ignored for streak operation)'),
  })

  return tool({
    description:
      'Compute a statistic (summary, trend, correlation, or streak) from the user\'s actual data. ' +
      'Call this when the user asks a question about their data — averages, trends, correlations, streaks. ' +
      'Do NOT call this for visualization; use proposeChart for charts.',
    inputSchema: z.object({
      operation: z
        .enum(['summary', 'trend', 'correlation', 'streak'])
        .describe(
          'summary: count/avg/min/max/total for one field. ' +
          'trend: direction and slope over time. ' +
          'correlation: Pearson r between two numeric fields. ' +
          'streak: consecutive days with entries.'
        ),
      seriesA: seriesSchema.describe('Primary tracker/field'),
      seriesB: seriesSchema
        .optional()
        .describe('Second tracker/field — required for correlation'),
      dateRange: dateRangeSchema
        .optional()
        .describe('Optional date filter; omit to use all data'),
    }),
    execute: async ({ operation, seriesA, seriesB, dateRange }) => {
      // Validate seriesA
      const modA = byId.get(seriesA.moduleId)
      if (!modA) {
        return { success: false as const, error: `Tracker "${seriesA.moduleId}" not found. Use only IDs from the existing trackers list.` }
      }

      // For non-streak operations, validate that the field is numeric
      if (operation !== 'streak') {
        const fieldA = modA.allFields.find((f) => f.key === seriesA.field)
        if (!fieldA) {
          return { success: false as const, error: `Field "${seriesA.field}" not found on "${modA.name}". Available: ${modA.allFields.map((f) => f.key).join(', ')}.` }
        }
        if (fieldA.type !== 'number' && fieldA.type !== 'rating') {
          return { success: false as const, error: `Field "${fieldA.label}" on "${modA.name}" is not numeric (type: ${fieldA.type}). Only number/rating fields can be analyzed.` }
        }
      }

      // For correlation, validate seriesB
      if (operation === 'correlation') {
        if (!seriesB) {
          return { success: false as const, error: 'Correlation requires a second series (seriesB).' }
        }
        const modB = byId.get(seriesB.moduleId)
        if (!modB) {
          return { success: false as const, error: `Tracker "${seriesB.moduleId}" not found.` }
        }
        const fieldB = modB.allFields.find((f) => f.key === seriesB.field)
        if (!fieldB) {
          return { success: false as const, error: `Field "${seriesB.field}" not found on "${modB.name}".` }
        }
        if (fieldB.type !== 'number' && fieldB.type !== 'rating') {
          return { success: false as const, error: `Field "${fieldB.label}" on "${modB.name}" is not numeric.` }
        }
      }

      // Fetch entries for seriesA module
      const moduleIds = [seriesA.moduleId]
      if (seriesB && seriesB.moduleId !== seriesA.moduleId) {
        moduleIds.push(seriesB.moduleId)
      }

      const { data: rawEntries } = await supabase
        .from('entries')
        .select('id, module_id, user_id, values, entry_date, created_at')
        .eq('user_id', userId)
        .in('module_id', moduleIds)
        .order('entry_date', { ascending: true })

      const allEntries = (rawEntries ?? []) as Entry[]

      const entriesA = applyDateRangeFilter(
        allEntries.filter((e) => e.module_id === seriesA.moduleId),
        dateRange as DateRange | undefined,
        timezone
      )
      const entriesB = seriesB
        ? applyDateRangeFilter(
            allEntries.filter((e) => e.module_id === seriesB.moduleId),
            dateRange as DateRange | undefined,
            timezone
          )
        : []

      // Build labels for the insight card
      const fieldAMeta = modA.allFields.find((f) => f.key === seriesA.field)
      const labels = {
        moduleA: modA.name,
        fieldA: fieldAMeta?.label ?? seriesA.field,
        unitA: (fieldAMeta as { unit?: string } | undefined)?.unit,
        moduleB: seriesB ? byId.get(seriesB.moduleId)?.name : undefined,
        fieldB: seriesB
          ? byId.get(seriesB.moduleId)?.allFields.find((f) => f.key === seriesB.field)?.label ?? seriesB.field
          : undefined,
        unitB: seriesB
          ? ((byId.get(seriesB.moduleId)?.allFields.find((f) => f.key === seriesB.field) as { unit?: string } | undefined)?.unit)
          : undefined,
      }

      // Compute
      let result
      switch (operation) {
        case 'summary':
          result = computeSummary(entriesA, seriesA.field)
          break
        case 'trend':
          result = computeTrend(entriesA, seriesA.field)
          break
        case 'correlation':
          result = computeCorrelation(entriesA, seriesA.field, entriesB, seriesB!.field)
          break
        case 'streak':
          result = computeStreak(entriesA, timezone)
          break
      }

      return { success: true as const, operation, result, labels }
    },
  })
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------

export async function POST(req: Request) {
  const { supabase, user } = await getAuthContext()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [{ data: rawModules }, tz] = await Promise.all([
    supabase
      .from('modules')
      .select('id, name, kind, fields, formula_config')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    getUserTimezone(supabase, user.id),
  ])

  const userTz = tz ?? 'UTC'
  const summaries = buildModuleSummaries((rawModules ?? []) as Module[])
  const systemPrompt = buildSystemPrompt(buildContextBlock(summaries))

  const { messages } = await req.json()

  // Diagnostic: correlate concurrent requests and record how each stream ended.
  // Remove once the incomplete-tool-call issue is closed.
  const reqId = Math.random().toString(36).slice(2, 8)
  console.log(`[chat ${reqId}] POST in — ${messages?.length ?? 0} message(s)`)

  const result = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(1),
    providerOptions: {
      openai: {
        parallelToolCalls: false,
      },
    },
    tools: {
      createModule: createModuleTool,
      createFormulaModule: makeCreateFormulaModuleTool(summaries),
      proposeChart: makeProposedChartTool(supabase, summaries, user.id, userTz),
      queryAnalytics: makeQueryAnalyticsTool(supabase, summaries, user.id, userTz),
    },
    // Without these the SDK swallows stream failures: the server logs nothing and
    // the client receives a masked generic message.
    onError: ({ error }) => {
      console.error(`[chat ${reqId}] stream error:`, error)
    },
    onFinish: ({ finishReason, steps }) => {
      const calls = steps.flatMap((s) =>
        s.toolCalls.map((c) => c.toolName)
      )
      console.log(
        `[chat ${reqId}] finish=${finishReason} steps=${steps.length} ` +
          `toolCalls=[${calls.join(', ')}]`
      )
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: (error) => {
      console.error(`[chat ${reqId}] ui stream error:`, error)
      return error instanceof Error ? error.message : String(error)
    },
  })
}
