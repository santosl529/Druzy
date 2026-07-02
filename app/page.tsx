import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { Nav } from '@/components/nav'
import { buttonVariants } from '@/components/ui/button'
import { TrackerGrid } from '@/components/tracker-grid'
import { todayInTimezone, daysAgoInTimezone } from '@/lib/date'
import { computeOpenness } from '@/lib/openness'
import type { CardEntry } from '@/lib/card-summary'
import type { Module } from '@/lib/types'

export default async function DashboardPage() {
  const { supabase, user } = await requireUser()

  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  const typedModules = (modules ?? []) as Module[]

  const { data: profile } = await supabase
    .from('profiles')
    .select('day_boundary_tz')
    .eq('id', user.id)
    .single()
  const savedTimezone = (profile?.day_boundary_tz as string | null) || null
  const today = todayInTimezone(savedTimezone || 'UTC')

  const moduleIds = typedModules.map((m) => m.id)
  const since = daysAgoInTimezone(29, savedTimezone || 'UTC') // inclusive 30-day window

  // One query: every entry for this user. We need values + created_at (beyond
  // module_id/entry_date) so each card can compute its summary. At this scale
  // (tens of users, a handful of trackers) this is a cheap indexed read.
  const { data: allEntries } =
    moduleIds.length > 0
      ? await supabase
          .from('entries')
          .select('module_id, entry_date, values, created_at')
          .eq('user_id', user.id)
          .in('module_id', moduleIds)
      : { data: [] }

  const nowMs = Date.parse(today + 'T00:00:00Z')
  const recentDaysByModule = new Map<string, Set<string>>()
  const totalByModule = new Map<string, number>()
  // Per-module entries (summary-relevant columns only) for the card summaries.
  const entriesByModule: Record<string, CardEntry[]> = {}
  for (const e of allEntries ?? []) {
    totalByModule.set(e.module_id, (totalByModule.get(e.module_id) ?? 0) + 1)
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
    (allEntries ?? []).filter((e) => e.entry_date === today).map((e) => e.module_id),
  )

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Your trackers</h1>
            <p className="text-muted-foreground">Log and visualize anything that matters to you.</p>
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
          <div className="rounded-lg border border-dashed p-12 text-center">
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
    </div>
  )
}
