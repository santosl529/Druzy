import { describe, it, expect } from 'vitest'
import { computeCardSummaries, resolveCardItems } from '../card-summary'
import type { Module, ModuleField, Entry, CardConfig, CardSummaryItem } from '../types'

const TODAY = '2024-06-25'

function makeModule(fields: ModuleField[], card_config: CardConfig | null = null): Module {
  return {
    id: 'm1',
    user_id: 'u1',
    name: 'Test',
    fields,
    kind: 'standard',
    formula_config: null,
    crystal_type: 'amethyst',
    card_config,
    is_builtin: false,
    shared: false,
    created_at: '2024-01-01T00:00:00Z',
  }
}

/** A single-item card config. */
function cfg(item: CardSummaryItem): CardConfig {
  return { items: [item] }
}

let seq = 0
function entry(entry_date: string, values: Record<string, unknown>, created_at?: string): Entry {
  return {
    id: `e${seq++}`,
    module_id: 'm1',
    user_id: 'u1',
    values,
    entry_date,
    created_at: created_at ?? `${entry_date}T12:00:00Z`,
  }
}

// Labels are deliberately distinct from keys (capitalized) to verify the chip
// caption uses the field's display name, not its key/slug.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const num = (key: string, unit?: string): ModuleField => ({ key, label: cap(key), type: 'number', required: false, unit })
const bool = (key: string): ModuleField => ({ key, label: cap(key), type: 'boolean', required: false })
const text = (key: string): ModuleField => ({ key, label: cap(key), type: 'text', required: false })

// Convenience: the single summary for a one-item card.
const one = (mod: Module, entries: Entry[], today = TODAY) => computeCardSummaries(mod, entries, today)[0]

describe('computeCardSummaries — configured single value', () => {
  it('sums a numeric field over today and renders the unit', () => {
    const mod = makeModule([num('calories', 'kcal')], cfg({ field: 'calories', mode: 'sum', timeWindow: 'today' }))
    const entries = [entry(TODAY, { calories: 800 }), entry(TODAY, { calories: 1047 })]
    expect(one(mod, entries)).toEqual({ label: 'Calories', text: '1,847 kcal', empty: false })
  })

  it('renders the latest entry value (most recent entry_date), not an aggregate', () => {
    const mod = makeModule([num('weight', 'lbs')], cfg({ field: 'weight', mode: 'latest', timeWindow: 'all' }))
    const entries = [entry('2024-06-20', { weight: 156 }), entry('2024-06-24', { weight: 154 })]
    expect(one(mod, entries)).toEqual({ label: 'Weight', text: '154 lbs', empty: false })
  })

  it('breaks latest ties on the same day by created_at', () => {
    const mod = makeModule([num('weight', 'lbs')], cfg({ field: 'weight', mode: 'latest', timeWindow: 'all' }))
    const entries = [
      entry('2024-06-24', { weight: 154 }, '2024-06-24T08:00:00Z'),
      entry('2024-06-24', { weight: 153 }, '2024-06-24T20:00:00Z'),
    ]
    expect(one(mod, entries).text).toBe('153 lbs')
  })

  it('takes the max over today and labels it with the mode', () => {
    const mod = makeModule([num('score')], cfg({ field: 'score', mode: 'max', timeWindow: 'today' }))
    const entries = [entry(TODAY, { score: 42 }), entry(TODAY, { score: 51 }), entry(TODAY, { score: 47 })]
    expect(one(mod, entries)).toEqual({ label: 'Max Score', text: '51', empty: false })
  })

  it('averages and rounds to one decimal', () => {
    const mod = makeModule([num('rating')], cfg({ field: 'rating', mode: 'avg', timeWindow: 'all' }))
    const e = [entry(TODAY, { rating: 1 }), entry(TODAY, { rating: 2 }), entry(TODAY, { rating: 2 })]
    expect(one(mod, e)).toEqual({ label: 'Avg Rating', text: '1.7', empty: false })
  })

  it('counts entries in the window (count is entries, not field values)', () => {
    const mod = makeModule([text('note')], cfg({ field: 'note', mode: 'count', timeWindow: 'today' }))
    const entries = [entry(TODAY, {}), entry(TODAY, { note: 'a' }), entry(TODAY, {})]
    expect(one(mod, entries)).toEqual({ label: 'Entries', text: '3', empty: false })
  })

  it('scopes a week window to the last 7 days inclusive', () => {
    const mod = makeModule([num('minutes')], cfg({ field: 'minutes', mode: 'sum', timeWindow: 'week' }))
    const entries = [
      entry('2024-06-25', { minutes: 10 }), // today — in
      entry('2024-06-19', { minutes: 5 }), //  6 days ago — in
      entry('2024-06-18', { minutes: 100 }), // 7 days ago — out
    ]
    expect(one(mod, entries).text).toBe('15')
  })

  it('shows "Not logged" when there are no entries in the window', () => {
    const mod = makeModule([num('calories', 'kcal')], cfg({ field: 'calories', mode: 'sum', timeWindow: 'today' }))
    const entries = [entry('2024-06-01', { calories: 500 })]
    expect(one(mod, entries)).toEqual({ label: 'Calories', text: 'Not logged', empty: true })
  })

  it('shows "Not logged" when entries exist but the field has no numeric value', () => {
    const mod = makeModule([num('weight', 'lbs')], cfg({ field: 'weight', mode: 'latest', timeWindow: 'today' }))
    const entries = [entry(TODAY, {})]
    expect(one(mod, entries)).toEqual({ label: 'Weight', text: 'Not logged', empty: true })
  })
})

describe('computeCardSummaries — multiple values', () => {
  it('returns one summary per configured item, in order', () => {
    const mod = makeModule([num('calories', 'kcal'), num('protein', 'g'), num('carbs', 'g')], {
      items: [
        { field: 'calories', mode: 'sum', timeWindow: 'today' },
        { field: 'protein', mode: 'sum', timeWindow: 'today' },
        { field: 'carbs', mode: 'sum', timeWindow: 'today' },
      ],
    })
    const entries = [entry(TODAY, { calories: 1847, protein: 92, carbs: 210 })]
    expect(computeCardSummaries(mod, entries, TODAY)).toEqual([
      { label: 'Calories', text: '1,847 kcal', empty: false },
      { label: 'Protein', text: '92 g', empty: false },
      { label: 'Carbs', text: '210 g', empty: false },
    ])
  })

  it('computes each item against its own mode and window independently', () => {
    const mod = makeModule([num('score')], {
      items: [
        { field: 'score', mode: 'max', timeWindow: 'today' },
        { field: 'score', mode: 'avg', timeWindow: 'all' },
      ],
    })
    const entries = [entry(TODAY, { score: 40 }), entry(TODAY, { score: 60 }), entry('2024-01-01', { score: 20 })]
    const out = computeCardSummaries(mod, entries, TODAY)
    expect(out[0]).toEqual({ label: 'Max Score', text: '60', empty: false }) // max today
    expect(out[1]).toEqual({ label: 'Avg Score', text: '40', empty: false }) // avg all (40,60,20)
  })

  it('drops items whose field no longer exists, keeping the valid ones', () => {
    const mod = makeModule([num('calories', 'kcal')], {
      items: [
        { field: 'deleted', mode: 'sum', timeWindow: 'today' },
        { field: 'calories', mode: 'sum', timeWindow: 'today' },
      ],
    })
    const out = computeCardSummaries(mod, [entry(TODAY, { calories: 500 })], TODAY)
    expect(out).toEqual([{ label: 'Calories', text: '500 kcal', empty: false }])
  })
})

describe('computeCardSummaries — boolean done/not-done', () => {
  it('renders Done when the latest boolean is true', () => {
    const mod = makeModule([bool('done')], cfg({ field: 'done', mode: 'latest', timeWindow: 'today' }))
    expect(one(mod, [entry(TODAY, { done: true })])).toEqual({ label: 'Done', text: 'Done', empty: false })
  })

  it('renders Done for a presence-only (mark-done) entry with no field value', () => {
    const mod = makeModule([bool('done')], cfg({ field: 'done', mode: 'latest', timeWindow: 'today' }))
    expect(one(mod, [entry(TODAY, {})]).text).toBe('Done')
  })

  it('renders Not done when the latest boolean is explicitly false', () => {
    const mod = makeModule([bool('done')], cfg({ field: 'done', mode: 'latest', timeWindow: 'today' }))
    expect(one(mod, [entry(TODAY, { done: false })]).text).toBe('Not done')
  })

  it('renders Not logged when there is no entry in the window', () => {
    const mod = makeModule([bool('done')], cfg({ field: 'done', mode: 'latest', timeWindow: 'today' }))
    expect(one(mod, [])).toEqual({ label: 'Done', text: 'Not logged', empty: true })
  })
})

describe('resolveCardItems — defaults when unconfigured', () => {
  it('uses the first numeric field summed over today', () => {
    const mod = makeModule([text('note'), num('calories', 'kcal'), num('protein')])
    expect(resolveCardItems(mod)).toEqual([{ field: 'calories', mode: 'sum', timeWindow: 'today' }])
  })

  it('uses latest for a single boolean tracker', () => {
    const mod = makeModule([bool('done')])
    expect(resolveCardItems(mod)).toEqual([{ field: 'done', mode: 'latest', timeWindow: 'today' }])
  })

  it('falls back to counting entries when there is no numeric or single-boolean field', () => {
    const mod = makeModule([text('note'), text('mood')])
    expect(resolveCardItems(mod)).toEqual([{ field: 'note', mode: 'count', timeWindow: 'today' }])
  })

  it('returns the explicit items when present', () => {
    const items: CardSummaryItem[] = [
      { field: 'weight', mode: 'latest', timeWindow: 'all' },
      { field: 'weight', mode: 'min', timeWindow: 'week' },
    ]
    const mod = makeModule([num('weight', 'lbs')], { items })
    expect(resolveCardItems(mod)).toEqual(items)
  })

  it('drops stale items and falls back to default when none remain valid', () => {
    const mod = makeModule([num('calories', 'kcal')], { items: [{ field: 'deleted', mode: 'avg', timeWindow: 'week' }] })
    expect(resolveCardItems(mod)).toEqual([{ field: 'calories', mode: 'sum', timeWindow: 'today' }])
  })
})
