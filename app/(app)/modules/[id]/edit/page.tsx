import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { ModuleBuilder } from '@/components/module-builder'
import type { Module } from '@/lib/types'

export default async function EditModulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, user } = await requireUser()

  const { data: module } = await supabase
    .from('modules')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!module) notFound()

  // Formula modules have their own edit page.
  if ((module as { kind?: string }).kind === 'formula') {
    redirect(`/modules/${id}/edit/formula`)
  }

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10">
      <h1 className="text-2xl font-semibold mb-1">Edit tracker</h1>
      <p className="text-muted-foreground mb-8">
        Fields added here will appear on new entries; existing entries are unaffected.
      </p>
      <ModuleBuilder initial={module as Module} />
    </main>
  )
}
