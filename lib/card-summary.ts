// ----------------------------------------------------------------
// Card summary — the single value shown on a tracker's dashboard card.
//
// Pure, client-safe computation: given a module, its entries, and "today"
// (already resolved in the user's day-boundary timezone), produce the display
// text. All windowing reads entry_date; the aggregation math is reused from
// chart-data.ts (applyAggregation) — no new math, nothing sent to an LLM.
// ----------------------------------------------------------------

import type { CardConfig, CardSummaryMode, Entry, Module, ModuleField } from './types'
import { applyAggregation } from './chart-data'

/**
 * The slice of an entry the card summary needs. Lets the dashboard ship only
 * these columns to the client (and lets optimistic logs be built cheaply)
 * without the full Entry (id/user_id/module_id).
 */
export type CardEntry = Pick<Entry, 'entry_date' | 'values' | 'created_at'>

export interface CardSummary {
  /** Ready-to-render text, e.g. "1,847 kcal", "154 lbs", "Done", "Not logged". */
  text: string
  /** True when there is nothing to show in the window (the "Not logged" state). */
  empty: boolean
}

const EMPTY: CardSummary = { text: 'Not logged', empty: true }

/** Maps a card mode to the chart aggregation. `latest`/`count` are handled separately. */
const MODE_TO_AGG: Record<Exclude<CardSummaryMode, 'latest' | 'count'>, 'sum' | 'avg' | 'min' | 'max' | 'median'> = {
  sum: 'sum',
  avg: 'avg',
  min: 'min',
  max: 'max',
  median: 'median',
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

/**
 * The effective config for a module: its explicit card_config when valid, else
 * an auto-derived default — first numeric field summed over today, latest for a
 * single boolean tracker, otherwise a count of entries today.
 */
export function resolveCardConfig(mod: Module): CardConfig {
  const cfg = mod.card_config
  if (cfg && mod.fields.some((f) => f.key === cfg.field)) return cfg

  const firstNumeric = mod.fields.find(isNumericField)
  if (firstNumeric) return { field: firstNumeric.key, mode: 'sum', timeWindow: 'today' }

  if (mod.fields.length === 1 && mod.fields[0].type === 'boolean') {
    return { field: mod.fields[0].key, mode: 'latest', timeWindow: 'today' }
  }

  return { field: mod.fields[0]?.key ?? '', mode: 'count', timeWindow: 'today' }
}

/** Inclusive start date of a `week` window: today and the 6 prior days. */
function weekStart(today: string): string {
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 6)
  return d.toISOString().split('T')[0]
}

function inWindow(entry: CardEntry, cfg: CardConfig, today: string): boolean {
  switch (cfg.timeWindow) {
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

export function computeCardSummary(mod: Module, entries: CardEntry[], today: string): CardSummary {
  const cfg = resolveCardConfig(mod)
  const field = mod.fields.find((f) => f.key === cfg.field)
  const windowed = entries.filter((e) => inWindow(e, cfg, today))

  if (windowed.length === 0) return EMPTY

  // count reflects entries (including presence-only "mark-done" rows), not field values.
  if (cfg.mode === 'count') return { text: String(windowed.length), empty: false }

  // A single boolean field shows Done / Not done from the most recent entry.
  // Presence-only rows (empty values) count as Done — matching mark-done semantics.
  if (field?.type === 'boolean' && cfg.mode === 'latest') {
    const latest = [...windowed].sort(byRecencyDesc)[0]
    const v = latest.values[cfg.field]
    return { text: v === false ? 'Not done' : 'Done', empty: false }
  }

  const unit = field?.unit ? ` ${field.unit}` : ''

  if (cfg.mode === 'latest') {
    const latest = [...windowed].sort(byRecencyDesc).find((e) => toNumber(e.values[cfg.field]) !== null)
    const v = latest ? toNumber(latest.values[cfg.field]) : null
    if (v === null) return EMPTY
    return { text: `${formatNumber(v)}${unit}`, empty: false }
  }

  const values = windowed.flatMap((e) => {
    const n = toNumber(e.values[cfg.field])
    return n !== null ? [n] : []
  })
  if (values.length === 0) return EMPTY

  return { text: `${formatNumber(applyAggregation(values, MODE_TO_AGG[cfg.mode]))}${unit}`, empty: false }
}
