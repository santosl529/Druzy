'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { bulkImportPayloadSchema } from '@/lib/validations'
import {
  coerceImportValue,
  MAX_IMPORT_ROWS,
  parseImportDate,
  type ImportDateFormat,
  type ImportRowPayload,
} from '@/lib/import'
import type { Module, ModuleField } from '@/lib/types'

const CHUNK_SIZE = 500

/** Re-validate and coerce a row server-side against the module's current schema. */
function validateRowServer(
  row: ImportRowPayload,
  fields: ModuleField[],
  dateFormat: ImportDateFormat = 'auto'
): { ok: true; row: ImportRowPayload } | { ok: false; reason: string } {
  const parsed = parseImportDate(row.entry_date, 'auto')
  if (!parsed || parsed !== row.entry_date) {
    return { ok: false, reason: `Invalid entry_date: ${row.entry_date}` }
  }

  const fieldByKey = new Map(fields.map((f) => [f.key, f]))
  const values: Record<string, unknown> = {}
  const errors: string[] = []

  for (const [key, raw] of Object.entries(row.values)) {
    const field = fieldByKey.get(key)
    if (!field) {
      errors.push(`Unknown field "${key}"`)
      continue
    }
    const { value, error } = coerceImportValue(raw, field, dateFormat)
    if (error) errors.push(error)
    values[key] = value
  }

  for (const field of fields) {
    if (field.required && (values[field.key] === null || values[field.key] === undefined)) {
      errors.push(`${field.label} is required`)
    }
  }

  if (errors.length > 0) return { ok: false, reason: errors.join('; ') }
  return { ok: true, row: { entry_date: parsed, values } }
}

export async function bulkImportEntries(
  moduleId: string,
  rows: ImportRowPayload[],
  includeDuplicates = false
): Promise<{ inserted: number; skipped: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = bulkImportPayloadSchema.safeParse({ moduleId, rows, includeDuplicates })
  if (!parsed.success) return { inserted: 0, skipped: 0, error: parsed.error.issues[0].message }

  if (rows.length > MAX_IMPORT_ROWS) {
    return { inserted: 0, skipped: 0, error: `Maximum ${MAX_IMPORT_ROWS} rows per import` }
  }

  const { data: mod } = await supabase
    .from('modules')
    .select('*')
    .eq('id', moduleId)
    .eq('user_id', user.id)
    .single()

  if (!mod) return { inserted: 0, skipped: 0, error: 'Tracker not found' }

  const typedModule = mod as Module
  if (typedModule.kind === 'formula') {
    return { inserted: 0, skipped: 0, error: 'Formula trackers cannot be imported into' }
  }

  const fields = typedModule.fields

  // Existing dates for duplicate check
  const { data: existing } = await supabase
    .from('entries')
    .select('entry_date')
    .eq('module_id', moduleId)
    .eq('user_id', user.id)

  const existingDates = new Set((existing ?? []).map((e) => e.entry_date as string))
  const seenInBatch = new Set<string>()

  const toInsert: { module_id: string; user_id: string; entry_date: string; values: Record<string, unknown> }[] = []
  let skipped = 0

  for (const row of rows) {
    const validated = validateRowServer(row, fields)
    if (!validated.ok) {
      skipped++
      continue
    }

    const { entry_date, values } = validated.row
    const isDup = existingDates.has(entry_date) || seenInBatch.has(entry_date)
    if (isDup && !includeDuplicates) {
      skipped++
      continue
    }

    seenInBatch.add(entry_date)
    toInsert.push({
      module_id: moduleId,
      user_id: user.id,
      entry_date,
      values,
    })
  }

  if (toInsert.length === 0) {
    return { inserted: 0, skipped, error: skipped > 0 ? 'No valid rows to import' : undefined }
  }

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('entries').insert(chunk)
    if (error) return { inserted, skipped, error: error.message }
    inserted += chunk.length
  }

  revalidatePath(`/modules/${moduleId}`)
  revalidatePath('/dashboard')
  return { inserted, skipped }
}
