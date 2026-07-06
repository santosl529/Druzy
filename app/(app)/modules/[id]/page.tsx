import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { EntryForm } from '@/components/entry-form'
import { EntryList } from '@/components/entry-list'
import { DeleteModuleButton } from '@/components/delete-module-button'
import { SortableChartsList } from '@/components/charts/sortable-charts'
import { FormulaSummary } from '@/components/formula-summary'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { withFormulaEntries } from '@/lib/formula'
import type { Module, Chart, Entry } from '@/lib/types'

export default async function ModuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()

  const [{ data: module }, { data: charts }, savedTimezone] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('charts').select('*').eq('module_id', id).eq('user_id', user.id).order('position'),
    getUserTimezone(supabase, user.id),
  ])

  if (!module) notFound()

  const typedModule = module as Module
  const typedCharts = (charts ?? []) as Chart[]
  const isFormula = typedModule.kind === 'formula'

  // Modules whose data this page needs: the module itself plus any
  // modules referenced by chart series (multi-source charts).
  const neededIds = new Set<string>([id])
  for (const c of typedCharts) for (const s of c.config.series) neededIds.add(s.moduleId)

  const { data: srcModules } = await supabase
    .from('modules').select('*').eq('user_id', user.id).in('id', [...neededIds])
  const sourceModules = (srcModules ?? []) as Module[]

  // Formula modules additionally need their input modules' entries.
  const entryIds = new Set(neededIds)
  for (const m of sourceModules) {
    if (m.kind === 'formula' && m.formula_config) {
      for (const input of m.formula_config.inputs) entryIds.add(input.moduleId)
    }
  }

  const { data: entries } = await supabase
    .from('entries').select('*').eq('user_id', user.id).in('module_id', [...entryIds])

  // Compute formula values on read; they flow through as synthetic entries.
  const sourceEntries = withFormulaEntries(sourceModules, (entries ?? []) as Entry[])
  const typedEntries = sourceEntries
    .filter((e) => e.module_id === id)
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))

  return (
    <main className="max-w-4xl mx-auto w-full px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/" className="hover:underline">Trackers</Link> /
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight">{typedModule.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isFormula
              ? `Formula tracker — ${typedEntries.length} computed ${typedEntries.length === 1 ? 'day' : 'days'}`
              : `${typedEntries.length} ${typedEntries.length === 1 ? 'entry' : 'entries'}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isFormula && (
            <Link href={`/modules/${id}/import`} className={buttonVariants({ variant: 'outline' })}>
              Import
            </Link>
          )}
          <Link
            href={isFormula ? `/modules/${id}/edit/formula` : `/modules/${id}/edit`}
            className={buttonVariants({ variant: 'outline' })}
          >
            {isFormula ? 'Edit formula' : 'Edit fields'}
          </Link>
          <DeleteModuleButton id={id} />
        </div>
      </div>

      <Separator />

      {/* Formula modules are computed, not logged */}
      {isFormula && typedModule.formula_config ? (
        <section>
          <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Formula</h2>
          <FormulaSummary
            config={typedModule.formula_config}
            modules={sourceModules}
          />
        </section>
      ) : (
        <section>
          <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Log entry</h2>
          <EntryForm moduleId={id} fields={typedModule.fields} savedTimezone={savedTimezone} />
        </section>
      )}

      <Separator />

      {/* Charts */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl font-semibold tracking-tight">Charts</h2>
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
            timezone={savedTimezone}
          />
        )}
      </section>

      <Separator />

      {/* Entry history */}
      <section>
        <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">{isFormula ? 'Computed values' : 'History'}</h2>
        <EntryList
          moduleId={id}
          fields={typedModule.fields}
          entries={typedEntries}
          readOnly={isFormula}
        />
      </section>
    </main>
  )
}
