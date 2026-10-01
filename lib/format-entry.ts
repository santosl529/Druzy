// ----------------------------------------------------------------
// Entry formatting — display strings for logged values.
// ----------------------------------------------------------------

import type { ModuleField } from './types'

/** One field's value for display, e.g. "620 kcal", "Yes", or "—" when empty. */
export function formatFieldValue(value: unknown, field: ModuleField): string {
  if (value === null || value === undefined) return '—'
  if (field.type === 'boolean') return value ? 'Yes' : 'No'
  const str = String(value)
  if ((field.type === 'number' || field.type === 'rating') && field.unit) {
    return `${str} ${field.unit}`
  }
  return str
}

/** A whole entry on one line, e.g. "Calories 620 kcal · Protein 38 g". Empty values are skipped. */
export function summarizeEntry(fields: ModuleField[], values: Record<string, unknown>): string {
  return fields
    .filter((f) => f.type !== 'photo')
    .filter((f) => values[f.key] !== null && values[f.key] !== undefined && values[f.key] !== '')
    .map((f) => `${f.label} ${formatFieldValue(values[f.key], f)}`)
    .join(' · ')
}
