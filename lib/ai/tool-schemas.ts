import { z } from 'zod'
import { FIELD_TYPES } from '../types'

/**
 * Input schema for the `createModule` chat tool.
 *
 * Lives outside the route handler so it can be unit-tested — Next.js route
 * files may only export handlers and route config.
 *
 * Every property the model can reasonably omit carries a default: the AI SDK
 * validates tool input before `execute` runs, and a hard failure there aborts
 * the whole stream with no chance to recover.
 */
export const createModuleInputSchema = z.object({
  name: z.string().min(1).describe('Human-readable tracker name, e.g. "Sleep Tracker"'),
  fields: z
    .array(
      z.object({
        key: z.string().describe('Lowercase snake_case identifier'),
        label: z.string().describe('Human-readable field label'),
        type: z.enum(FIELD_TYPES).describe('Field type'),
        required: z
          .boolean()
          .default(false)
          .describe('Whether the field must be filled in. Omit unless the tracker makes no sense without it.'),
        options: z.array(z.string()).optional().describe('Required when type is "select"'),
        unit: z.string().optional().describe('Unit for number/rating fields, e.g. "lbs"'),
      })
    )
    .min(1),
})

export type CreateModuleInput = z.infer<typeof createModuleInputSchema>
