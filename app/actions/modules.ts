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

/**
 * Preflight check before deleting a module.
 * Returns human-readable warnings about dependents so the UI can surface them.
 * Does NOT delete anything.
 */
export async function getModuleDeleteWarnings(id: string): Promise<{
  formulaDependents: string[]
  chartDependents: string[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { formulaDependents: [], chartDependents: [] }

  // Formula modules that reference this module as an input.
  const { data: allModules } = await supabase
    .from('modules')
    .select('id, name, kind, formula_config')
    .eq('user_id', user.id)
    .neq('id', id)

  const formulaDependents: string[] = []
  for (const m of allModules ?? []) {
    if (m.kind === 'formula' && m.formula_config) {
      const cfg = m.formula_config as { inputs?: { moduleId: string }[] }
      if (cfg.inputs?.some((inp) => inp.moduleId === id)) {
        formulaDependents.push(m.name)
      }
    }
  }

  // Charts on OTHER modules whose series reference this module.
  const { data: allCharts } = await supabase
    .from('charts')
    .select('id, module_id, config')
    .eq('user_id', user.id)
    .neq('module_id', id) // charts on THIS module will be cascade-deleted anyway

  const chartModuleIds = new Set<string>()
  for (const c of allCharts ?? []) {
    const cfg = c.config as { series?: { moduleId: string }[] }
    if (cfg.series?.some((s) => s.moduleId === id)) {
      chartModuleIds.add(c.module_id as string)
    }
  }

  const chartDependents: string[] = []
  if (chartModuleIds.size > 0) {
    for (const m of allModules ?? []) {
      if (chartModuleIds.has(m.id as string)) chartDependents.push(m.name)
    }
  }

  return { formulaDependents, chartDependents }
}

/**
 * Create a module from an AI-proposed schema.
 * Accepts plain objects (not FormData) — the AI path calls this after
 * the user reviews and confirms the proposal card.
 * Re-validates server-side; never trusts a client-supplied user_id.
 */
export async function createModuleFromProposal(
  name: string,
  fields: ModuleField[]
): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated. Please sign in and try again.' }

  const parsed = moduleSchema.safeParse({ name, fields })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data, error } = await supabase
    .from('modules')
    .insert({ user_id: user.id, name: parsed.data.name, fields: parsed.data.fields })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await createDefaultChart(data.id, parsed.data.fields, user.id)

  revalidatePath('/')
  return { id: data.id }
}

export async function deleteModule(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('modules').delete().eq('id', id).eq('user_id', user.id)
  revalidatePath('/')
  redirect('/')
}
