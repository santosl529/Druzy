'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ModuleField } from '@/lib/types'

export async function createEntry(
  moduleId: string,
  fields: ModuleField[],
  formData: FormData
): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Formula modules are computed from other trackers — never logged directly.
  const { data: mod } = await supabase
    .from('modules').select('kind').eq('id', moduleId).eq('user_id', user.id).single()
  if (mod?.kind === 'formula') {
    return { error: 'Formula trackers are computed automatically and cannot be logged directly.' }
  }

  // entry_date is the day the thing happened (browser local date, always sent by the form).
  // The fallback uses UTC — acceptable as a safety net since the form always supplies the value.
  const entryDate = (formData.get('entry_date') as string) || new Date().toISOString().split('T')[0]

  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = formData.get(field.key)
    if (field.type === 'boolean') {
      values[field.key] = raw === 'on'
    } else if (field.type === 'number' || field.type === 'rating') {
      values[field.key] = raw !== null && raw !== '' ? Number(raw) : null
    } else {
      values[field.key] = raw ?? null
    }
  }

  const { error } = await supabase.from('entries').insert({
    module_id: moduleId,
    user_id: user.id,
    values,
    entry_date: entryDate,
  })

  if (error) return { error: error.message }

  revalidatePath(`/modules/${moduleId}`)
}

export async function updateEntry(
  id: string,
  moduleId: string,
  fields: ModuleField[],
  formData: FormData
): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Guard: formula modules cannot be edited directly.
  const { data: mod } = await supabase
    .from('modules').select('kind').eq('id', moduleId).eq('user_id', user.id).single()
  if (mod?.kind === 'formula') {
    return { error: 'Formula tracker values are computed and cannot be edited directly.' }
  }

  // entry_date governs day attribution. Always use the value supplied by the form.
  const entryDate = (formData.get('entry_date') as string) || new Date().toISOString().split('T')[0]

  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = formData.get(field.key)
    if (field.type === 'boolean') {
      values[field.key] = raw === 'on'
    } else if (field.type === 'number' || field.type === 'rating') {
      values[field.key] = raw !== null && raw !== '' ? Number(raw) : null
    } else {
      values[field.key] = raw ?? null
    }
  }

  const { error } = await supabase
    .from('entries')
    .update({ values, entry_date: entryDate })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath(`/modules/${moduleId}`)
}

export async function deleteEntry(id: string, moduleId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('entries').delete().eq('id', id).eq('user_id', user.id)

  revalidatePath(`/modules/${moduleId}`)
}

export async function getTodayEntryStatus(moduleIds: string[], date: string): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || moduleIds.length === 0) return []

  const { data } = await supabase
    .from('entries')
    .select('module_id')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .in('module_id', moduleIds)

  return (data ?? []).map((e) => e.module_id as string)
}

// entryDate is the browser-local date (YYYY-MM-DD) supplied by the client,
// matching the same convention as createEntry which reads entry_date from FormData.
export async function markGreenForToday(moduleId: string, entryDate: string): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: mod } = await supabase
    .from('modules').select('kind').eq('id', moduleId).eq('user_id', user.id).single()
  if (!mod) return { error: 'Tracker not found.' }
  if (mod.kind === 'formula') return { error: 'Formula trackers are computed automatically and cannot be marked manually.' }

  const { data: existing } = await supabase
    .from('entries').select('id')
    .eq('module_id', moduleId).eq('user_id', user.id).eq('entry_date', entryDate)
    .limit(1)

  if (existing && existing.length > 0) return

  const { error } = await supabase.from('entries').insert({
    module_id: moduleId,
    user_id: user.id,
    values: {},
    entry_date: entryDate,
  })

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath(`/modules/${moduleId}`)
}
