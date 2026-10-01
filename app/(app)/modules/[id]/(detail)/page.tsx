import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { EntryForm } from '@/components/entry-form'
import { EntryList } from '@/components/entry-list'
import { DeleteModuleButton } from '@/components/delete-module-button'
import { SortableChartsList } from '@/components/charts/sortable-charts'
import { FormulaSummary } from '@/components/formula-summary'
import { GeodeIcon } from '@/components/geode-icon'
import { GlanceTiles } from '@/components/glance-tiles'
import { buttonVariants } from '@/components/ui/button'
import { withFormulaEntries } from '@/lib/formula'
import { computeOpenness } from '@/lib/openness'
import { STAGES, getStageIndex } from '@/lib/stages'
import { currentStreak } from '@/lib/glance'
import { geodeVars } from '@/lib/geode-style'
import { addDaysISO, todayInTimezone } from '@/lib/date'
import type { Module, Chart, Entry } from '@/lib/types'

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

export default async function ModuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()

  // All of the user's modules (a handful) load up front so chart and formula
  // source modules can be picked out without another round trip.
  const [{ data: modules }, { data: charts }, savedTimezone] = await Promise.all([
    supabase.from('modules').select('*').eq('user_id', user.id),
    supabase.from('charts').select('*').eq('module_id', id).eq('user_id', user.id).order('position'),
    getUserTimezone(supabase, user.id),
  ])

  const allModules = (modules ?? []) as Module[]
  const typedModule = allModules.find((m) => m.id === id)
  if (!typedModule) notFound()

  const typedCharts = (charts ?? []) as Chart[]
  const isFormula = typedModule.kind === 'formula'

  // Modules whose data this page needs: the module itself plus any
  // modules referenced by chart series (multi-source charts).
  const neededIds = new Set<string>([id])
  for (const c of typedCharts) for (const s of c.config.series) neededIds.add(s.moduleId)

  const sourceModules = allModules.filter((m) => neededIds.has(m.id))

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

  const today = todayInTimezone(savedTimezone ?? 'UTC')
  const fields = typedModule.fields

  // Geode stage + streak for the header, from this tracker's own entries.
  const loggedDates = new Set(typedEntries.map((e) => e.entry_date))
  const windowStart = addDaysISO(today, -29)
  const openness = computeOpenness({
    recentDays: [...loggedDates].filter((d) => d >= windowStart && d <= today).length,
    totalEntries: typedEntries.length,
    daysSinceCreated: Math.max(0, Math.round((Date.parse(today) - Date.parse(typedModule.created_at.split('T')[0])) / 86_400_000)),
    isFormula,
  })
  const stageName = STAGES[getStageIndex(openness)].name
  const streak = currentStreak(loggedDates, today)

  // "Today so far": today's totals for each number field.
  const todayEntries = typedEntries.filter((e) => e.entry_date === today)
  const todayTotals = fields
    .filter((f) => f.type === 'number')
    .map((f) => ({
      field: f,
      total: todayEntries.reduce((sum, e) => {
        const n = Number((e.values as Record<string, unknown>)[f.key])
        return sum + (Number.isFinite(n) ? n : 0)
      }, 0),
    }))

  const actionClass = buttonVariants({ variant: 'outline', size: 'lg' })

  return (
    <main
      className="max-w-6xl mx-auto w-full px-4 py-8 flex flex-col gap-[22px]"
      style={geodeVars(typedModule.crystal_type, openness)}
    >
      <nav className="text-[0.8rem] text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:underline">Trackers</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{typedModule.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-[18px] flex-1 min-w-0">
          <GeodeIcon crystalType={typedModule.crystal_type} openness={openness} className="size-[60px] shrink-0" />
          <div className="min-w-0">
            <h1 className="font-heading text-[2rem] font-semibold tracking-tight leading-tight truncate">{typedModule.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isFormula
                ? `Formula tracker · ${typedEntries.length} computed ${typedEntries.length === 1 ? 'day' : 'days'}`
                : `${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`}
              {' · '}
              <span className="crystal-ink">{stageName}</span>
              {' · '}
              {streak}-day streak
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={isFormula ? `/modules/${id}/edit/formula` : `/modules/${id}/edit`} className={actionClass}>
            {isFormula ? 'Edit formula' : 'Edit fields'}
          </Link>
          {!isFormula && (
            <Link href={`/modules/${id}/import`} className={actionClass}>
              Import CSV
            </Link>
          )}
          <DeleteModuleButton id={id} compact />
        </div>
      </div>

      {/* Log panel (formula trackers are computed, not logged) */}
      {isFormula && typedModule.formula_config ? (
        <section className="rounded-2xl border bg-card px-[22px] py-5">
          <h2 className="font-heading text-base font-semibold mb-4">Formula</h2>
          <FormulaSummary config={typedModule.formula_config} modules={sourceModules} />
        </section>
      ) : (
        <section
          className="rounded-2xl border bg-card px-[22px] py-5"
          style={{
            borderColor: 'color-mix(in oklch, var(--border), var(--crystal-primary) 55%)',
            boxShadow: '0 0 28px color-mix(in srgb, var(--crystal-glow) 10%, transparent)',
          }}
        >
          <EntryForm
            moduleId={id}
            fields={fields}
            savedTimezone={savedTimezone}
            layout="bar"
            title="Log an entry"
            preview={
              <div className="flex flex-wrap items-center gap-x-7 gap-y-1.5 border-t pt-3.5 text-[0.8rem] text-muted-foreground">
                <span>Today so far</span>
                {todayTotals.map(({ field, total }, i) => (
                  <span key={field.key}>
                    <b className={i === 0 ? 'crystal-ink font-semibold' : 'text-foreground font-semibold'}>{fmt(total)}</b>
                    {field.unit ? ` ${field.unit}` : ''} {field.label.toLowerCase()}
                  </span>
                ))}
                <span className="sm:ml-auto">
                  {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'} today
                </span>
              </div>
            }
          />
        </section>
      )}

      <GlanceTiles mod={typedModule} entries={typedEntries} today={today} />

      {/* Charts */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[0.95rem] font-semibold">Charts</h2>
          <Link href={`/modules/${id}/charts/new`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <PlusIcon /> Add chart
          </Link>
        </div>

        {typedCharts.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No charts yet. Add one, or ask the assistant to draft one from your data.
          </p>
        ) : (
          <SortableChartsList
            charts={typedCharts}
            moduleId={id}
            entries={typedEntries}
            fields={fields}
            sourceModules={sourceModules}
            sourceEntries={sourceEntries}
            timezone={savedTimezone}
          />
        )}
      </section>

      {/* Entry history */}
      <EntryList
        moduleId={id}
        fields={fields}
        entries={typedEntries}
        readOnly={isFormula}
        title={isFormula ? 'Computed values' : 'History'}
        today={today}
      />
    </main>
  )
}
