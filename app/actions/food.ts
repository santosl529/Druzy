'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { FoodEntry, DailyTotals, TrackerModule } from '@/lib/types'

export async function getFoodEntriesForDate(date: string): Promise<FoodEntry[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('food_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .order('created_at', { ascending: true })

  if (error) return []
  return (data ?? []) as FoodEntry[]
}

export async function getDailyTotals(date: string): Promise<DailyTotals> {
  const entries = await getFoodEntriesForDate(date)
  return {
    calories: entries.reduce((sum, e) => sum + (e.calories ?? 0), 0),
    protein_g: entries.reduce((sum, e) => sum + (e.protein_g ?? 0), 0),
    fat_g: entries.reduce((sum, e) => sum + (e.fat_g ?? 0), 0),
    carbs_g: entries.reduce((sum, e) => sum + (e.carbs_g ?? 0), 0),
  }
}

export interface SaveFoodEntryInput {
  entry_date: string
  calories: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  source: 'photo' | 'manual'
  photo_path?: string | null
}

export async function createFoodEntry(
  input: SaveFoodEntryInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('food_entries')
    .insert({
      user_id: user.id,
      entry_date: input.entry_date,
      calories: input.calories,
      protein_g: input.protein_g,
      fat_g: input.fat_g,
      carbs_g: input.carbs_g,
      source: input.source,
      photo_path: input.photo_path ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/food')
  return { id: data.id }
}

export async function updateFoodEntry(
  id: string,
  input: Partial<Omit<SaveFoodEntryInput, 'source'>>
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('food_entries')
    .update(input)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/food')
  return {}
}

/**
 * Returns all of the user's standard modules that have at least one numeric
 * field, ordered by name. Used by the food page to offer "also log to tracker."
 */
export async function getTrackerModules(): Promise<TrackerModule[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('modules')
    .select('id, name, fields, kind')
    .eq('user_id', user.id)
    .eq('kind', 'standard')
    .order('name', { ascending: true })

  if (!data) return []

  return data
    .map((m) => {
      const numericFields = (m.fields as Array<{ key: string; label: string; type: string; unit?: string }>)
        .filter((f) => f.type === 'number' || f.type === 'rating')
        .map((f) => ({ key: f.key, label: f.label, unit: f.unit }))
      return { id: m.id as string, name: m.name as string, numericFields }
    })
    .filter((m) => m.numericFields.length > 0)
}

/**
 * Creates an entry in an arbitrary standard module from a plain values object.
 * Used when the user opts to push food photo results into a tracker.
 */
export async function createEntryInModule(
  moduleId: string,
  entry_date: string,
  values: Record<string, number | null>
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ownership check — also guards against formula modules
  const { data: mod } = await supabase
    .from('modules')
    .select('kind')
    .eq('id', moduleId)
    .eq('user_id', user.id)
    .single()

  if (!mod) return { error: 'Tracker not found.' }
  if (mod.kind === 'formula') return { error: 'Formula trackers are computed and cannot be logged directly.' }

  const { error } = await supabase.from('entries').insert({
    module_id: moduleId,
    user_id: user.id,
    values,
    entry_date,
  })

  if (error) return { error: error.message }

  revalidatePath(`/modules/${moduleId}`)
  revalidatePath('/food')
  return {}
}

export async function deleteFoodEntry(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('food_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/food')
  return {}
}
