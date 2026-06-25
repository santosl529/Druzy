// ----------------------------------------------------------------
// Card summary — the values shown on a tracker's dashboard card.
//
// Pure, client-safe computation: given a module, its entries, and "today"
// (already resolved in the user's day-boundary timezone), produce the display
// text for each configured value. All windowing reads entry_date; the
// aggregation math is reused from chart-data.ts (applyAggregation) — no new
// math, nothing sent to an LLM.
// ----------------------------------------------------------------

import type { CardSummaryItem, CardSummaryMode, Entry, Module, ModuleField } from './types'
import { applyAggregation } from './chart-data'

/**
 * The slice of an entry the card summary needs. Lets the dashboard ship only
 * these columns to the client (and lets optimistic logs be built cheaply)
 * without the full Entry (id/user_id/module_id).
 */
export type CardEntry = Pick<Entry, 'entry_date' | 'values' | 'created_at'>

export interface CardSummary {
  /** Short caption under the value, e.g. "calories", "max score", "entries". */
  label: string
  /** Ready-to-render value, e.g. "1,847 kcal", "154 lbs", "Done", "Not logged". */
  text: string
  /** True when there is nothing to show in the window (the "Not logged" state). */
  empty: boolean
}

/** Maps a card mode to the chart aggregation. `latest`/`count` are handled separately. */
const MODE_TO_AGG: Record<Exclude<CardSummaryMode, 'latest' | 'count'>, 'sum' | 'avg' | 'min' | 'max' | 'median'> = {
  sum: 'sum',
  avg: 'avg',
  min: 'min',
  max: 'max',
  median: 'median',
}

/** Prefix shown before the field name in a summary's label (blank where redundant). */
const MODE_PREFIX: Record<CardSummaryMode, string> = {
  sum: '',
  avg: 'Avg ',
  min: 'Min ',
  max: 'Max ',
  median: 'Median ',
  count: '',
  latest: '',
}

function isNumericField(f: ModuleField): boolean {
  return f.type === 'number' || f.type === 'rating'
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function formatNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function labelFor(item: CardSummaryItem, field: ModuleField | undefined): string {
  if (item.mode === 'count') return 'Entries'
  // Use the field's display name (label) verbatim, never its key/slug.
  const fieldLabel = field?.label ?? item.field
  return `${MODE_PREFIX[item.mode]}${fieldLabel}`.trim()
}

/**
 * Normalize whatever is stored in card_config into a list of items. Tolerates
 * the legacy single-object shape ({ field, mode, timeWindow }) so old rows keep
 * working without a data migration.
 */
function rawItems(mod: Module): CardSummaryItem[] {
  const cfg = mod.card_config as unknown
  if (!cfg || typeof cfg !== 'object') return []
  if (Array.isArray((cfg as { items?: unknown }).items)) {
    return (cfg as { items: CardSummaryItem[] }).items
  }
  if (typeof (cfg as CardSummaryItem).field === 'string') return [cfg as CardSummaryItem]
  return []
}

/**
 * The effective summary items for a module: its explicit, still-valid config,
 * else a single auto-derived default — first numeric field summed over today,
 * latest for a single boolean tracker, otherwise a count of entries today.
 */
export function resolveCardItems(mod: Module): CardSummaryItem[] {
  const valid = rawItems(mod).filter((it) => mod.fields.some((f) => f.key === it.field))
  if (valid.length > 0) return valid

  const firstNumeric = mod.fields.find(isNumericField)
  if (firstNumeric) return [{ field: firstNumeric.key, mode: 'sum', timeWindow: 'today' }]

  if (mod.fields.length === 1 && mod.fields[0].type === 'boolean') {
    return [{ field: mod.fields[0].key, mode: 'latest', timeWindow: 'today' }]
  }

  return [{ field: mod.fields[0]?.key ?? '', mode: 'count', timeWindow: 'today' }]
}

/** Inclusive start date of a `week` window: today and the 6 prior days. */
function weekStart(today: string): string {
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 6)
  return d.toISOString().split('T')[0]
}

function inWindow(entry: CardEntry, item: CardSummaryItem, today: string): boolean {
  switch (item.timeWindow) {
    case 'today': return entry.entry_date === today
    case 'week':  return entry.entry_date >= weekStart(today) && entry.entry_date <= today
    case 'all':   return true
  }
}

/** Most-recent-first: latest entry_date wins, ties broken by created_at. */
function byRecencyDesc(a: CardEntry, b: CardEntry): number {
  if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? 1 : -1
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
}

function computeItem(item: CardSummaryItem, mod: Module, entries: CardEntry[], today: string): CardSummary {
  const field = mod.fields.find((f) => f.key === item.field)
  const label = labelFor(item, field)
  const windowed = entries.filter((e) => inWindow(e, item, today))

  if (windowed.length === 0) return { label, text: 'Not logged', empty: true }

  // count reflects entries (including presence-only "mark-done" rows), not field values.
  if (item.mode === 'count') return { label, text: String(windowed.length), empty: false }

  // A single boolean field shows Done / Not done from the most recent entry.
  // Presence-only rows (empty values) count as Done — matching mark-done semantics.
  if (field?.type === 'boolean' && item.mode === 'latest') {
    const latest = [...windowed].sort(byRecencyDesc)[0]
    const v = latest.values[item.field]
    return { label, text: v === false ? 'Not done' : 'Done', empty: false }
  }

  const unit = field?.unit ? ` ${field.unit}` : ''

  if (item.mode === 'latest') {
    const latest = [...windowed].sort(byRecencyDesc).find((e) => toNumber(e.values[item.field]) !== null)
    const v = latest ? toNumber(latest.values[item.field]) : null
    if (v === null) return { label, text: 'Not logged', empty: true }
    return { label, text: `${formatNumber(v)}${unit}`, empty: false }
  }

  const values = windowed.flatMap((e) => {
    const n = toNumber(e.values[item.field])
    return n !== null ? [n] : []
  })
  if (values.length === 0) return { label, text: 'Not logged', empty: true }

  return { label, text: `${formatNumber(applyAggregation(values, MODE_TO_AGG[item.mode]))}${unit}`, empty: false }
}

/** One summary per resolved item, in order. */
export function computeCardSummaries(mod: Module, entries: CardEntry[], today: string): CardSummary[] {
  return resolveCardItems(mod).map((item) => computeItem(item, mod, entries, today))
}
