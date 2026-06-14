import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { chatModel } from '@/lib/ai/config'
import { moduleSchema, formulaConfigSchema } from '@/lib/validations'
import { createClient } from '@/lib/supabase/server'
import { validateExpression } from '@/lib/formula'
import { FIELD_TYPES } from '@/lib/types'
import type { Module, ModuleField } from '@/lib/types'

export const runtime = 'nodejs'

// ----------------------------------------------------------------
// Context helpers
// ----------------------------------------------------------------

/** Compact representation of a module for the system prompt. */
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
    return '## Existing trackers\nNone yet — this will be the user\'s first tracker.\n'
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
// System prompt (static part — context block is appended per-request)
// ----------------------------------------------------------------

function buildSystemPrompt(contextBlock: string): string {
  return `\
You are the AI assistant inside Druzy, a personal life-tracker app.
You help users create trackers (called "modules") — both standard trackers and formula trackers.

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
Call this when the user wants a value COMPUTED from other trackers (not logged directly).
Rules:
- inputs[].moduleId MUST be one of the exact IDs from "Existing trackers" above.
- inputs[].field MUST be a numeric (number or rating) field key on that module.
- inputs[].alias is the name the expression uses — short, alphanumeric, e.g. "w" or "cals".
- expression uses only: numbers, aliases, + - * / % ^ ( ) and unary minus.
  Example: "cals / weight" or "(sleep * 0.4) + (practice * 0.6)"
- Only reference standard trackers, never another formula tracker.
- If the user mentions trackers that don't exist yet, create those first with createModule,
  then explain they need to set up the formula tracker once data is available.

After calling either tool, briefly explain what you designed and why.
If you ask a general question (not creating a tracker), answer helpfully and invite a tracker description.`
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
      const errors = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      return { success: false as const, error: errors }
    }
    return { success: true as const, proposal: parsed.data }
  },
})

// ----------------------------------------------------------------
// createFormulaModule tool (closes over the fetched modules)
// ----------------------------------------------------------------

function makeCreateFormulaModuleTool(summaries: ModuleSummary[]) {
  const byId = new Map(summaries.map((m) => [m.id, m]))

  return tool({
    description:
      'Propose a formula tracker whose daily value is computed from existing trackers. ' +
      'Only call this when the referenced moduleIds already exist in the user\'s tracker list.',
    inputSchema: z.object({
      name: z.string().min(1).describe('Human-readable name for the formula tracker'),
      inputs: z
        .array(
          z.object({
            moduleId: z.string().describe('Exact UUID of an existing tracker'),
            field: z.string().describe('Numeric field key on that tracker'),
            alias: z
              .string()
              .describe('Short name the expression uses, e.g. "w" or "cals"'),
            defaultValue: z
              .number()
              .optional()
              .describe('Value to use when no entry logged on a day'),
          })
        )
        .min(1),
      expression: z
        .string()
        .describe('Arithmetic expression over the aliases, e.g. "cals / weight"'),
    }),
    execute: async ({ name, inputs, expression }) => {
      // Validate each input against the fetched modules.
      for (const inp of inputs) {
        const mod = byId.get(inp.moduleId)
        if (!mod) {
          return {
            success: false as const,
            error: `Tracker with id "${inp.moduleId}" was not found. Use only IDs from the existing trackers list.`,
          }
        }
        if (mod.kind === 'formula') {
          return {
            success: false as const,
            error: `"${mod.name}" is a formula tracker. Formulas can only read from standard trackers.`,
          }
        }
        const field = mod.allFields.find((f) => f.key === inp.field)
        if (!field) {
          return {
            success: false as const,
            error: `Field "${inp.field}" not found on "${mod.name}". Available fields: ${mod.allFields.map((f) => f.key).join(', ')}.`,
          }
        }
        if (field.type !== 'number' && field.type !== 'rating') {
          return {
            success: false as const,
            error: `Field "${field.label}" on "${mod.name}" is not numeric (type: ${field.type}). Only number and rating fields can be used in formulas.`,
          }
        }
      }

      // Validate expression.
      const aliases = inputs.map((i) => i.alias)
      if (new Set(aliases).size !== aliases.length) {
        return { success: false as const, error: 'Input aliases must be unique.' }
      }
      const exprError = validateExpression(expression, aliases)
      if (exprError) {
        return { success: false as const, error: `Expression error: ${exprError}` }
      }

      // Run full schema validation.
      const config = { inputs, expression }
      const parsed = formulaConfigSchema.safeParse(config)
      if (!parsed.success) {
        return {
          success: false as const,
          error: parsed.error.issues.map((i) => i.message).join('; '),
        }
      }

      // Enrich inputs with display names so the card doesn't need extra lookups.
      const enrichedInputs = inputs.map((inp) => {
        const mod = byId.get(inp.moduleId)!
        const field = mod.allFields.find((f) => f.key === inp.field)!
        return {
          ...inp,
          moduleName: mod.name,
          fieldLabel: field.label,
          fieldUnit: (field as { unit?: string }).unit,
        }
      })

      return {
        success: true as const,
        proposal: {
          name,
          config: { inputs: parsed.data.inputs, expression: parsed.data.expression },
          enrichedInputs,
        },
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

  // Fetch user's existing modules for context injection and tool validation.
  const { data: rawModules } = await supabase
    .from('modules')
    .select('id, name, kind, fields, formula_config')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const summaries = buildModuleSummaries((rawModules ?? []) as Module[])
  const contextBlock = buildContextBlock(summaries)
  const systemPrompt = buildSystemPrompt(contextBlock)

  const { messages } = await req.json()

  const result = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    // Allow up to 3 steps so the model can retry after a validation error.
    stopWhen: stepCountIs(3),
    tools: {
      createModule: createModuleTool,
      createFormulaModule: makeCreateFormulaModuleTool(summaries),
    },
  })

  return result.toUIMessageStreamResponse()
}
