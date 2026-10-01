// ----------------------------------------------------------------
// Log preview — the "after this entry" totals shown in the quick-log dialog.
//
// For the module's first two number fields: the day's running total from
// existing entries, and what it becomes once the draft is logged. Pure, so the
// dialog can recompute it on every keystroke.
// ----------------------------------------------------------------

import type { CardEntry } from './card-summary'
import type { ModuleField } from './types'

export interface LogPreviewItem {
  label: string
  unit?: string
  before: number
  after: number
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function computeLogPreview(
  fields: ModuleField[],
  entries: CardEntry[],
  date: string,
  draft: Record<string, string>,
): LogPreviewItem[] {
  const numeric = fields.filter((f) => f.type === 'number').slice(0, 2)
  const onDay = entries.filter((e) => e.entry_date === date)
  return numeric.map((f) => {
    const before = onDay.reduce((sum, e) => sum + (toNumber(e.values[f.key]) ?? 0), 0)
    return { label: f.label, unit: f.unit, before, after: before + (toNumber(draft[f.key]) ?? 0) }
  })
}
