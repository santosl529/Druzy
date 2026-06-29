import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { ConsistencyGrid } from '@/components/consistency-grid'
import { buildGridData } from '@/lib/consistency-grid'
import { withFormulaEntries } from '@/lib/formula'
import { todayInTimezone } from '@/lib/date'
import type { Module, Entry } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: modules }, { data: profile }] = await Promise.all([
    supabase.from('modules').select('*').eq('user_id', user.id).order('name'),
    supabase.from('profiles').select('day_boundary_tz').eq('id', user.id).single(),
  ])

  const typedModules = (modules ?? []) as Module[]
  const savedTimezone = (profile?.day_boundary_tz as string | null) || null
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

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-6xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
        <p className="text-muted-foreground mb-8">
          Consistency across all trackers over time.
        </p>

        {typedModules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            No trackers yet. Create one to see your consistency grid.
          </div>
        ) : (
          <ConsistencyGrid gridData={gridData} today={today} />
        )}
      </main>
    </div>
  )
}
