import { describe, it, expect } from 'vitest'
import { formatFieldValue, summarizeEntry } from '../format-entry'
import type { ModuleField } from '../types'

const fields: ModuleField[] = [
  { key: 'cal', label: 'Calories', type: 'number', required: true, unit: 'kcal' },
  { key: 'done', label: 'Done', type: 'boolean', required: false },
  { key: 'note', label: 'Note', type: 'text', required: false },
]

describe('formatFieldValue', () => {
  it('appends units to numbers and maps booleans to Yes/No', () => {
    expect(formatFieldValue(620, fields[0])).toBe('620 kcal')
    expect(formatFieldValue(true, fields[1])).toBe('Yes')
    expect(formatFieldValue(null, fields[2])).toBe('—')
  })
})

describe('summarizeEntry', () => {
  it('joins the filled fields with their labels', () => {
    expect(summarizeEntry(fields, { cal: 620, done: false, note: 'late lunch' })).toBe(
      'Calories 620 kcal · Done No · Note late lunch',
    )
  })
  it('skips empty values', () => {
    expect(summarizeEntry(fields, { cal: 410, note: '' })).toBe('Calories 410 kcal')
  })
})
