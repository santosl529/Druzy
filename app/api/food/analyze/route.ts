import { generateObject } from 'ai'
import { z } from 'zod'
import { visionModel } from '@/lib/ai/config'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const macroSchema = z.object({
  calories: z.number().describe('Estimated total calories (kcal)'),
  protein_g: z.number().describe('Estimated protein in grams'),
  fat_g: z.number().describe('Estimated total fat in grams'),
  carbs_g: z.number().describe('Estimated total carbohydrates in grams'),
  notes: z
    .string()
    .describe(
      'Brief description of what food was identified and any confidence caveats (1-2 sentences)'
    ),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const contentType = req.headers.get('content-type') ?? ''

  let imageData: string
  let context: string | undefined

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400 })

    const buffer = await file.arrayBuffer()
    imageData = Buffer.from(buffer).toString('base64')
    context = (formData.get('context') as string | null) ?? undefined
  } else {
    // Accept JSON with base64 image
    const body = await req.json()
    if (!body.image) return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400 })
    imageData = body.image
    context = body.context ?? undefined
  }

  const contextClause = context?.trim()
    ? `\n\nAdditional context from the user: "${context.trim()}"\nUse this to refine your estimates — it may specify weight, portion size, plate size, or other details.`
    : ''

  try {
    const { object } = await generateObject({
      model: visionModel,
      schema: macroSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: imageData,
            },
            {
              type: 'text',
              text: `Analyze this food photo and estimate the nutritional content.

Be as accurate as possible given what you can see. If portion size is unclear, estimate a typical single serving.
Return numeric values only for the macro fields (no units in the numbers).
Round calories to the nearest 5, and macros to one decimal place.
In your notes, briefly describe what you identified and note your confidence level.${contextClause}`,
            },
          ],
        },
      ],
    })

    return Response.json(object)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
