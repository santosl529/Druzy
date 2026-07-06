import { requireUser } from '@/lib/supabase/auth'
import { FormulaBuilder } from '@/components/formula-builder'
import type { Entry, Module } from '@/lib/types'

export default async function NewFormulaModulePage() {
  const { supabase, user } = await requireUser()

  const { data: modules } = await supabase
    .from('modules').select('*').eq('user_id', user.id).order('created_at', { ascending: false })

  // Only standard modules with at least one numeric field can feed a formula.
  const sourceModules = ((modules ?? []) as Module[]).filter(
    (m) => m.kind !== 'formula' && m.fields.some((f) => f.type === 'number' || f.type === 'rating')
  )

  const sourceIds = sourceModules.map((m) => m.id)
  const { data: entries } = sourceIds.length > 0
    ? await supabase.from('entries').select('*').eq('user_id', user.id).in('module_id', sourceIds)
    : { data: [] }

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10">
      <h1 className="font-heading text-3xl font-bold tracking-tight mb-1">New formula tracker</h1>
      <p className="text-muted-foreground mb-8">
        Combine values from other trackers into one computed daily value.
      </p>
      <FormulaBuilder modules={sourceModules} entries={(entries ?? []) as Entry[]} />
    </main>
  )
}
