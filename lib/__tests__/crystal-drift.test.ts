import { describe, it, expect } from 'vitest'
import { CRYSTAL_KEYS } from '../crystals'
import { crystalTypeSchema } from '../validations'

describe('crystal key drift', () => {
  it('Zod enum matches the crystal source of truth', () => {
    expect([...crystalTypeSchema.options].sort()).toEqual([...CRYSTAL_KEYS].sort())
  })
})
