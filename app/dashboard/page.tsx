import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { ModuleChart } from '@/components/module-chart'
import { withFormulaEntries } from '@/lib/formula'
import type { Chart, Entry, Module } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: charts }, { data: modules }, { data: entries }] = await Promise.all([
    supabase.from('charts').select('*').eq('user_id', user.id).order('module_id').order('position'),
    supabase.from('modules').select('*').eq('user_id', user.id),
    supabase.from('entries').select('*').eq('user_id', user.id),
  ])

  const typedCharts = (charts ?? []) as Chart[]
  const typedModules = (modules ?? []) as Module[]
  // Formula modules get computed (synthetic) entries appended on read.
  const typedEntries = withFormulaEntries(typedModules, (entries ?? []) as Entry[])

  const moduleMap = new Map(typedModules.map((m) => [m.id, m]))
  const entriesByModule = new Map<string, Entry[]>()
  for (const e of typedEntries) {
    const list = entriesByModule.get(e.module_id) ?? []
    list.push(e)
    entriesByModule.set(e.module_id, list)
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-6xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
        <p className="text-muted-foreground mb-8">All your charts in one place.</p>

        {typedCharts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            No charts yet. Open a tracker and add one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {typedCharts.map((chart) => {
              const mod = moduleMap.get(chart.module_id)
              if (!mod) return null
              const moduleEntries = entriesByModule.get(chart.module_id) ?? []
              const title = chart.config.title
                ?? mod.fields.find((f) => f.key === chart.config.series[0]?.field)?.label
                ?? chart.config.chartType

              const isWide = chart.config.chartType === 'calendar-heatmap' || chart.config.chartType === 'heatmap' || chart.config.chartType === 'table'

              return (
                <div key={chart.id} className={`rounded-lg border bg-card${isWide ? ' md:col-span-2' : ''}`}>
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{mod.name}</p>
                      <p className="text-sm font-medium">{title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{chart.config.chartType}</span>
                  </div>
                  <div className="p-4">
                    <ModuleChart
                      chart={chart}
                      entries={moduleEntries}
                      fields={mod.fields}
                      sourceModules={typedModules}
                      sourceEntries={typedEntries}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
