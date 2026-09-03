import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createModuleInputSchema } from '../ai/tool-schemas'
import { moduleProposalSchema } from '../validations'

// Real input the model produced when it omitted `required` on every field.
const modelInput = {
  name: 'Drums',
  fields: [
    { key: 'song_memorized', label: 'Song Memorized', type: 'text' },
    { key: 'practiced_in_general', label: 'Practiced in General?', type: 'boolean' },
  ],
}

describe('createModule tool input schema', () => {
  it('accepts fields with no "required" flag and defaults it to false', () => {
    const parsed = createModuleInputSchema.safeParse(modelInput)
    expect(parsed.success).toBe(true)
    expect(parsed.data!.fields.map((f) => f.required)).toEqual([false, false])
  })

  it('keeps an explicit "required" flag', () => {
    const parsed = createModuleInputSchema.parse({
      name: 'Sleep',
      fields: [{ key: 'hours', label: 'Hours', type: 'number', required: true }],
    })
    expect(parsed.fields[0].required).toBe(true)
  })

  it('does not advertise "required" as a required property to the model', () => {
    // The AI SDK converts the tool schema with io: 'input'; if `required` shows up
    // in the JSON Schema `required` list the model gets rejected before execute runs.
    const json = z.toJSONSchema(createModuleInputSchema, { io: 'input' }) as unknown as {
      properties: { fields: { items: { required?: string[] } } }
    }
    const fieldSchema = json.properties.fields.items
    expect(fieldSchema.required ?? []).not.toContain('required')
    expect(fieldSchema.required ?? []).toEqual(expect.arrayContaining(['key', 'label', 'type']))
  })
})

describe('select fields the model under-specified', () => {
  const selectNoOptions = {
    name: 'Practice',
    fields: [{ key: 'mood', label: 'Mood', type: 'select' }],
  }

  it('passes tool-input validation so the model can be told what went wrong', () => {
    // Deliberately permissive: a hard failure here aborts the stream before
    // execute runs (AI_InvalidToolInputError) and the model never learns why.
    expect(createModuleInputSchema.safeParse(selectNoOptions).success).toBe(true)
  })

  it('is rejected by execute with a message the model can act on', () => {
    const input = createModuleInputSchema.parse(selectNoOptions)
    const parsed = moduleProposalSchema.safeParse(input)
    expect(parsed.success).toBe(false)
    expect(parsed.error!.issues[0].message).toContain('option')
  })
})

describe('moduleProposalSchema', () => {
  it('validates a proposal before the user has picked a crystal', () => {
    const input = createModuleInputSchema.parse(modelInput)
    const parsed = moduleProposalSchema.safeParse(input)
    expect(parsed.success).toBe(true)
  })

  it('still rejects non snake_case field keys', () => {
    const parsed = moduleProposalSchema.safeParse({
      name: 'Drums',
      fields: [{ key: 'Song Memorized', label: 'Song', type: 'text', required: false }],
    })
    expect(parsed.success).toBe(false)
  })
})
