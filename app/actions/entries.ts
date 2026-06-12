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
