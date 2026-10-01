import { describe, it, expect } from 'vitest'
import { computeLogPreview } from '../log-preview'
import type { ModuleField } from '../types'

const fields: ModuleField[] = [
  { key: 'cal', label: 'Calories', type: 'number', required: true, unit: 'kcal' },
  { key: 'protein', label: 'Protein', type: 'number', required: false, unit: 'g' },
  { key: 'fat', label: 'Fat', type: 'number', required: false, unit: 'g' },
  { key: 'note', label: 'Note', type: 'text', required: false },
]
const entries = [
  { entry_date: '2026-09-30', values: { cal: 1200, protein: 80 }, created_at: '' },
  { entry_date: '2026-09-30', values: { cal: '662', protein: 32 }, created_at: '' },
  { entry_date: '2026-09-29', values: { cal: 2000 }, created_at: '' },
]

describe('computeLogPreview', () => {
  it('sums the first two number fields on the chosen day and adds the draft', () => {
    expect(computeLogPreview(fields, entries, '2026-09-30', { cal: '620', protein: '38' })).toEqual([
      { label: 'Calories', unit: 'kcal', before: 1862, after: 2482 },
      { label: 'Protein', unit: 'g', before: 112, after: 150 },
    ])
  })
  it('blank or non-numeric draft values leave the total unchanged', () => {
    expect(computeLogPreview(fields, entries, '2026-09-29', { cal: '', protein: 'x' })).toEqual([
      { label: 'Calories', unit: 'kcal', before: 2000, after: 2000 },
      { label: 'Protein', unit: 'g', before: 0, after: 0 },
    ])
  })
  it('returns nothing for modules without number fields', () => {
    expect(computeLogPreview([fields[3]], entries, '2026-09-30', {})).toEqual([])
  })
})
