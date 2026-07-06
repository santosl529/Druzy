import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { ConsistencyGrid } from '@/components/consistency-grid'
import type { ModuleStage } from '@/components/consistency-grid'
import { buildGridData } from '@/lib/consistency-grid'
import { withFormulaEntries } from '@/lib/formula'
import { computeOpenness } from '@/lib/openness'
import { daysUntilNextStage } from '@/lib/stages'
import { todayInTimezone, daysAgoInTimezone } from '@/lib/date'
import type { Module, Entry } from '@/lib/types'

export default async function DashboardPage() {
  const { supabase, user } = await requireUser()

  const [{ data: modules }, savedTimezone] = await Promise.all([
    supabase.from('modules').select('*').eq('user_id', user.id).order('name'),
    getUserTimezone(supabase, user.id),
  ])

  const typedModules = (modules ?? []) as Module[]
  const today = todayInTimezone(savedTimezone ?? 'UTC')

  const moduleIds = typedModules.map((m) => m.id)

  const { data: entries } =
    moduleIds.length > 0
      ? await supabase
          .from('entries')
          .select('module_id, entry_date, values, created_at')
          .eq('user_id', user.id)
          .in('module_id', moduleIds)
      : { data: [] }

  // Include computed entries for formula modules so they appear in the grid.
  const rawEntries = (entries ?? []) as Entry[]
  const allEntries = withFormulaEntries(typedModules, rawEntries)

  const gridData = buildGridData(typedModules, allEntries, today)

  // Geode openness + "days to next stage" per module. Computed from the REAL
  // entries (not synthetic formula ones), mirroring the trackers grid.
  const since = daysAgoInTimezone(29, savedTimezone ?? 'UTC') // inclusive 30-day window
  const nowMs = Date.parse(today + 'T00:00:00Z')
  const recentDaysByModule = new Map<string, Set<string>>()
  const totalByModule = new Map<string, number>()
  for (const e of rawEntries) {
    totalByModule.set(e.module_id, (totalByModule.get(e.module_id) ?? 0) + 1)
    if (e.entry_date >= since) {
      const set = recentDaysByModule.get(e.module_id) ?? new Set<string>()
      set.add(e.entry_date)
      recentDaysByModule.set(e.module_id, set)
    }
  }

  const stageByModule: Record<string, ModuleStage> = {}
  for (const m of typedModules) {
    const isFormula = m.kind === 'formula'
    const recentDates = recentDaysByModule.get(m.id) ?? new Set<string>()
    const totalEntries = totalByModule.get(m.id) ?? 0
    const daysSinceCreated = Math.max(0, Math.round((nowMs - Date.parse(m.created_at)) / 86400000))
    const openness = computeOpenness({
      recentDays: recentDates.size,
      totalEntries,
      daysSinceCreated,
      isFormula,
    })
    const next = daysUntilNextStage({
      loggedDates: [...recentDates],
      totalEntries,
      daysSinceCreated,
      isFormula,
      today,
    })
    stageByModule[m.id] = {
      openness,
      nextStageName: next?.name ?? null,
      daysToNext: next?.days ?? null,
    }
  }

  return (
    <main className="max-w-6xl mx-auto w-full px-4 py-10">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground mb-8">
        Consistency across all trackers over time.
      </p>

      {typedModules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No trackers yet. Create one to see your consistency grid.
        </div>
      ) : (
        <ConsistencyGrid gridData={gridData} today={today} stageByModule={stageByModule} />
      )}
    </main>
  )
}
