import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { FoodLog } from '@/components/food/food-log'
import { getFoodEntriesForDate, getDailyTotals, getTrackerModules } from '@/app/actions/food'
import { todayInTimezone } from '@/lib/date'
import type { FoodEntry, DailyTotals, TrackerModule } from '@/lib/types'

export default async function FoodPage() {
  const { supabase, user } = await requireUser()

  const savedTimezone = await getUserTimezone(supabase, user.id)
  const today = todayInTimezone(savedTimezone || 'UTC')

  const [entries, totals, trackerModules]: [FoodEntry[], DailyTotals, TrackerModule[]] =
    await Promise.all([
      getFoodEntriesForDate(today),
      getDailyTotals(today),
      getTrackerModules(),
    ])

  return (
    <main className="max-w-6xl mx-auto w-full px-4 py-8">
      <FoodLog
        initialDate={today}
        initialEntries={entries}
        initialTotals={totals}
        trackerModules={trackerModules}
        savedTimezone={savedTimezone}
      />
    </main>
  )
}
