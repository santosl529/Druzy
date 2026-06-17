'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formulaModuleSchema, crystalTypeSchema } from '@/lib/validations'
import { FORMULA_VALUE_FIELD } from '@/lib/formula'
import { createDefaultChart } from '@/app/actions/charts'
import type { FormulaConfig, Module } from '@/lib/types'

/**
 * Server-side integrity checks beyond the Zod schema:
 * every input module belongs to the user, is a standard module
 * (no formulas referencing formulas), and the referenced field
 * exists and is numeric. Returns an error message or null.
 */
async function validateFormulaInputs(
  config: FormulaConfig,
  userId: string
): Promise<string | null> {
  const moduleIds = [...new Set(config.inputs.map((i) => i.moduleId))]

  const supabase = await createClient()
  const { data } = await supabase
    .from('modules')
    .select('*')
    .eq('user_id', userId)
    .in('id', moduleIds)

  const byId = new Map(((data ?? []) as Module[]).map((m) => [m.id, m]))

  for (const input of config.inputs) {
    const mod = byId.get(input.moduleId)
    if (!mod) return 'Formula references a tracker that does not exist.'
    if (mod.kind === 'formula') return `"${mod.name}" is a formula tracker — formulas can only read from standard trackers.`
    const field = mod.fields.find((f) => f.key === input.field)
    if (!field) return `Field "${input.field}" does not exist on "${mod.name}".`
    if (field.type !== 'number' && field.type !== 'rating') {
      return `Field "${field.label}" on "${mod.name}" is not numeric.`
    }
  }
  return null
}

function parseForm(formData: FormData) {
  return formulaModuleSchema.safeParse({
    name: formData.get('name') as string,
    config: JSON.parse(formData.get('config') as string),
  })
}

export async function createFormulaModule(formData: FormData): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = parseForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const inputError = await validateFormulaInputs(parsed.data.config, user.id)
  if (inputError) return { error: inputError }

  const crystal = crystalTypeSchema.safeParse(formData.get('crystal_type'))
  if (!crystal.success) return { error: 'Pick a crystal for this tracker' }

  const { data, error } = await supabase
    .from('modules')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      fields: [FORMULA_VALUE_FIELD],
      kind: 'formula',
      formula_config: parsed.data.config,
      crystal_type: crystal.data,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await createDefaultChart(data.id, [FORMULA_VALUE_FIELD], user.id)

  revalidatePath('/')
  redirect(`/modules/${data.id}`)
}

/**
 * Create a formula module from an AI-proposed config.
 * Accepts plain objects (not FormData). Re-validates server-side.
 * Returns { id } on success so the client can redirect.
 */
export async function createFormulaModuleFromProposal(
  name: string,
  config: FormulaConfig,
  crystalType: string,
): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated. Please sign in and try again.' }

  const parsed = formulaModuleSchema.safeParse({ name, config })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const inputError = await validateFormulaInputs(parsed.data.config, user.id)
  if (inputError) return { error: inputError }

  const crystal = crystalTypeSchema.safeParse(crystalType)
  if (!crystal.success) return { error: 'Pick a crystal for this tracker' }

  const { data, error } = await supabase
    .from('modules')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      fields: [FORMULA_VALUE_FIELD],
      kind: 'formula',
      formula_config: parsed.data.config,
      crystal_type: crystal.data,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await createDefaultChart(data.id, [FORMULA_VALUE_FIELD], user.id)
  revalidatePath('/')
  return { id: data.id }
}

export async function updateFormulaModule(
  id: string,
  formData: FormData
): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = parseForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const inputError = await validateFormulaInputs(parsed.data.config, user.id)
  if (inputError) return { error: inputError }

  const crystal = crystalTypeSchema.safeParse(formData.get('crystal_type'))
  if (!crystal.success) return { error: 'Pick a crystal for this tracker' }

  const { error } = await supabase
    .from('modules')
    .update({ name: parsed.data.name, formula_config: parsed.data.config, crystal_type: crystal.data })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('kind', 'formula')

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath(`/modules/${id}`)
  redirect(`/modules/${id}`)
}
