import { describe, it, expect } from 'vitest'
import { moduleSchema, moduleProposalSchema } from '../validations'

const base = { name: 'Practice', crystal_type: 'amethyst' as const }

function selectField(options?: string[]) {
  return { key: 'mood', label: 'Mood', type: 'select' as const, required: false, options }
}

describe('select fields must carry options', () => {
  it('rejects a select field with no options (moduleSchema)', () => {
    const parsed = moduleSchema.safeParse({ ...base, fields: [selectField()] })
    expect(parsed.success).toBe(false)
    expect(parsed.error!.issues[0].message).toMatch(/option/i)
  })

  it('rejects a select field with an empty options array', () => {
    const parsed = moduleSchema.safeParse({ ...base, fields: [selectField([])] })
    expect(parsed.success).toBe(false)
  })

  it('rejects a select field whose options are all blank', () => {
    const parsed = moduleSchema.safeParse({ ...base, fields: [selectField(['', '  '])] })
    expect(parsed.success).toBe(false)
  })

  it('accepts a select field with options', () => {
    const parsed = moduleSchema.safeParse({ ...base, fields: [selectField(['good', 'bad'])] })
    expect(parsed.success).toBe(true)
  })

  it('applies the same rule to AI proposals', () => {
    expect(moduleProposalSchema.safeParse({ name: 'Practice', fields: [selectField()] }).success).toBe(false)
    expect(
      moduleProposalSchema.safeParse({ name: 'Practice', fields: [selectField(['good'])] }).success
    ).toBe(true)
  })

  it('leaves non-select fields alone', () => {
    const parsed = moduleSchema.safeParse({
      ...base,
      fields: [{ key: 'hours', label: 'Hours', type: 'number', required: false }],
    })
    expect(parsed.success).toBe(true)
  })

  it('names the offending field so the error is actionable', () => {
    const parsed = moduleSchema.safeParse({
      ...base,
      fields: [
        { key: 'hours', label: 'Hours', type: 'number', required: false },
        selectField(),
      ],
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error!.issues[0].message).toContain('Mood')
    expect(parsed.error!.issues[0].path).toEqual(['fields', 1, 'options'])
  })
})
