import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { Nav } from '@/components/nav'
import { ChartBuilder } from '@/components/chart-builder'
import type { Module } from '@/lib/types'

export default async function NewChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()

  const [{ data: module }, { data: allModules }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('modules').select('*').eq('user_id', user.id).order('name'),
  ])
  if (!module) notFound()

  const m = module as Module

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-2xl mx-auto w-full px-4 py-10">
        <p className="text-sm text-muted-foreground mb-1">
          <a href={`/modules/${id}`} className="hover:underline">{m.name}</a> / New chart
        </p>
        <h1 className="text-2xl font-semibold mb-8">Add chart</h1>
        <ChartBuilder moduleId={id} fields={m.fields} modules={(allModules ?? []) as Module[]} />
      </main>
    </div>
  )
}
