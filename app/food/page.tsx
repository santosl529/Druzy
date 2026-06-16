import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { FoodLog } from '@/components/food/food-log'
import { getFoodEntriesForDate, getDailyTotals, getTrackerModules } from '@/app/actions/food'
import { todayInTimezone } from '@/lib/date'
import type { FoodEntry, DailyTotals, TrackerModule } from '@/lib/types'

export default async function FoodPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('day_boundary_tz')
    .eq('id', user.id)
    .single()
  const savedTimezone = (profile?.day_boundary_tz as string | null) || null
  const today = todayInTimezone(savedTimezone || 'UTC')

  const [entries, totals, trackerModules]: [FoodEntry[], DailyTotals, TrackerModule[]] =
    await Promise.all([
      getFoodEntriesForDate(today),
      getDailyTotals(today),
      getTrackerModules(),
    ])

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-2xl mx-auto w-full px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">Food</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track daily calories and macros. Photo estimates are approximate — always review before
            saving.
          </p>
        </div>
        <FoodLog
          initialDate={today}
          initialEntries={entries}
          initialTotals={totals}
          trackerModules={trackerModules}
          savedTimezone={savedTimezone}
        />
      </main>
    </div>
  )
}
