import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { ChartBuilder } from '@/components/chart-builder'
import type { Module, Chart } from '@/lib/types'

export default async function EditChartPage({
  params,
}: {
  params: Promise<{ id: string; chartId: string }>
}) {
  const { id, chartId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: module }, { data: chart }, { data: allModules }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('charts').select('*').eq('id', chartId).eq('user_id', user.id).single(),
    supabase.from('modules').select('*').eq('user_id', user.id).order('name'),
  ])

  if (!module || !chart) notFound()

  const m = module as Module
  const c = chart as Chart

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-2xl mx-auto w-full px-4 py-10">
        <p className="text-sm text-muted-foreground mb-1">
          <a href={`/modules/${id}`} className="hover:underline">{m.name}</a> / Edit chart
        </p>
        <h1 className="text-2xl font-semibold mb-8">Edit chart</h1>
        <ChartBuilder moduleId={id} fields={m.fields} modules={(allModules ?? []) as Module[]} initial={c} />
      </main>
    </div>
  )
}
