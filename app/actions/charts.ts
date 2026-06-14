'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { chartConfigSchema } from '@/lib/validations'
import type { ChartConfig, ModuleField } from '@/lib/types'

/** Ensure every series moduleId belongs to the user. Returns an error message or null. */
async function validateSeriesOwnership(
  config: ChartConfig,
  userId: string
): Promise<string | null> {
  const seriesModuleIds = [...new Set(config.series.map((s) => s.moduleId))]
  if (seriesModuleIds.length === 0) return null

  const supabase = await createClient()
  const { data: owned } = await supabase
    .from('modules')
    .select('id')
    .eq('user_id', userId)
    .in('id', seriesModuleIds)

  const ownedIds = new Set((owned ?? []).map((m) => m.id as string))
  const unknown = seriesModuleIds.filter((id) => !ownedIds.has(id))
  return unknown.length > 0 ? 'Chart references a tracker that does not exist.' : null
}

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

  const ownershipError = await validateSeriesOwnership(parsed.data, user.id)
  if (ownershipError) return { error: ownershipError }

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

  const ownershipError = await validateSeriesOwnership(parsed.data, user.id)
  if (ownershipError) return { error: ownershipError }

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

/**
 * Save a chart proposed by the AI assistant.
 * Returns { id } so the client can show a link; does NOT redirect.
 */
export async function addChartFromProposal(
  config: ChartConfig,
  moduleId: string
): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const parsed = chartConfigSchema.safeParse(config)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const ownershipError = await validateSeriesOwnership(parsed.data, user.id)
  if (ownershipError) return { error: ownershipError }

  // Verify the target module belongs to the user.
  const { data: mod } = await supabase
    .from('modules').select('id').eq('id', moduleId).eq('user_id', user.id).maybeSingle()
  if (!mod) return { error: 'Target tracker not found.' }

  const { data: last } = await supabase
    .from('charts').select('position').eq('module_id', moduleId).eq('user_id', user.id)
    .order('position', { ascending: false }).limit(1).maybeSingle()

  const { data: chart, error } = await supabase.from('charts').insert({
    module_id: moduleId,
    user_id: user.id,
    config: parsed.data,
    position: last ? last.position + 1 : 0,
  }).select('id').single()

  if (error) return { error: error.message }

  revalidatePath(`/modules/${moduleId}`)
  revalidatePath('/dashboard')
  return { id: chart.id }
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
