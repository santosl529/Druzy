import { getAuthContext } from '@/lib/supabase/auth'
import type { FoodEntry, DailyTotals } from '@/lib/types'

export async function GET(req: Request) {
  const { supabase, user } = await getAuthContext()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid or missing date' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('food_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .order('created_at', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const entries = (data ?? []) as FoodEntry[]
  const totals: DailyTotals = {
    calories: entries.reduce((s, e) => s + (e.calories ?? 0), 0),
    protein_g: entries.reduce((s, e) => s + (e.protein_g ?? 0), 0),
    fat_g: entries.reduce((s, e) => s + (e.fat_g ?? 0), 0),
    carbs_g: entries.reduce((s, e) => s + (e.carbs_g ?? 0), 0),
  }

  return Response.json({ entries, totals })
}
