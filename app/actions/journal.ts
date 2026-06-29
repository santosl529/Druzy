'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { journalTemplateSchema, journalEntrySchema } from '@/lib/validations'
import { createEntryInModule } from '@/app/actions/food'
import type { JournalTemplate, JournalEntry, JournalField } from '@/lib/types'

// ----------------------------------------------------------------
// Template
// ----------------------------------------------------------------

export async function getJournalTemplate(): Promise<JournalTemplate | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('journal_templates')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (data as JournalTemplate | null) ?? null
}

/**
 * Upsert the user's extraction template.
 * Only number fields with both targetModuleId and targetFieldKey are kept
 * as mapped; any other combination is stripped server-side.
 * binaryModuleId is validated server-side: must belong to the user and be a
 * standard module with a single boolean field.
 */
export async function saveJournalTemplate(
  fields: JournalField[],
  binaryModuleId?: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Sanitize: strip tracker connections from non-number fields.
  const sanitized = fields.map((f) => {
    if (f.type !== 'number') {
      const { targetModuleId: _a, targetFieldKey: _b, ...rest } = f
      void _a
      void _b
      return rest
    }
    return f
  })

  const parsed = journalTemplateSchema.safeParse({
    fields: sanitized,
    binaryModuleId: binaryModuleId ?? undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid template' }
  }

  // Validate binaryModuleId ownership + shape server-side.
  let resolvedBinaryModuleId: string | null = null
  if (parsed.data.binaryModuleId) {
    const { data: mod } = await supabase
      .from('modules')
      .select('kind, fields')
      .eq('id', parsed.data.binaryModuleId)
      .eq('user_id', user.id)
      .single()

    if (!mod) return { error: 'Selected tracker not found.' }
    if (mod.kind !== 'standard') return { error: 'Only standard trackers can be used as the journal marker.' }
    const modFields = mod.fields as Array<{ type: string }>
    if (modFields.length !== 1 || modFields[0].type !== 'boolean') {
      return { error: 'The journal tracker must have exactly one boolean field.' }
    }
    resolvedBinaryModuleId = parsed.data.binaryModuleId
  }

  const { error } = await supabase.from('journal_templates').upsert(
    {
      user_id: user.id,
      fields: parsed.data.fields,
      binary_module_id: resolvedBinaryModuleId,
    },
    { onConflict: 'user_id' }
  )

  if (error) return { error: error.message }

  revalidatePath('/journal')
  revalidatePath('/journal/template')
  return {}
}

// ----------------------------------------------------------------
// Entries
// ----------------------------------------------------------------

export async function getJournalEntries(limit = 20): Promise<JournalEntry[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as JournalEntry[]
}

export interface CreateJournalEntryInput {
  entry_date: string
  transcription?: string
  extracted: Record<string, unknown>
  /** IDs of tracker modules the user has opted to log connected number fields into. */
  enabledModuleIds: string[]
}

/**
 * Saves the journal entry and, for each number field that has a tracker
 * connection and whose module is in enabledModuleIds, creates an entry in
 * that tracker module.
 *
 * Returns the new entry's id plus a list of tracker names that were logged.
 */
export async function createJournalEntry(
  input: CreateJournalEntryInput
): Promise<{ error?: string; id?: string; loggedModules?: string[] }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = journalEntrySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid entry data' }
  }

  // Insert the journal entry.
  const { data: inserted, error: insertError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: user.id,
      entry_date: parsed.data.entry_date,
      transcription: parsed.data.transcription ?? null,
      extracted: parsed.data.extracted,
    })
    .select('id')
    .single()

  if (insertError) return { error: insertError.message }

  // Re-fetch the template server-side so we never trust client-supplied mappings.
  const template = await getJournalTemplate()
  const fields: JournalField[] = template?.fields ?? []

  // Group number fields by target module (one createEntryInModule call per module).
  const enabledSet = new Set(parsed.data.enabledModuleIds)
  const byModule = new Map<string, Record<string, number | null>>()

  for (const field of fields) {
    if (
      field.type !== 'number' ||
      !field.targetModuleId ||
      !field.targetFieldKey ||
      !enabledSet.has(field.targetModuleId)
    ) {
      continue
    }

    const rawValue = parsed.data.extracted[field.key]
    const numericValue =
      rawValue !== null && rawValue !== undefined && rawValue !== '' && !isNaN(Number(rawValue))
        ? Number(rawValue)
        : null

    const existing = byModule.get(field.targetModuleId) ?? {}
    existing[field.targetFieldKey] = numericValue
    byModule.set(field.targetModuleId, existing)
  }

  // Fire tracker entries. Collect names for the return value.
  const loggedModules: string[] = []
  for (const [moduleId, values] of byModule) {
    const result = await createEntryInModule(moduleId, parsed.data.entry_date, values)
    if (!result.error) {
      // Fetch module name for display.
      const { data: mod } = await supabase
        .from('modules')
        .select('name')
        .eq('id', moduleId)
        .eq('user_id', user.id)
        .single()
      if (mod?.name) loggedModules.push(mod.name as string)
    }
    // Non-fatal: journal entry already saved; log errors are surfaced via loggedModules absence.
  }

  // If the template has a binary module connected, write {<booleanField>: true} to it.
  // This is what makes the consistency grid show "journaled" on the day a capture entry is saved.
  if (template?.binary_module_id) {
    const { data: binaryMod } = await supabase
      .from('modules')
      .select('fields, name')
      .eq('id', template.binary_module_id)
      .eq('user_id', user.id)
      .single()

    if (binaryMod) {
      const boolField = (binaryMod.fields as Array<{ key: string; type: string }>).find(
        (f) => f.type === 'boolean'
      )
      if (boolField) {
        const binaryResult = await createEntryInModule(
          template.binary_module_id,
          parsed.data.entry_date,
          { [boolField.key]: true }
        )
        if (!binaryResult.error && binaryMod.name) {
          loggedModules.push(binaryMod.name as string)
        }
      }
    }
  }

  revalidatePath('/journal')
  return { id: inserted.id, loggedModules }
}

export async function deleteJournalEntry(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/journal')
  return {}
}
