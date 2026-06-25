import { describe, it, expect } from 'vitest'
import { computeCardSummary, resolveCardConfig } from '../card-summary'
import type { Module, ModuleField, Entry, CardConfig } from '../types'

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

const num = (key: string, unit?: string): ModuleField => ({ key, label: key, type: 'number', required: false, unit })
const bool = (key: string): ModuleField => ({ key, label: key, type: 'boolean', required: false })
const text = (key: string): ModuleField => ({ key, label: key, type: 'text', required: false })

describe('computeCardSummary — configured', () => {
  it('sums a numeric field over today and renders the unit', () => {
    const mod = makeModule([num('calories', 'kcal')], { field: 'calories', mode: 'sum', timeWindow: 'today' })
    const entries = [entry(TODAY, { calories: 800 }), entry(TODAY, { calories: 1047 })]
    expect(computeCardSummary(mod, entries, TODAY)).toEqual({ text: '1,847 kcal', empty: false })
  })

  it('renders the latest entry value (most recent entry_date), not an aggregate', () => {
    const mod = makeModule([num('weight', 'lbs')], { field: 'weight', mode: 'latest', timeWindow: 'all' })
    const entries = [entry('2024-06-20', { weight: 156 }), entry('2024-06-24', { weight: 154 })]
    expect(computeCardSummary(mod, entries, TODAY)).toEqual({ text: '154 lbs', empty: false })
  })

  it('breaks latest ties on the same day by created_at', () => {
    const mod = makeModule([num('weight', 'lbs')], { field: 'weight', mode: 'latest', timeWindow: 'all' })
    const entries = [
      entry('2024-06-24', { weight: 154 }, '2024-06-24T08:00:00Z'),
      entry('2024-06-24', { weight: 153 }, '2024-06-24T20:00:00Z'),
    ]
    expect(computeCardSummary(mod, entries, TODAY).text).toBe('153 lbs')
  })

  it('takes the max over today', () => {
    const mod = makeModule([num('score')], { field: 'score', mode: 'max', timeWindow: 'today' })
    const entries = [entry(TODAY, { score: 42 }), entry(TODAY, { score: 51 }), entry(TODAY, { score: 47 })]
    expect(computeCardSummary(mod, entries, TODAY)).toEqual({ text: '51', empty: false })
  })

  it('averages and rounds to one decimal', () => {
    const mod = makeModule([num('rating')], { field: 'rating', mode: 'avg', timeWindow: 'all' })
    const entries = [entry(TODAY, { rating: 2 }), entry(TODAY, { rating: 4 }), entry(TODAY, { rating: 3 })]
    expect(computeCardSummary(mod, entries, TODAY).text).toBe('3')

    const mod2 = makeModule([num('rating')], { field: 'rating', mode: 'avg', timeWindow: 'all' })
    const e2 = [entry(TODAY, { rating: 153 }), entry(TODAY, { rating: 154 }), entry(TODAY, { rating: 155 }), entry(TODAY, { rating: 154 })]
    // (153+154+155+154)/4 = 154; use a non-integer case:
    const e3 = [entry(TODAY, { rating: 1 }), entry(TODAY, { rating: 2 }), entry(TODAY, { rating: 2 })]
    expect(computeCardSummary(mod2, e2, TODAY).text).toBe('154')
    expect(computeCardSummary(mod2, e3, TODAY).text).toBe('1.7')
  })

  it('counts entries in the window (count is entries, not field values)', () => {
    const mod = makeModule([text('note')], { field: 'note', mode: 'count', timeWindow: 'today' })
    const entries = [entry(TODAY, {}), entry(TODAY, { note: 'a' }), entry(TODAY, {})]
    expect(computeCardSummary(mod, entries, TODAY)).toEqual({ text: '3', empty: false })
  })

  it('scopes a week window to the last 7 days inclusive', () => {
    const mod = makeModule([num('minutes')], { field: 'minutes', mode: 'sum', timeWindow: 'week' })
    const entries = [
      entry('2024-06-25', { minutes: 10 }), // today — in
      entry('2024-06-19', { minutes: 5 }), //  6 days ago — in
      entry('2024-06-18', { minutes: 100 }), // 7 days ago — out
    ]
    expect(computeCardSummary(mod, entries, TODAY).text).toBe('15')
  })

  it('shows "Not logged" when there are no entries in the window', () => {
    const mod = makeModule([num('calories', 'kcal')], { field: 'calories', mode: 'sum', timeWindow: 'today' })
    const entries = [entry('2024-06-01', { calories: 500 })] // outside today
    expect(computeCardSummary(mod, entries, TODAY)).toEqual({ text: 'Not logged', empty: true })
  })

  it('shows "Not logged" when entries exist but the field has no numeric value', () => {
    const mod = makeModule([num('weight', 'lbs')], { field: 'weight', mode: 'latest', timeWindow: 'today' })
    const entries = [entry(TODAY, {})] // present (mark-done) but no weight value
    expect(computeCardSummary(mod, entries, TODAY)).toEqual({ text: 'Not logged', empty: true })
  })
})

describe('computeCardSummary — boolean done/not-done', () => {
  it('renders Done when the latest boolean is true', () => {
    const mod = makeModule([bool('done')], { field: 'done', mode: 'latest', timeWindow: 'today' })
    expect(computeCardSummary(mod, [entry(TODAY, { done: true })], TODAY)).toEqual({ text: 'Done', empty: false })
  })

  it('renders Done for a presence-only (mark-done) entry with no field value', () => {
    const mod = makeModule([bool('done')], { field: 'done', mode: 'latest', timeWindow: 'today' })
    expect(computeCardSummary(mod, [entry(TODAY, {})], TODAY)).toEqual({ text: 'Done', empty: false })
  })

  it('renders Not done when the latest boolean is explicitly false', () => {
    const mod = makeModule([bool('done')], { field: 'done', mode: 'latest', timeWindow: 'today' })
    expect(computeCardSummary(mod, [entry(TODAY, { done: false })], TODAY)).toEqual({ text: 'Not done', empty: false })
  })

  it('renders Not logged when there is no entry in the window', () => {
    const mod = makeModule([bool('done')], { field: 'done', mode: 'latest', timeWindow: 'today' })
    expect(computeCardSummary(mod, [], TODAY)).toEqual({ text: 'Not logged', empty: true })
  })
})

describe('resolveCardConfig — defaults when unconfigured', () => {
  it('uses the first numeric field summed over today', () => {
    const mod = makeModule([text('note'), num('calories', 'kcal'), num('protein')])
    expect(resolveCardConfig(mod)).toEqual({ field: 'calories', mode: 'sum', timeWindow: 'today' })
  })

  it('uses latest for a single boolean tracker', () => {
    const mod = makeModule([bool('done')])
    expect(resolveCardConfig(mod)).toEqual({ field: 'done', mode: 'latest', timeWindow: 'today' })
  })

  it('falls back to counting entries when there is no numeric or single-boolean field', () => {
    const mod = makeModule([text('note'), text('mood')])
    expect(resolveCardConfig(mod)).toEqual({ field: 'note', mode: 'count', timeWindow: 'today' })
  })

  it('returns the explicit card_config when present', () => {
    const cfg: CardConfig = { field: 'weight', mode: 'latest', timeWindow: 'all' }
    const mod = makeModule([num('weight', 'lbs')], cfg)
    expect(resolveCardConfig(mod)).toEqual(cfg)
  })

  it('ignores a stale card_config whose field no longer exists, falling back to default', () => {
    const mod = makeModule([num('calories', 'kcal')], { field: 'deleted', mode: 'avg', timeWindow: 'week' })
    expect(resolveCardConfig(mod)).toEqual({ field: 'calories', mode: 'sum', timeWindow: 'today' })
  })
})
