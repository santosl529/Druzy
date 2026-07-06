'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { bulkImportEntries } from '@/app/actions/import'
import {
  MAX_IMPORT_ROWS,
  rowsToImport,
  validateImportRows,
  type ImportDateFormat,
  type ImportMapping,
} from '@/lib/import'
import type { ModuleField } from '@/lib/types'

const SKIP = '__skip__'

interface Props {
  moduleId: string
  fields: ModuleField[]
  existingDates: string[]
}

type Step = 'upload' | 'map' | 'preview'

export function ImportWizard({ moduleId, fields, existingDates }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState<string | null>(null)

  const [columns, setColumns] = useState<string[]>([])
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')

  const [dateColumn, setDateColumn] = useState('')
  const [dateFormat, setDateFormat] = useState<ImportDateFormat>('auto')
  const [fieldColumns, setFieldColumns] = useState<Record<string, string>>({})

  const [includeDuplicates, setIncludeDuplicates] = useState(false)

  // Dates confirmed inserted by a prior partial-failure attempt (F-11 retry-safety):
  // chunks insert in payload order, so on partial failure the first
  // `result.inserted` payload rows are already committed. Folding their dates in
  // here makes a retry see them as duplicates instead of double-inserting.
  const [confirmedInsertedDates, setConfirmedInsertedDates] = useState<string[]>([])

  const mappableFields = fields.filter((f) => f.type !== 'photo')
  const existingDateSet = useMemo(
    () => new Set([...existingDates, ...confirmedInsertedDates]),
    [existingDates, confirmedInsertedDates]
  )

  const columnItems = columns.map((c) => ({ value: c, label: c }))
  const skipItems = [{ value: SKIP, label: '(skip)' }, ...columnItems]

  const dateFormatItems = [
    { value: 'auto', label: 'Auto (ISO YYYY-MM-DD)' },
    { value: 'mdy', label: 'MDY (M/D/YYYY)' },
    { value: 'dmy', label: 'DMY (D/M/YYYY)' },
  ]

  async function handleFile(file: File) {
    setError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
      const text = await file.text()
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      })
      if (result.errors.length > 0) {
        setError(result.errors[0].message)
        return
      }
      const rows = result.data.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''))
      if (rows.length === 0) {
        setError('No data rows found in file')
        return
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        setError(`File has ${rows.length} rows; maximum is ${MAX_IMPORT_ROWS}`)
        return
      }
      const cols = result.meta.fields ?? Object.keys(rows[0] ?? {})
      setColumns(cols)
      setParsedRows(rows.map(normalizeRow))
      setFileName(file.name)
      initMapping(cols, rows)
      setStep('map')
      return
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) {
        setError('Workbook has no sheets')
        return
      }
      const ws = wb.Sheets[sheetName]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        raw: false,
        dateNF: 'yyyy-mm-dd',
        defval: '',
      })
      const rows = raw
        .map((r) => stringifyRow(r))
        .filter((r) => Object.values(r).some((v) => v.trim() !== ''))
      if (rows.length === 0) {
        setError('No data rows found in file')
        return
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        setError(`File has ${rows.length} rows; maximum is ${MAX_IMPORT_ROWS}`)
        return
      }
      const cols = Object.keys(rows[0] ?? {})
      setColumns(cols)
      setParsedRows(rows)
      setFileName(file.name)
      initMapping(cols, rows)
      setStep('map')
      return
    }

    setError('Unsupported file type. Upload a .csv or .xlsx file.')
  }

  function initMapping(cols: string[], rows: Record<string, string>[]) {
    const dateGuess =
      cols.find((c) => /date/i.test(c)) ??
      cols[0] ??
      ''
    setDateColumn(dateGuess)

    const mapping: Record<string, string> = {}
    for (const field of mappableFields) {
      const guess =
        cols.find((c) => c.toLowerCase() === field.key.toLowerCase()) ??
        cols.find((c) => c.toLowerCase() === field.label.toLowerCase()) ??
        cols.find((c) => c.toLowerCase().includes(field.key.toLowerCase())) ??
        SKIP
      mapping[field.key] = guess
    }
    setFieldColumns(mapping)

    // If date column values look like MDY slashes, suggest MDY
    if (dateGuess && rows.length > 0) {
      const sample = String(rows[0][dateGuess] ?? '')
      if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(sample)) setDateFormat('mdy')
      else setDateFormat('auto')
    }
  }

  const mapping = useMemo((): ImportMapping | null => {
    if (!dateColumn) return null
    const fieldMappings = fields
      .filter((f) => f.type !== 'photo')
      .filter((f) => fieldColumns[f.key] && fieldColumns[f.key] !== SKIP)
      .map((f) => ({ column: fieldColumns[f.key], fieldKey: f.key }))
    if (fieldMappings.length === 0) return null
    return { dateColumn, fieldMappings }
  }, [dateColumn, fieldColumns, fields])

  const validationResults = useMemo(() => {
    if (step !== 'preview' || !mapping) return []
    return validateImportRows(parsedRows, mapping, fields, existingDateSet, dateFormat, {
      includeDuplicates,
    })
  }, [step, mapping, parsedRows, fields, existingDateSet, dateFormat, includeDuplicates])

  const okCount = validationResults.filter((r) => r.status === 'ok').length
  const dupCount = validationResults.filter((r) => r.status === 'duplicate').length
  const errCount = validationResults.filter((r) => r.status === 'error').length

  const problemRows = validationResults.filter((r) => r.status !== 'ok').slice(0, 50)

  function goToPreview() {
    if (!mapping) {
      setError('Pick a date column and map at least one field')
      return
    }
    setError(null)
    setStep('preview')
  }

  function handleImport() {
    if (!mapping) return
    const rows = rowsToImport(
      validateImportRows(parsedRows, mapping, fields, existingDateSet, dateFormat, {
        includeDuplicates,
      })
    )
    if (rows.length === 0) {
      setError('No rows to import')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await bulkImportEntries(moduleId, rows, includeDuplicates)
      if (result.error) {
        if (result.inserted > 0) {
          // Chunks insert in payload order, so the first `result.inserted` rows
          // of this exact payload landed before the failure. Mark their dates as
          // existing so a retry's duplicate check skips them instead of
          // double-inserting (this is what makes the message's promise true).
          const landedDates = rows.slice(0, result.inserted).map((r) => r.entry_date)
          setConfirmedInsertedDates((prev) => [...prev, ...landedDates])
          setError(
            `Import stopped after ${result.inserted} of ${rows.length} rows: ${result.error}. ` +
              `The imported rows are saved; retrying will skip them as duplicates.`
          )
        } else {
          setError(result.error)
        }
        return
      }
      router.push(`/modules/${moduleId}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex gap-2 text-sm">
        {(['upload', 'map', 'preview'] as Step[]).map((s, i) => (
          <span
            key={s}
            className={step === s ? 'font-medium' : 'text-muted-foreground'}
          >
            {i + 1}. {s === 'upload' ? 'Upload' : s === 'map' ? 'Map columns' : 'Preview'}
          </span>
        ))}
      </div>

      {step === 'upload' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Spreadsheet file</Label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="block text-sm file:mr-4 file:rounded-lg file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            <p className="text-xs text-muted-foreground">CSV or Excel (.xlsx). Max {MAX_IMPORT_ROWS} rows.</p>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {fileName} — {parsedRows.length} rows, {columns.length} columns detected
          </p>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <Label>Date column</Label>
              <Select items={columnItems} value={dateColumn} onValueChange={(v) => v && setDateColumn(v)}>
                <SelectTrigger className="min-w-40"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date format</Label>
              <Select
                items={dateFormatItems}
                value={dateFormat}
                onValueChange={(v) => v && setDateFormat(v as ImportDateFormat)}
              >
                <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dateFormatItems.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Field mapping</Label>
            <div className="rounded-lg border divide-y">
              {mappableFields.map((field) => (
                <div key={field.key} className="flex items-center justify-between gap-4 px-3 py-2">
                  <span className="text-sm">
                    {field.label}
                    <span className="text-muted-foreground ml-1">({field.type})</span>
                  </span>
                  <Select
                    items={skipItems}
                    value={fieldColumns[field.key] ?? SKIP}
                    onValueChange={(v) => v && setFieldColumns((prev) => ({ ...prev, [field.key]: v }))}
                  >
                    <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>(skip)</SelectItem>
                      {columns.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
            <Button onClick={goToPreview} disabled={!mapping}>Preview import</Button>
          </div>
        </div>
      )}

      {step === 'preview' && mapping && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <p><strong>{okCount}</strong> row{okCount !== 1 ? 's' : ''} will be imported</p>
            {dupCount > 0 && (
              <p className="text-amber-600 dark:text-amber-500">
                {dupCount} duplicate{dupCount !== 1 ? 's' : ''} will be skipped
              </p>
            )}
            {errCount > 0 && (
              <p className="text-destructive">
                {errCount} row{errCount !== 1 ? 's' : ''} failed validation
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={includeDuplicates}
              onCheckedChange={(v) => setIncludeDuplicates(v === true)}
            />
            Import duplicate dates anyway (creates additional entries on existing dates)
          </label>

          {problemRows.length > 0 && (
            <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {problemRows.map((r) => (
                    <TableRow key={r.rowIndex}>
                      <TableCell>{r.rowIndex}</TableCell>
                      <TableCell className="capitalize">{r.status}</TableCell>
                      <TableCell className="text-muted-foreground">{r.entry_date || '—'}</TableCell>
                      <TableCell className="text-sm">{r.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {validationResults.filter((r) => r.status !== 'ok').length > 50 && (
                <p className="text-xs text-muted-foreground px-3 py-2 border-t">
                  Showing first 50 issues
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
            <Button onClick={handleImport} disabled={okCount === 0 || pending}>
              {pending ? 'Importing…' : `Import ${okCount} row${okCount !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) out[k] = v === null || v === undefined ? '' : String(v)
  return out
}

function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    out[k] = v === null || v === undefined ? '' : String(v)
  }
  return out
}
