// lib/__tests__/formula.test.ts
import { describe, expect, it } from 'vitest'
import { validateExpression, computeFormulaSeries, withFormulaEntries, FORMULA_VALUE_FIELD } from '../formula'
import type { Entry, FormulaConfig, Module } from '../types'

// ── validateExpression (brief Step 1, verbatim) ──────────────────

describe('validateExpression', () => {
  it('accepts a valid expression', () => {
    expect(validateExpression('a + b * 2', ['a', 'b'])).toBeNull()
  })
  it('rejects unknown alias', () => {
    expect(validateExpression('a + c', ['a', 'b'])).not.toBeNull()
  })
  it('rejects unbalanced parens', () => {
    expect(validateExpression('(a + b', ['a', 'b'])).not.toBeNull()
  })
  it('rejects empty expression', () => {
    expect(validateExpression('', ['a'])).not.toBeNull()
  })
  it('rejects bare operators / trailing operator', () => {
    expect(validateExpression('a +', ['a'])).not.toBeNull()
    expect(validateExpression('* a', ['a'])).not.toBeNull()
  })
  it('handles alias that is a prefix of another (a vs ab)', () => {
    expect(validateExpression('ab + a', ['a', 'ab'])).toBeNull()
  })
})

// ── computeFormulaSeries numeric edges (brief Step 2) ────────────

function makeEntry(moduleId: string, date: string, values: Record<string, unknown>): Entry {
  return {
    id: `e-${moduleId}-${date}`,
    module_id: moduleId,
    user_id: 'u-1',
    values,
    entry_date: date,
    created_at: `${date}T10:00:00Z`,
  }
}

describe('computeFormulaSeries numeric edges', () => {
  it('division by zero on one day does not leak Infinity into the series', () => {
    // a / b, b = 0 on 06-01, b = 2 on 06-02
    const config: FormulaConfig = {
      inputs: [
        { moduleId: 'mod-a', field: 'val', alias: 'a' },
        { moduleId: 'mod-b', field: 'val', alias: 'b' },
      ],
      expression: 'a / b',
    }
    const entriesByModule = new Map<string, Entry[]>([
      ['mod-a', [makeEntry('mod-a', '2026-06-01', { val: 10 }), makeEntry('mod-a', '2026-06-02', { val: 10 })]],
      ['mod-b', [makeEntry('mod-b', '2026-06-01', { val: 0 }), makeEntry('mod-b', '2026-06-02', { val: 2 })]],
    ])
    const points = computeFormulaSeries(config, entriesByModule)
    // The zero-division day must not appear as Infinity — computeFormulaSeries
    // already guards with Number.isFinite, so the day is dropped entirely
    // rather than leaking Infinity downstream to getTimeSeries/Recharts.
    expect(points.find((p) => p.date === '2026-06-01')).toBeUndefined()
    expect(points.find((p) => p.date === '2026-06-02')).toEqual({ date: '2026-06-02', value: 5 })
    expect(points.every((p) => Number.isFinite(p.value))).toBe(true)
  })

  it('0/0 (NaN) on one day is also dropped, not propagated as NaN', () => {
    const config: FormulaConfig = {
      inputs: [
        { moduleId: 'mod-a', field: 'val', alias: 'a' },
        { moduleId: 'mod-b', field: 'val', alias: 'b' },
      ],
      expression: 'a / b',
    }
    const entriesByModule = new Map<string, Entry[]>([
      ['mod-a', [makeEntry('mod-a', '2026-06-01', { val: 0 })]],
      ['mod-b', [makeEntry('mod-b', '2026-06-01', { val: 0 })]],
    ])
    const points = computeFormulaSeries(config, entriesByModule)
    expect(points).toEqual([])
  })

  it('input module has no entry for a day the other input has one → day is skipped (no default configured)', () => {
    const config: FormulaConfig = {
      inputs: [
        { moduleId: 'mod-a', field: 'val', alias: 'a' },
        { moduleId: 'mod-b', field: 'val', alias: 'b' },
      ],
      expression: 'a + b',
    }
    const entriesByModule = new Map<string, Entry[]>([
      ['mod-a', [makeEntry('mod-a', '2026-06-01', { val: 5 })]],
      ['mod-b', []], // no entries at all for b
    ])
    const points = computeFormulaSeries(config, entriesByModule)
    // Matches formula-summary.tsx's documented behavior: "A day is included
    // when every input has a logged value or a configured default" — no
    // default here, so the day is dropped rather than zero-filled or NaN.
    expect(points).toEqual([])
  })

  it('input module has no entry for a day, but a defaultValue is configured → default is used', () => {
    const config: FormulaConfig = {
      inputs: [
        { moduleId: 'mod-a', field: 'val', alias: 'a' },
        { moduleId: 'mod-b', field: 'val', alias: 'b', defaultValue: 3 },
      ],
      expression: 'a + b',
    }
    const entriesByModule = new Map<string, Entry[]>([
      ['mod-a', [makeEntry('mod-a', '2026-06-01', { val: 5 })]],
      ['mod-b', []],
    ])
    const points = computeFormulaSeries(config, entriesByModule)
    expect(points).toEqual([{ date: '2026-06-01', value: 8 }])
  })

  it('empty entries entirely → returns [], no throw', () => {
    const config: FormulaConfig = {
      inputs: [{ moduleId: 'mod-a', field: 'val', alias: 'a' }],
      expression: 'a * 2',
    }
    expect(() => computeFormulaSeries(config, new Map())).not.toThrow()
    expect(computeFormulaSeries(config, new Map())).toEqual([])
  })

  it('non-numeric value in an input field is dropped, not NaN — and the day is skipped even with a default', () => {
    const config: FormulaConfig = {
      inputs: [{ moduleId: 'mod-a', field: 'val', alias: 'a', defaultValue: 99 }],
      expression: 'a',
    }
    const entriesByModule = new Map<string, Entry[]>([
      ['mod-a', [makeEntry('mod-a', '2026-06-01', { val: 'not-a-number' })]],
    ])
    const points = computeFormulaSeries(config, entriesByModule)
    // toNumber('not-a-number') → null → the date never enters that input's
    // byDate map (line 251-254), so it never enters `allDates` either
    // (allDates is built purely from perInput byDate keys, line 265-266).
    // defaultValue only fires for days where the module has *zero* entries;
    // a day with an entry whose value field is non-numeric is silently
    // dropped from the whole series, not defaulted. No NaN/Infinity leaks.
    expect(points).toEqual([])
  })

  it('multiple entries on the same day are averaged per input', () => {
    const config: FormulaConfig = {
      inputs: [{ moduleId: 'mod-a', field: 'val', alias: 'a' }],
      expression: 'a',
    }
    const entriesByModule = new Map<string, Entry[]>([
      ['mod-a', [
        makeEntry('mod-a', '2026-06-01', { val: 10 }),
        makeEntry('mod-a', '2026-06-01', { val: 20 }),
      ]],
    ])
    const points = computeFormulaSeries(config, entriesByModule)
    expect(points).toEqual([{ date: '2026-06-01', value: 15 }])
  })
})

// ── withFormulaEntries composition (brief Step 3) ────────────────

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    user_id: 'u-1',
    name: 'Test',
    fields: [{ key: 'val', label: 'Val', type: 'number', required: false }],
    kind: 'standard',
    formula_config: null,
    crystal_type: 'amethyst',
    card_config: null,
    dashboard_config: null,
    is_builtin: false,
    shared: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('withFormulaEntries composition', () => {
  it('appends computed entries for a formula module alongside its source entries', () => {
    const source = makeModule({ id: 'mod-a', kind: 'standard' })
    const formula = makeModule({
      id: 'mod-f',
      kind: 'formula',
      fields: [FORMULA_VALUE_FIELD],
      formula_config: { inputs: [{ moduleId: 'mod-a', field: 'val', alias: 'a' }], expression: 'a * 2' },
    })
    const entries = [makeEntry('mod-a', '2026-06-01', { val: 5 })]
    const result = withFormulaEntries([source, formula], entries)
    expect(result).toHaveLength(2)
    const formulaEntry = result.find((e) => e.module_id === 'mod-f')
    expect(formulaEntry?.values).toEqual({ value: 10 })
    expect(formulaEntry?.entry_date).toBe('2026-06-01')
  })

  it('formula-on-formula: a formula module whose input references another formula module silently sees no data', () => {
    // This state should be unreachable via the builder/server-action guards
    // (app/actions/formula.ts validateFormulaInputs rejects kind === 'formula'
    // inputs), but withFormulaEntries itself does not defend against it —
    // it evaluates in a single pass over entriesByModule built purely from
    // stored entries, so a formula-on-formula input never resolves.
    const base = makeModule({ id: 'mod-a', kind: 'standard' })
    const formulaA = makeModule({
      id: 'mod-fa',
      kind: 'formula',
      fields: [FORMULA_VALUE_FIELD],
      formula_config: { inputs: [{ moduleId: 'mod-a', field: 'val', alias: 'a' }], expression: 'a * 2' },
    })
    // formulaB illegitimately depends on formulaA's computed output
    const formulaB = makeModule({
      id: 'mod-fb',
      kind: 'formula',
      fields: [FORMULA_VALUE_FIELD],
      formula_config: { inputs: [{ moduleId: 'mod-fa', field: 'value', alias: 'x' }], expression: 'x + 1' },
    })
    const entries = [makeEntry('mod-a', '2026-06-01', { val: 5 })]
    const result = withFormulaEntries([base, formulaA, formulaB], entries)
    // formulaA's entry is computed (10), but formulaB never sees it because
    // it's derived in the same pass from the original `entries`, not from
    // formulaA's freshly-computed output.
    expect(result.find((e) => e.module_id === 'mod-fa')?.values).toEqual({ value: 10 })
    expect(result.find((e) => e.module_id === 'mod-fb')).toBeUndefined()
  })

  it('formula whose input module was deleted (dangling module_id) yields no entries, does not throw', () => {
    const formula = makeModule({
      id: 'mod-f',
      kind: 'formula',
      fields: [FORMULA_VALUE_FIELD],
      formula_config: { inputs: [{ moduleId: 'mod-deleted', field: 'val', alias: 'a' }], expression: 'a * 2' },
    })
    const entries: Entry[] = [] // the referenced module's entries no longer exist
    expect(() => withFormulaEntries([formula], entries)).not.toThrow()
    const result = withFormulaEntries([formula], entries)
    expect(result.find((e) => e.module_id === 'mod-f')).toBeUndefined()
    expect(result).toEqual([])
  })

  it('no formula modules present → returns entries unchanged (same reference)', () => {
    const mod = makeModule({ id: 'mod-a', kind: 'standard' })
    const entries = [makeEntry('mod-a', '2026-06-01', { val: 5 })]
    expect(withFormulaEntries([mod], entries)).toBe(entries)
  })
})
