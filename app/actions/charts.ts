'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { chartConfigSchema } from '@/lib/validations'
import type { ChartConfig, ModuleField } from '@/lib/types'

function defaultConfig(moduleId: string, fields: ModuleField[]): ChartConfig {
  const numeric = fields.find((f) => f.type === 'number' || f.type === 'rating')
  const textual = fields.find((f) => f.type === 'text' || f.type === 'select')

  if (numeric) {
    return { chartType: 'line', series: [{ moduleId, field: numeric.key, label: numeric.label }] }
  }
  if (textual) {
    return { chartType: 'list', series: [{ moduleId, field: textual.key }], displayField: textual.key }
  }
  return { chartType: 'table', series: [] }
}

export async function createDefaultChart(moduleId: string, fields: ModuleField[], userId: string) {
  const supabase = await createClient()
  await supabase.from('charts').insert({
    module_id: moduleId,
    user_id: userId,
    config: defaultConfig(moduleId, fields),
    position: 0,
  })
}

export async function createChart(formData: FormData): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const moduleId = formData.get('module_id') as string
  const parsed = chartConfigSchema.safeParse(JSON.parse(formData.get('config') as string))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: last } = await supabase
    .from('charts').select('position').eq('module_id', moduleId).eq('user_id', user.id)
    .order('position', { ascending: false }).limit(1).maybeSingle()

  const { error } = await supabase.from('charts').insert({
    module_id: moduleId, user_id: user.id, config: parsed.data, position: last ? last.position + 1 : 0,
  })
  if (error) return { error: error.message }

  revalidatePath(`/modules/${moduleId}`)
  revalidatePath('/dashboard')
  redirect(`/modules/${moduleId}`)
}

export async function updateChart(
  chartId: string, moduleId: string, formData: FormData
): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = chartConfigSchema.safeParse(JSON.parse(formData.get('config') as string))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('charts').update({ config: parsed.data }).eq('id', chartId).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath(`/modules/${moduleId}`)
  revalidatePath('/dashboard')
  redirect(`/modules/${moduleId}`)
}

export async function deleteChart(chartId: string, moduleId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('charts').delete().eq('id', chartId).eq('user_id', user.id)
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath('/dashboard')
}

export async function reorderCharts(updates: { id: string; position: number }[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await Promise.all(
    updates.map(({ id, position }) =>
      supabase.from('charts').update({ position }).eq('id', id).eq('user_id', user.id)
    )
  )
  revalidatePath('/', 'layout')
}
