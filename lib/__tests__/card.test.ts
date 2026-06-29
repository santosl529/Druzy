import { describe, it, expect } from 'vitest'
import { getBinaryField, isBinaryModule } from '../card'
import type { Module, ModuleField } from '../types'

function mod(fields: ModuleField[], kind: Module['kind'] = 'standard'): Module {
  return {
    id: 'm1',
    user_id: 'u1',
    name: 'Test',
    fields,
    kind,
    formula_config: null,
    crystal_type: 'amethyst',
    card_config: null,
    dashboard_config: null,
    is_builtin: false,
    shared: false,
    created_at: '2026-01-01T00:00:00Z',
  }
}

const bool: ModuleField = { key: 'done', label: 'Done', type: 'boolean', required: false }
const num: ModuleField = { key: 'count', label: 'Count', type: 'number', required: false }

describe('getBinaryField / isBinaryModule', () => {
  it('treats a standard module with exactly one boolean field as binary', () => {
    expect(getBinaryField(mod([bool]))).toEqual(bool)
    expect(isBinaryModule(mod([bool]))).toBe(true)
  })

  it('is not binary when the single field is not boolean', () => {
    expect(getBinaryField(mod([num]))).toBeNull()
    expect(isBinaryModule(mod([num]))).toBe(false)
  })

  it('is not binary with more than one field even if one is boolean', () => {
    expect(getBinaryField(mod([bool, num]))).toBeNull()
    expect(isBinaryModule(mod([bool, num]))).toBe(false)
  })

  it('is not binary for formula modules', () => {
    expect(getBinaryField(mod([bool], 'formula'))).toBeNull()
    expect(isBinaryModule(mod([bool], 'formula'))).toBe(false)
  })

  it('is not binary with no fields', () => {
    expect(getBinaryField(mod([]))).toBeNull()
  })
})
