/**
 * Browser-only Ollama client for journal transcription.
 *
 * All requests go directly from the browser to localhost:11434 — the Next.js
 * server is never involved. This guarantees that journal photos and transcribed
 * text never leave the user's machine, even when the app is deployed to Vercel.
 *
 * Prerequisites:
 *   1. Ollama running: `ollama serve`
 *   2. A vision-capable model pulled: `ollama pull qwen2.5vl`
 *      (Avoid llama3.2-vision / mllama — it crashes the llama.cpp runner on
 *       several Ollama builds. qwen2.5vl runs on Ollama's native engine and is
 *       strong at handwriting/OCR.)
 *   3. CORS headers set so the browser can reach Ollama:
 *      OLLAMA_ORIGINS="https://your-app.vercel.app,http://localhost:3000" ollama serve
 */

import type { JournalField } from './types'

// ----------------------------------------------------------------
// Config
// ----------------------------------------------------------------

export interface OllamaConfig {
  baseUrl: string
  model: string
}

/**
 * Returns Ollama connection config, with env-var defaults and optional
 * localStorage overrides (key: "ollama_base_url" / "ollama_journal_model").
 * Safe to call in SSR — `localStorage` reads are guarded behind typeof window.
 */
export function getOllamaConfig(): OllamaConfig {
  const envBase = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL ?? 'http://localhost:11434'
  const envModel = process.env.NEXT_PUBLIC_OLLAMA_JOURNAL_MODEL ?? 'qwen2.5vl'

  if (typeof window === 'undefined') {
    return { baseUrl: envBase, model: envModel }
  }

  return {
    baseUrl: localStorage.getItem('ollama_base_url') ?? envBase,
    model: localStorage.getItem('ollama_journal_model') ?? envModel,
  }
}

// ----------------------------------------------------------------
// JSON schema builder
// ----------------------------------------------------------------

/**
 * Builds an Ollama `format` JSON schema from the user's extraction template.
 * The model is asked to always produce a `transcription` property (full
 * verbatim text) plus one property per user-defined field.
 *
 * Ollama's structured-output `format` follows the JSON Schema draft-07 shape:
 *   { type: 'object', properties: {...}, required: [...] }
 */
export function buildExtractionSchema(fields: JournalField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    transcription: {
      type: 'string',
      description: 'Complete verbatim transcription of all handwritten text in the image.',
    },
  }

  for (const field of fields) {
    switch (field.type) {
      case 'number':
        properties[field.key] = {
          type: 'number',
          description:
            field.instruction ??
            `Numeric value for "${field.label}" extracted from the journal entry. Use null if not mentioned.`,
        }
        break
      case 'list':
        properties[field.key] = {
          type: 'array',
          items: { type: 'string' },
          description:
            field.instruction ??
            `List of items for "${field.label}" extracted from the journal entry.`,
        }
        break
      case 'text':
      default:
        properties[field.key] = {
          type: 'string',
          description:
            field.instruction ??
            `Text value for "${field.label}" extracted from the journal entry.`,
        }
    }
  }

  return {
    type: 'object',
    properties,
    required: ['transcription', ...fields.map((f) => f.key)],
  }
}

// ----------------------------------------------------------------
// Transcription result
// ----------------------------------------------------------------

export interface TranscriptionResult {
  transcription: string
  extracted: Record<string, unknown>
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'OllamaError'
  }
}

// ----------------------------------------------------------------
// Main transcription function
// ----------------------------------------------------------------

/**
 * Sends one or more journal-page images to the local Ollama vision model and
 * returns the full transcription plus per-field extracted values.
 *
 * @param images   Array of base64-encoded image strings (data URI prefix stripped).
 * @param fields   The user's extraction template fields.
 * @param signal   Optional AbortSignal for cancellation.
 */
export async function transcribeJournal({
  images,
  fields,
  signal,
}: {
  images: string[]
  fields: JournalField[]
  signal?: AbortSignal
}): Promise<TranscriptionResult> {
  const { baseUrl, model } = getOllamaConfig()
  const schema = buildExtractionSchema(fields)

  // Build per-field instruction lines for the system prompt so the model
  // knows exactly what to extract even when the JSON schema alone isn't enough.
  const fieldInstructions = fields
    .map((f) => {
      const typeHint =
        f.type === 'list'
          ? 'Return as a JSON array of strings.'
          : f.type === 'number'
            ? 'Return as a JSON number, or null if absent.'
            : 'Return as a single string.'
      const instr = f.instruction ? ` ${f.instruction}` : ''
      return `- "${f.key}" (${f.label}):${instr} ${typeHint}`
    })
    .join('\n')

  const systemPrompt = `You are a precise handwriting transcription assistant.
Your job is to:
1. Transcribe ALL handwritten text in the provided journal image(s) verbatim into the "transcription" field.
2. Extract specific information into the structured fields listed below.

Extraction fields:
${fieldInstructions || '(no additional fields — transcription only)'}

Rules:
- Transcribe faithfully; do not paraphrase or summarize.
- For list fields, split the content into individual items.
- For number fields, extract the numeric value only (no units). Use null if not found.
- For text fields, extract the most relevant passage or summarize only if explicitly instructed.
- If the image is unclear or a field is not present, return an empty string / empty array / null accordingly.
- Respond ONLY with valid JSON matching the provided schema.`

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: schema,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Please transcribe and extract information from the following journal ${images.length === 1 ? 'page' : 'pages'}.`,
            images, // Ollama chat API accepts base64 images on the message
          },
        ],
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new OllamaError(
      'Could not reach Ollama. Make sure it is running at ' +
        baseUrl +
        ' and OLLAMA_ORIGINS is set to allow this app.',
      err
    )
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body.error ?? ''
    } catch {
      // ignore parse error
    }
    throw new OllamaError(
      `Ollama returned ${response.status}${detail ? ': ' + detail : ''}. ` +
        `Check that the model "${model}" is pulled (ollama pull ${model}).`
    )
  }

  let raw: { message?: { content?: string } }
  try {
    raw = await response.json()
  } catch (err) {
    throw new OllamaError('Ollama response was not valid JSON.', err)
  }

  const content = raw.message?.content
  if (!content) {
    throw new OllamaError('Ollama returned an empty response.')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    throw new OllamaError(
      'Could not parse the structured output from Ollama. The model may not support JSON format.',
      err
    )
  }

  const transcription =
    typeof parsed.transcription === 'string' ? parsed.transcription : ''
  const extracted: Record<string, unknown> = {}
  for (const field of fields) {
    extracted[field.key] = parsed[field.key] ?? (field.type === 'list' ? [] : null)
  }

  return { transcription, extracted }
}
