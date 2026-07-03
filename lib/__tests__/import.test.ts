import { describe, expect, it } from 'vitest'
import {
  parseImportDate,
  coerceImportValue,
  validateImportRows,
  rowsToImport,
  MAX_IMPORT_ROWS,
  type ImportMapping,
} from '../import'
import type { ModuleField } from '../types'

// ----------------------------------------------------------------
// Step 1: parseImportDate
// ----------------------------------------------------------------

describe('parseImportDate', () => {
  it('parses ISO unambiguously in all three modes', () => {
    for (const f of ['auto', 'mdy', 'dmy'] as const) {
      expect(parseImportDate('2026-07-02', f)).toBe('2026-07-02')
    }
  })

  it('mdy vs dmy disambiguate 01/02/2026 correctly', () => {
    expect(parseImportDate('01/02/2026', 'mdy')).toBe('2026-01-02')
    expect(parseImportDate('01/02/2026', 'dmy')).toBe('2026-02-01')
  })

  it('rejects impossible dates (Feb 30, month 13) with null — not a rolled-over date', () => {
    // isValidYmd round-trips through Date.UTC and checks the components come
    // back unchanged, so this trap is already guarded: characterization, not a bug.
    expect(parseImportDate('02/30/2026', 'mdy')).toBeNull() // JS Date would roll to Mar 2 — that's the trap
    expect(parseImportDate('13/01/2026', 'mdy')).toBeNull()
  })

  it('auto mode only ever matches the ISO YYYY-MM-DD regex; any slash/dot/dash format returns null', () => {
    // Documented choice, pinned here: format === 'auto' short-circuits to null
    // (lib/import.ts:69) immediately after the ISO regex fails to match, so
    // auto mode never attempts mdy/dmy disambiguation on an ambiguous string
    // like '01/02/2026' — it simply rejects it. There is no "guess" logic.
    expect(parseImportDate('01/02/2026', 'auto')).toBeNull()
    expect(parseImportDate('2026/07/02', 'auto')).toBeNull()
  })

  it('trims whitespace; rejects empty/garbage with null', () => {
    expect(parseImportDate('  2026-07-02  ', 'auto')).toBe('2026-07-02')
    expect(parseImportDate('not a date', 'auto')).toBeNull()
    expect(parseImportDate('', 'auto')).toBeNull()
    expect(parseImportDate('   ', 'mdy')).toBeNull()
  })

  it('two-digit years: century rule adds 2000 unconditionally, no pivot', () => {
    // lib/import.ts:83/86 — `if (year < 100) year += 2000` for both mdy and dmy,
    // regardless of how large or small the 2-digit year is. '01/02/99' becomes
    // 2099, not 1999. Pinning current behavior; no sliding pivot window exists.
    expect(parseImportDate('01/02/26', 'mdy')).toBe('2026-01-02')
    expect(parseImportDate('01/02/99', 'mdy')).toBe('2099-01-02')
  })

  it('rejects non-numeric or malformed slash-separated parts', () => {
    expect(parseImportDate('ab/02/2026', 'mdy')).toBeNull()
    expect(parseImportDate('01/02', 'mdy')).toBeNull()
    expect(parseImportDate('01/02/2026/03', 'mdy')).toBeNull()
  })

  it('supports dot and dash separators in non-auto modes', () => {
    expect(parseImportDate('01.02.2026', 'mdy')).toBe('2026-01-02')
    // dash-separated 2-part-fallback: 3-part dash is ambiguous with ISO's own
    // dash format, but ISO regex only matches 4-digit-year-first, so a dmy/mdy
    // dash date like '02-01-2026' falls through to the slash/dot/dash branch.
    expect(parseImportDate('02-01-2026', 'dmy')).toBe('2026-01-02')
  })
})

// ----------------------------------------------------------------
// Step 2a: coerceImportValue — boolean coercion table
// ----------------------------------------------------------------

function boolField(overrides: Partial<ModuleField> = {}): ModuleField {
  return { key: 'done', label: 'Done', type: 'boolean', required: false, ...overrides }
}

describe('coerceImportValue — boolean', () => {
  const field = boolField()
  it.each([
    ['yes', true],
    ['no', false],
    ['true', true],
    ['FALSE', false],
    ['1', true],
    ['0', false],
    ['y', true],
    ['n', false],
    ['Y', true],
    ['TRUE', true],
  ] as const)('%s -> %s', (raw, expected) => {
    expect(coerceImportValue(raw, field, 'auto')).toEqual({ value: expected })
  })

  it('empty string on optional boolean field yields null value, no error', () => {
    expect(coerceImportValue('', field, 'auto')).toEqual({ value: null })
  })

  it('empty string on required boolean field errors', () => {
    const required = boolField({ required: true })
    expect(coerceImportValue('', required, 'auto')).toEqual({
      value: null,
      error: 'Done is required',
    })
  })

  it('unrecognized boolean text errors, does not silently coerce', () => {
    const result = coerceImportValue('maybe', field, 'auto')
    expect(result.error).toBeDefined()
    expect(result.value).toBeNull()
  })
})

// ----------------------------------------------------------------
// Step 2a: coerceImportValue — number coercion
// ----------------------------------------------------------------

function numberField(overrides: Partial<ModuleField> = {}): ModuleField {
  return { key: 'weight', label: 'Weight', type: 'number', required: false, ...overrides }
}

describe('coerceImportValue — number', () => {
  const field = numberField()

  it('rejects thousands-separator numbers like "1,500" — no silent NaN reaches an ok row', () => {
    const result = coerceImportValue('1,500', field, 'auto')
    expect(result.error).toBeDefined()
    expect(result.value).toBeNull()
    expect(Number.isNaN(result.value)).toBe(false) // never a bare NaN value
  })

  it('trims whitespace around a valid number', () => {
    expect(coerceImportValue('  42 ', field, 'auto')).toEqual({ value: 42 })
  })

  it('rejects trailing garbage like "42abc"', () => {
    const result = coerceImportValue('42abc', field, 'auto')
    expect(result.error).toBeDefined()
    expect(result.value).toBeNull()
  })

  it('empty string on optional number field yields null, not 0 or NaN', () => {
    expect(coerceImportValue('', field, 'auto')).toEqual({ value: null })
  })
})

// ----------------------------------------------------------------
// Step 2a: coerceImportValue — rating bounds
// ----------------------------------------------------------------

function ratingField(overrides: Partial<ModuleField> = {}): ModuleField {
  return { key: 'mood', label: 'Mood', type: 'rating', required: false, ...overrides }
}

describe('coerceImportValue — rating bounds', () => {
  it('in-range rating (default 1-5) returns ok value, no warning', () => {
    const field = ratingField()
    expect(coerceImportValue('3', field, 'auto')).toEqual({ value: 3 })
  })

  it('out-of-range rating is a WARNING not an error — value passes through unbounded', () => {
    // lib/import.ts:117-124: out-of-bounds ratings return { value: n, warning }
    // (not error). See F-10: validateImportRows only inspects `error`, never
    // `warning`, so this row becomes status 'ok' and the out-of-range value is
    // imported silently — no surfaced warning anywhere in the pipeline.
    const field = ratingField()
    const result = coerceImportValue('7', field, 'auto')
    expect(result.value).toBe(7)
    expect(result.error).toBeUndefined()
    expect(result.warning).toBe('Mood: 7 is outside 1–5')
  })

  it('rating max derives from options.length when options are present', () => {
    const field = ratingField({ options: ['a', 'b', 'c'] })
    expect(coerceImportValue('3', field, 'auto')).toEqual({ value: 3 })
    const result = coerceImportValue('4', field, 'auto')
    expect(result.warning).toBe('Mood: 4 is outside 1–3')
  })

  it('non-numeric rating errors', () => {
    const field = ratingField()
    const result = coerceImportValue('great', field, 'auto')
    expect(result.error).toBeDefined()
    expect(result.value).toBeNull()
  })
})

// ----------------------------------------------------------------
// Step 2a: coerceImportValue — other field types (light coverage for context)
// ----------------------------------------------------------------

describe('coerceImportValue — select and text', () => {
  it('select matches case-insensitively and normalizes to the canonical option', () => {
    const field: ModuleField = { key: 'mood', label: 'Mood', type: 'select', required: false, options: ['Good', 'Bad'] }
    expect(coerceImportValue('good', field, 'auto')).toEqual({ value: 'Good' })
  })

  it('select rejects values outside the option list', () => {
    const field: ModuleField = { key: 'mood', label: 'Mood', type: 'select', required: false, options: ['Good', 'Bad'] }
    const result = coerceImportValue('Ugly', field, 'auto')
    expect(result.error).toBeDefined()
  })

  it('text passes the trimmed string through unchanged', () => {
    const field: ModuleField = { key: 'note', label: 'Note', type: 'text', required: false }
    expect(coerceImportValue('  hello world  ', field, 'auto')).toEqual({ value: 'hello world' })
  })

  it('photo fields always error — cannot be imported', () => {
    const field: ModuleField = { key: 'pic', label: 'Pic', type: 'photo', required: false }
    const result = coerceImportValue('anything', field, 'auto')
    expect(result.error).toBeDefined()
    expect(result.value).toBeNull()
  })
})

// ----------------------------------------------------------------
// Step 2b: validateImportRows — MAX_IMPORT_ROWS boundary
// ----------------------------------------------------------------

const numField: ModuleField = { key: 'weight', label: 'Weight', type: 'number', required: false }

function mappingFor(field: ModuleField): ImportMapping {
  return { dateColumn: 'date', fieldMappings: [{ column: 'w', fieldKey: field.key }] }
}

function makeRows(n: number): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  for (let i = 0; i < n; i++) {
    // spread dates across days so none collide/duplicate
    const day = String((i % 27) + 1).padStart(2, '0')
    const month = String(((i / 27) | 0) % 12 + 1).padStart(2, '0')
    rows.push({ date: `2026-${month}-${day}`, w: '10' })
  }
  return rows
}

describe('validateImportRows — MAX_IMPORT_ROWS boundary', () => {
  it('validates exactly MAX_IMPORT_ROWS rows without special-casing the count', () => {
    const rows = makeRows(MAX_IMPORT_ROWS)
    const results = validateImportRows(rows, mappingFor(numField), [numField], new Set(), 'auto')
    expect(results).toHaveLength(MAX_IMPORT_ROWS)
  })

  it('validates MAX_IMPORT_ROWS + 1 rows too — validateImportRows itself has no row-count cap', () => {
    // The MAX_IMPORT_ROWS limit is enforced by callers (import-wizard.tsx and
    // the bulkImportEntries server action), not by validateImportRows itself.
    // Pinning that this function is agnostic to the constant.
    const rows = makeRows(MAX_IMPORT_ROWS + 1)
    const results = validateImportRows(rows, mappingFor(numField), [numField], new Set(), 'auto')
    expect(results).toHaveLength(MAX_IMPORT_ROWS + 1)
  })
})

// ----------------------------------------------------------------
// Step 2b: validateImportRows — duplicate semantics + rowsToImport filtering
// ----------------------------------------------------------------

describe('validateImportRows — duplicate semantics', () => {
  const mapping = mappingFor(numField)

  it('marks a row duplicate when its date already exists in existingDates', () => {
    const rows = [{ date: '2026-07-02', w: '10' }]
    const results = validateImportRows(rows, mapping, [numField], new Set(['2026-07-02']), 'auto')
    expect(results).toEqual([
      {
        status: 'duplicate',
        rowIndex: 2,
        entry_date: '2026-07-02',
        values: { weight: 10 },
        reason: 'Date 2026-07-02 already has an entry',
      },
    ])
  })

  it('marks the second occurrence duplicate when the same date repeats within the file (first stays ok)', () => {
    const rows = [
      { date: '2026-07-02', w: '10' },
      { date: '2026-07-02', w: '20' },
    ]
    const results = validateImportRows(rows, mapping, [numField], new Set(), 'auto')
    expect(results[0].status).toBe('ok')
    expect(results[1].status).toBe('duplicate')
    expect(results[1].reason).toBe('Duplicate date 2026-07-02 in file')
  })

  it('includeDuplicates: true lets duplicate-dated rows through as ok', () => {
    const rows = [
      { date: '2026-07-02', w: '10' },
      { date: '2026-07-02', w: '20' },
    ]
    const results = validateImportRows(rows, mapping, [numField], new Set(['2026-07-02']), 'auto', {
      includeDuplicates: true,
    })
    expect(results.every((r) => r.status === 'ok')).toBe(true)
  })

  it('rowsToImport excludes error AND duplicate rows, includes only ok rows', () => {
    const rows = [
      { date: '2026-07-02', w: '10' }, // ok
      { date: '2026-07-02', w: '20' }, // duplicate (repeat date)
      { date: '', w: '30' }, // error (missing date)
      { date: '2026-07-04', w: 'notanumber' }, // error (bad value)
      { date: '2026-07-05', w: '50' }, // ok
    ]
    const results = validateImportRows(rows, mapping, [numField], new Set(), 'auto')
    const toImport = rowsToImport(results)
    expect(toImport).toEqual([
      { entry_date: '2026-07-02', values: { weight: 10 } },
      { entry_date: '2026-07-05', values: { weight: 50 } },
    ])
  })

  it('missing date column value produces an error row, not a crash', () => {
    const rows = [{ w: '10' }] // no `date` key at all
    const results = validateImportRows(rows, mapping, [numField], new Set(), 'auto')
    expect(results[0]).toMatchObject({ status: 'error', reason: 'Missing date' })
  })

  it('unmapped/unknown field key in mapping produces a row error', () => {
    const badMapping: ImportMapping = {
      dateColumn: 'date',
      fieldMappings: [{ column: 'w', fieldKey: 'ghost_field' }],
    }
    const rows = [{ date: '2026-07-02', w: '10' }]
    const results = validateImportRows(rows, badMapping, [numField], new Set(), 'auto')
    expect(results[0].status).toBe('error')
    expect(results[0].reason).toContain('Unknown field "ghost_field"')
  })

  it('out-of-range rating warning does not block the row from ending up ok and importable', () => {
    // Same F-10 gap surfaced at the validateImportRows/rowsToImport level:
    // a rating warning never becomes a row `error`, so rowsToImport happily
    // includes the row with the out-of-range value untouched.
    const rField: ModuleField = { key: 'mood', label: 'Mood', type: 'rating', required: false }
    const rMapping = mappingFor(rField)
    const rows = [{ date: '2026-07-02', w: '99' }]
    const results = validateImportRows(rows, rMapping, [rField], new Set(), 'auto')
    expect(results[0].status).toBe('ok')
    const toImport = rowsToImport(results)
    expect(toImport).toEqual([{ entry_date: '2026-07-02', values: { mood: 99 } }])
  })
})
