import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { ImportWizard } from '@/components/import/import-wizard'
import type { Module } from '@/lib/types'

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()

  const { data: module } = await supabase
    .from('modules')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!module) notFound()

  const typedModule = module as Module
  if (typedModule.kind === 'formula') notFound()

  const { data: entries } = await supabase
    .from('entries')
    .select('entry_date')
    .eq('module_id', id)
    .eq('user_id', user.id)

  const existingDates = [...new Set((entries ?? []).map((e) => e.entry_date as string))]

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10">
      <p className="text-sm text-muted-foreground mb-1">
        <Link href="/" className="hover:underline">Trackers</Link>
        {' / '}
        <Link href={`/modules/${id}`} className="hover:underline">{typedModule.name}</Link>
        {' / '}
      </p>
      <h1 className="text-2xl font-semibold mb-1">Import data</h1>
      <p className="text-muted-foreground mb-8">
        Upload a spreadsheet, map columns to fields, preview, then confirm.
      </p>
      <ImportWizard
        moduleId={id}
        fields={typedModule.fields}
        existingDates={existingDates}
      />
    </main>
  )
}
