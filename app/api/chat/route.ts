import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { chatModel } from '@/lib/ai/config'
import { moduleSchema } from '@/lib/validations'
import { createClient } from '@/lib/supabase/server'
import { FIELD_TYPES } from '@/lib/types'

export const runtime = 'nodejs'

// ----------------------------------------------------------------
// System prompt
// ----------------------------------------------------------------

const SYSTEM_PROMPT = `\
You are the AI assistant inside Druzy, a personal life-tracker app.
Your primary job right now is to help users create trackers (called "modules").

When a user describes something they want to track, call the createModule tool
with a schema that fits their description. Follow these rules:

FIELD TYPES (only these are valid):
  text      — free-form text (notes, songs, book titles, etc.)
  number    — any measurable quantity (steps, weight, hours, etc.)
  date      — a specific date
  rating    — integer 1–5 (for difficulty, mood, quality, satisfaction)
  boolean   — yes/no flag
  select    — one option from a fixed list; always include sensible options[]
  photo     — image attachment (only when explicitly requested)

FIELD KEYS: lowercase snake_case only, e.g. "difficulty_rating", "song_title".
  Never use spaces, hyphens, or capital letters in a key.

UNITS: For number fields with an obvious unit, set the optional "unit" field
  (e.g. "lbs", "km", "min", "kcal"). Omit for dimensionless numbers.

FIELD COUNT: 2–5 fields is almost always right. Don't over-engineer.
  Always include at least one core data field (beyond just date).

REQUIRED: mark a field required:true only if the tracker makes no sense without it.

DEFAULTS: for rating fields, do not set required:true — a value wasn't always recorded.

After calling the tool, briefly explain what you designed and why, so the user
can decide to edit or confirm.

If the user asks a general question (not about creating a tracker), answer helpfully
in a sentence or two and invite them to describe a tracker they want.`

// ----------------------------------------------------------------
// Tool — intentionally looser inputSchema than moduleSchema so the
// call goes through even with minor key-format issues; strict
// validation happens in execute().
// ----------------------------------------------------------------

const createModuleInputSchema = z.object({
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
})

const createModuleTool = tool({
  description:
    'Propose a tracker schema based on the user description. ' +
    'Call this whenever the user describes something they want to track. ' +
    'The result is shown to the user as an editable card — do not describe the schema in text.',
  inputSchema: createModuleInputSchema,
  execute: async ({ name, fields }) => {
    // Strict validation — the gate before any data touches the DB.
    const parsed = moduleSchema.safeParse({ name, fields })

    if (!parsed.success) {
      const errors = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return {
        success: false as const,
        error: errors,
      }
    }

    return {
      success: true as const,
      proposal: parsed.data,
    }
  },
})

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

  // AI SDK v6: body contains UIMessage[] — convert to model messages for streamText.
  const { messages } = await req.json()

  const result = streamText({
    model: chatModel,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    // Allow up to 3 steps so the model can retry after a schema validation error.
    stopWhen: stepCountIs(3),
    tools: { createModule: createModuleTool },
  })

  return result.toUIMessageStreamResponse()
}
