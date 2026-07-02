'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser, getAuthContext } from '@/lib/supabase/auth'
import { moduleSchema } from '@/lib/validations'
import { createDefaultChart } from '@/app/actions/charts'
import type { ModuleField } from '@/lib/types'

/** Parse the optional card_config form field. Absent/blank → null (auto default). */
function parseOptionalJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null  // let Zod safeParse reject it cleanly
  }
}

export async function createModule(formData: FormData): Promise<{ error: string } | never> {
  const { supabase, user } = await requireUser()

  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
    crystal_type: formData.get('crystal_type') as string,
    card_config: parseOptionalJson(formData.get('card_config')),
    dashboard_config: parseOptionalJson(formData.get('dashboard_config')),
  }

  const parsed = moduleSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data, error } = await supabase
    .from('modules')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      fields: parsed.data.fields,
      crystal_type: parsed.data.crystal_type,
      card_config: parsed.data.card_config ?? null,
      dashboard_config: parsed.data.dashboard_config ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await createDefaultChart(data.id, parsed.data.fields, user.id)

  revalidatePath('/')
  redirect(`/modules/${data.id}`)
}

export async function updateModule(id: string, formData: FormData): Promise<{ error: string } | never> {
  const { supabase, user } = await requireUser()

  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
    crystal_type: formData.get('crystal_type') as string,
    card_config: parseOptionalJson(formData.get('card_config')),
    dashboard_config: parseOptionalJson(formData.get('dashboard_config')),
  }

  const parsed = moduleSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('modules')
    .update({
      name: parsed.data.name,
      fields: parsed.data.fields,
      crystal_type: parsed.data.crystal_type,
      card_config: parsed.data.card_config ?? null,
      dashboard_config: parsed.data.dashboard_config ?? null,
    })
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
  const { supabase, user } = await getAuthContext()
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
  fields: ModuleField[],
  crystalType: string,
): Promise<{ error: string } | { id: string }> {
  const { supabase, user } = await getAuthContext()
  if (!user) return { error: 'Not authenticated. Please sign in and try again.' }

  const parsed = moduleSchema.safeParse({ name, fields, crystal_type: crystalType })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data, error } = await supabase
    .from('modules')
    .insert({ user_id: user.id, name: parsed.data.name, fields: parsed.data.fields, crystal_type: parsed.data.crystal_type })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await createDefaultChart(data.id, parsed.data.fields, user.id)

  revalidatePath('/')
  return { id: data.id }
}

export async function deleteModule(id: string): Promise<void> {
  const { supabase, user } = await requireUser()

  await supabase.from('modules').delete().eq('id', id).eq('user_id', user.id)
  revalidatePath('/')
  redirect('/')
}
