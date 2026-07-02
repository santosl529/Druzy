import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { FormulaBuilder } from '@/components/formula-builder'
import type { Entry, Module } from '@/lib/types'

export default async function EditFormulaModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()

  const { data: modules } = await supabase
    .from('modules').select('*').eq('user_id', user.id).order('created_at', { ascending: false })

  const allModules = (modules ?? []) as Module[]
  const formulaModule = allModules.find((m) => m.id === id)
  if (!formulaModule || formulaModule.kind !== 'formula' || !formulaModule.formula_config) notFound()

  const sourceModules = allModules.filter(
    (m) => m.kind !== 'formula' && m.fields.some((f) => f.type === 'number' || f.type === 'rating')
  )

  const sourceIds = sourceModules.map((m) => m.id)
  const { data: entries } = sourceIds.length > 0
    ? await supabase.from('entries').select('*').eq('user_id', user.id).in('module_id', sourceIds)
    : { data: [] }

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10">
      <h1 className="text-2xl font-semibold mb-1">Edit formula</h1>
      <p className="text-muted-foreground mb-8">{formulaModule.name}</p>
      <FormulaBuilder
        modules={sourceModules}
        entries={(entries ?? []) as Entry[]}
        initial={{ id: formulaModule.id, name: formulaModule.name, config: formulaModule.formula_config, crystal_type: (formulaModule as Module).crystal_type }}
      />
    </main>
  )
}
