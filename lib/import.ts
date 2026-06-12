import type { ModuleField } from './types'

// ----------------------------------------------------------------
// Declarative mapping — same shape the AI will fill in later
// ----------------------------------------------------------------

export interface ImportFieldMapping {
  column: string
  fieldKey: string
}

export interface ImportMapping {
  dateColumn: string
  fieldMappings: ImportFieldMapping[]
}

export type ImportDateFormat = 'auto' | 'mdy' | 'dmy'

export type ImportRowStatus = 'ok' | 'error' | 'duplicate'

export interface ImportRowResult {
  status: ImportRowStatus
  rowIndex: number
  entry_date: string
  values: Record<string, unknown>
  reason?: string
}

/** Row ready for server insert (status === 'ok' only). */
export interface ImportRowPayload {
  entry_date: string
  values: Record<string, unknown>
}

export const MAX_IMPORT_ROWS = 5000

// ----------------------------------------------------------------
// Date parsing — timezone-safe; never round-trip through Date for input
// ----------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

function toIso(year: number, month: number, day: number): string | null {
  if (!isValidYmd(year, month, day)) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Parse a date string into YYYY-MM-DD without timezone shifts. */
export function parseImportDate(raw: string, format: ImportDateFormat): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // ISO YYYY-MM-DD (also used for XLSX cells formatted as yyyy-mm-dd)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (iso) {
    return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }

  if (format === 'auto') return null

  const sep = trimmed.includes('/') ? '/' : trimmed.includes('.') ? '.' : trimmed.includes('-') ? '-' : null
  if (!sep) return null

  const parts = trimmed.split(sep).map((p) => p.trim())
  if (parts.length !== 3) return null

  const nums = parts.map(Number)
  if (nums.some((n) => isNaN(n))) return null

  let year: number, month: number, day: number
  if (format === 'mdy') {
    ;[month, day, year] = nums
    if (year < 100) year += 2000
  } else {
    ;[day, month, year] = nums
    if (year < 100) year += 2000
  }

  return toIso(year, month, day)
}

// ----------------------------------------------------------------
// Value coercion per field type
// ----------------------------------------------------------------

const BOOL_TRUE = new Set(['true', 'yes', 'y', '1'])
const BOOL_FALSE = new Set(['false', 'no', 'n', '0'])

export function coerceImportValue(
  raw: unknown,
  field: ModuleField,
  dateFormat: ImportDateFormat
): { value: unknown; error?: string; warning?: string } {
  const str = raw === null || raw === undefined ? '' : String(raw).trim()

  if (str === '') {
    if (field.required) return { value: null, error: `${field.label} is required` }
    return { value: null }
  }

  switch (field.type) {
    case 'number': {
      const n = Number(str)
      if (isNaN(n)) return { value: null, error: `${field.label}: invalid number "${str}"` }
      return { value: n }
    }
    case 'rating': {
      const n = Number(str)
      if (isNaN(n)) return { value: null, error: `${field.label}: invalid rating "${str}"` }
      const max = field.options?.length ? field.options.length : 5
      if (n < 1 || n > max) {
        return { value: n, warning: `${field.label}: ${n} is outside 1–${max}` }
      }
      return { value: n }
    }
    case 'boolean': {
      const lower = str.toLowerCase()
      if (BOOL_TRUE.has(lower)) return { value: true }
      if (BOOL_FALSE.has(lower)) return { value: false }
      return { value: null, error: `${field.label}: expected true/false/yes/no/1/0, got "${str}"` }
    }
    case 'select': {
      const opts = field.options ?? []
      const match = opts.find((o) => o.toLowerCase() === str.toLowerCase())
      if (!match) {
        return { value: null, error: `${field.label}: "${str}" is not one of [${opts.join(', ')}]` }
      }
      return { value: match }
    }
    case 'date': {
      const d = parseImportDate(str, dateFormat)
      if (!d) return { value: null, error: `${field.label}: invalid date "${str}"` }
      return { value: d }
    }
    case 'text':
      return { value: str }
    case 'photo':
      return { value: null, error: `${field.label}: photo fields cannot be imported` }
    default:
      return { value: str }
  }
}

// ----------------------------------------------------------------
// Row validation (dry-run)
// ----------------------------------------------------------------

export function validateImportRows(
  parsedRows: Record<string, string>[],
  mapping: ImportMapping,
  fields: ModuleField[],
  existingDates: Set<string>,
  dateFormat: ImportDateFormat,
  options?: { includeDuplicates?: boolean }
): ImportRowResult[] {
  const includeDuplicates = options?.includeDuplicates ?? false
  const fieldByKey = new Map(fields.map((f) => [f.key, f]))
  const results: ImportRowResult[] = []
  const seenDates = new Set<string>()

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i]
    const rowNum = i + 2 // 1-indexed + header row

    const rawDate = row[mapping.dateColumn]
    if (rawDate === undefined || String(rawDate).trim() === '') {
      results.push({
        status: 'error',
        rowIndex: rowNum,
        entry_date: '',
        values: {},
        reason: 'Missing date',
      })
      continue
    }

    const entry_date = parseImportDate(String(rawDate), dateFormat)
    if (!entry_date) {
      results.push({
        status: 'error',
        rowIndex: rowNum,
        entry_date: '',
        values: {},
        reason: `Invalid date: "${rawDate}"`,
      })
      continue
    }

    const values: Record<string, unknown> = {}
    const errors: string[] = []

    for (const fm of mapping.fieldMappings) {
      const field = fieldByKey.get(fm.fieldKey)
      if (!field) {
        errors.push(`Unknown field "${fm.fieldKey}"`)
        continue
      }
      const raw = row[fm.column]
      const { value, error } = coerceImportValue(raw, field, dateFormat)
      if (error) errors.push(error)
      values[fm.fieldKey] = value
    }

    if (errors.length > 0) {
      results.push({ status: 'error', rowIndex: rowNum, entry_date, values, reason: errors.join('; ') })
      continue
    }

    const isExisting = existingDates.has(entry_date)
    const isDuplicateInFile = seenDates.has(entry_date)
    seenDates.add(entry_date)

    if (isExisting || isDuplicateInFile) {
      if (!includeDuplicates) {
        results.push({
          status: 'duplicate',
          rowIndex: rowNum,
          entry_date,
          values,
          reason: isExisting
            ? `Date ${entry_date} already has an entry`
            : `Duplicate date ${entry_date} in file`,
        })
        continue
      }
    }

    results.push({ status: 'ok', rowIndex: rowNum, entry_date, values })
  }

  return results
}

/** Extract rows ready for insert from validation results. */
export function rowsToImport(results: ImportRowResult[]): ImportRowPayload[] {
  return results
    .filter((r) => r.status === 'ok')
    .map((r) => ({ entry_date: r.entry_date, values: r.values }))
}
