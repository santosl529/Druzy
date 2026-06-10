'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { moduleSchema } from '@/lib/validations'
import { createDefaultChart } from '@/app/actions/charts'
import type { ModuleField } from '@/lib/types'

export async function createModule(formData: FormData): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
  }

  const parsed = moduleSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data, error } = await supabase
    .from('modules')
    .insert({ user_id: user.id, name: parsed.data.name, fields: parsed.data.fields })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await createDefaultChart(data.id, parsed.data.fields, user.id)

  revalidatePath('/')
  redirect(`/modules/${data.id}`)
}

export async function updateModule(id: string, formData: FormData): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
  }

  const parsed = moduleSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('modules')
    .update({ name: parsed.data.name, fields: parsed.data.fields })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath(`/modules/${id}`)
  redirect(`/modules/${id}`)
}

export async function deleteModule(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('modules').delete().eq('id', id).eq('user_id', user.id)
  revalidatePath('/')
  redirect('/')
}
