import Link from 'next/link'
import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { buttonVariants } from '@/components/ui/button'
import { TrackerGrid } from '@/components/tracker-grid'
import { GeodeIcon } from '@/components/geode-icon'
import { todayInTimezone, daysAgoInTimezone } from '@/lib/date'
import { computeOpenness } from '@/lib/openness'
import { needsAllTimeEntries, type CardEntry } from '@/lib/card-summary'
import type { Module } from '@/lib/types'

export default async function DashboardPage() {
  const { supabase, user } = await requireUser()

  // Recent entries are fetched from a UTC-based date one day wider than the
  // 30-day openness window, so this query needn't wait on the saved timezone:
  // any timezone's date is within a day of UTC's. That margin also covers the
  // card's today/week windows if the client's "today" differs from the server's.
  const fetchSince = daysAgoInTimezone(30, 'UTC')

  const [{ data: modules }, savedTimezone, { data: recentEntries }] = await Promise.all([
    supabase.from('modules').select('*').eq('user_id', user.id).order('name', { ascending: true }),
    getUserTimezone(supabase, user.id),
    supabase
      .from('entries')
      .select('module_id, entry_date, values, created_at')
      .eq('user_id', user.id)
      .gte('entry_date', fetchSince),
  ])

  const typedModules = (modules ?? []) as Module[]
  const today = todayInTimezone(savedTimezone || 'UTC')
  const since = daysAgoInTimezone(29, savedTimezone || 'UTC') // inclusive 30-day window

  // Older entries are only loaded for modules whose card summarizes the `all`
  // window. Openness only needs lifetime counts, fetched as head-only counts
  // (no rows transferred); formula modules are always fully open, so skip them.
  const allTimeIds = typedModules.filter(needsAllTimeEntries).map((m) => m.id)
  const countedModules = typedModules.filter((m) => m.kind !== 'formula')
  const [{ data: olderEntries }, counts] = await Promise.all([
    allTimeIds.length > 0
      ? supabase
          .from('entries')
          .select('module_id, entry_date, values, created_at')
          .eq('user_id', user.id)
          .in('module_id', allTimeIds)
          .lt('entry_date', fetchSince)
      : Promise.resolve({ data: [] }),
    Promise.all(
      countedModules.map((m) =>
        supabase
          .from('entries')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('module_id', m.id),
      ),
    ),
  ])

  const totalByModule = new Map<string, number>(
    countedModules.map((m, i) => [m.id, counts[i].count ?? 0]),
  )
  const allEntries = [...(recentEntries ?? []), ...(olderEntries ?? [])]

  const nowMs = Date.parse(today + 'T00:00:00Z')
  const recentDaysByModule = new Map<string, Set<string>>()
  // Per-module entries (summary-relevant columns only) for the card summaries.
  const entriesByModule: Record<string, CardEntry[]> = {}
  for (const e of allEntries) {
    if (e.entry_date >= since) {
      const set = recentDaysByModule.get(e.module_id) ?? new Set<string>()
      set.add(e.entry_date)
      recentDaysByModule.set(e.module_id, set)
    }
    ;(entriesByModule[e.module_id] ??= []).push({
      entry_date: e.entry_date,
      values: (e.values ?? {}) as Record<string, unknown>,
      created_at: e.created_at,
    })
  }

  const opennessByModule: Record<string, number> = {}
  for (const m of typedModules) {
    const createdMs = Date.parse(m.created_at)
    const daysSinceCreated = Math.max(0, Math.round((nowMs - createdMs) / 86400000))
    opennessByModule[m.id] = computeOpenness({
      recentDays: recentDaysByModule.get(m.id)?.size ?? 0,
      totalEntries: totalByModule.get(m.id) ?? 0,
      daysSinceCreated,
      isFormula: m.kind === 'formula',
    })
  }

  const doneToday = new Set(
    allEntries.filter((e) => e.entry_date === today).map((e) => e.module_id),
  )

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Your trackers</h1>
          <p className="text-muted-foreground mt-1">Log and visualize anything that matters to you.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/modules/new/formula" className={buttonVariants({ variant: 'outline' })}>
            Formula tracker
          </Link>
          <Link href="/modules/new" className={buttonVariants({ variant: 'outline' })}>
            Build manually
          </Link>
          <Link href="/assistant" className={buttonVariants()}>
            AI assistant
          </Link>
        </div>
      </div>

      {typedModules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center flex flex-col items-center">
          <span aria-hidden="true"><GeodeIcon crystalType="amethyst" openness={0} className="size-16 mb-4" /></span>
          <h2 className="font-heading text-xl font-semibold tracking-tight mb-2">
            Your first geode is waiting
          </h2>
          <p className="text-muted-foreground mb-6">No trackers yet.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/assistant" className={buttonVariants()}>
              Create with AI assistant
            </Link>
            <Link href="/modules/new" className={buttonVariants({ variant: 'outline' })}>
              Build manually
            </Link>
          </div>
        </div>
      ) : (
        <TrackerGrid
          modules={typedModules}
          initialDoneToday={[...doneToday]}
          entriesByModule={entriesByModule}
          serverDate={today}
          savedTimezone={savedTimezone}
          opennessByModule={opennessByModule}
        />
      )}
    </main>
  )
}
