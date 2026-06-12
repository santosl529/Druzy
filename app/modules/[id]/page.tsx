import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { EntryForm } from '@/components/entry-form'
import { EntryList } from '@/components/entry-list'
import { DeleteModuleButton } from '@/components/delete-module-button'
import { SortableChartsList } from '@/components/charts/sortable-charts'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { Module, Chart, Entry } from '@/lib/types'

export default async function ModuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: module }, { data: charts }, { data: entries }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('charts').select('*').eq('module_id', id).eq('user_id', user.id).order('position'),
    supabase.from('entries').select('*').eq('module_id', id).eq('user_id', user.id)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
  ])

  if (!module) notFound()

  const typedModule = module as Module
  const typedCharts = (charts ?? []) as Chart[]
  const typedEntries = (entries ?? []) as Entry[]

  // Multi-series charts may reference other modules; fetch their data too.
  const foreignModuleIds = [...new Set(
    typedCharts.flatMap((c) => c.config.series.map((s) => s.moduleId))
  )].filter((mid) => mid !== id)

  let sourceModules: Module[] = [typedModule]
  let sourceEntries: Entry[] = typedEntries
  if (foreignModuleIds.length > 0) {
    const [{ data: foreignModules }, { data: foreignEntries }] = await Promise.all([
      supabase.from('modules').select('*').eq('user_id', user.id).in('id', foreignModuleIds),
      supabase.from('entries').select('*').eq('user_id', user.id).in('module_id', foreignModuleIds),
    ])
    sourceModules = [typedModule, ...((foreignModules ?? []) as Module[])]
    sourceEntries = [...typedEntries, ...((foreignEntries ?? []) as Entry[])]
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-4xl mx-auto w-full px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              <Link href="/" className="hover:underline">Trackers</Link> /
            </p>
            <h1 className="text-2xl font-semibold">{typedModule.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {typedEntries.length} {typedEntries.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
            <Link href={`/modules/${id}/edit`} className={buttonVariants({ variant: 'outline' })}>
              Edit fields
            </Link>
            <DeleteModuleButton id={id} />
          </div>
        </div>

        <Separator />

        {/* Log entry */}
        <section>
          <h2 className="font-medium mb-4">Log entry</h2>
          <EntryForm moduleId={id} fields={typedModule.fields} />
        </section>

        <Separator />

        {/* Charts */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">Charts</h2>
            <Link
              href={`/modules/${id}/charts/new`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <PlusIcon className="size-4 mr-1" /> Add chart
            </Link>
          </div>

          {typedCharts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No charts yet. Add one above.</p>
          ) : (
            <SortableChartsList
              charts={typedCharts}
              moduleId={id}
              entries={typedEntries}
              fields={typedModule.fields}
              sourceModules={sourceModules}
              sourceEntries={sourceEntries}
            />
          )}
        </section>

        <Separator />

        {/* Entry history */}
        <section>
          <h2 className="font-medium mb-4">History</h2>
          <EntryList moduleId={id} fields={typedModule.fields} entries={typedEntries} />
        </section>
      </main>
    </div>
  )
}
