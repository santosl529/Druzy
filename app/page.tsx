import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { buttonVariants } from '@/components/ui/button'
import { TrackerGrid } from '@/components/tracker-grid'
import { todayInTimezone } from '@/lib/date'
import type { Module } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const typedModules = (modules ?? []) as Module[]

  const { data: profile } = await supabase
    .from('profiles')
    .select('day_boundary_tz')
    .eq('id', user.id)
    .single()
  const savedTimezone = (profile?.day_boundary_tz as string | null) || null
  const today = todayInTimezone(savedTimezone || 'UTC')

  const moduleIds = typedModules.map((m) => m.id)
  const { data: todayEntries } =
    moduleIds.length > 0
      ? await supabase
          .from('entries')
          .select('module_id')
          .eq('user_id', user.id)
          .eq('entry_date', today)
          .in('module_id', moduleIds)
      : { data: [] }
  const doneToday = new Set((todayEntries ?? []).map((e) => e.module_id))

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Your trackers</h1>
            <p className="text-muted-foreground">Log and visualize anything that matters to you.</p>
          </div>
          <div className="flex gap-2">
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
            serverDate={today}
            savedTimezone={savedTimezone}
          />
        )}
      </main>
    </div>
  )
}
