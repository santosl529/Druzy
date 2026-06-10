import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { Module } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const typedModules = (modules ?? []) as Module[]

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Your trackers</h1>
            <p className="text-muted-foreground">Log and visualize anything that matters to you.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/modules/new" className={buttonVariants({ variant: 'outline' })}>
              Build manually
            </Link>
            <Link href="/assistant" className={buttonVariants()}>
              AI assistant
            </Link>
          </div>
        </div>

        {typedModules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground mb-6">No trackers yet.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/assistant" className={buttonVariants()}>
                Create with AI assistant
              </Link>
              <Link href="/modules/new" className={buttonVariants({ variant: 'outline' })}>
                Build manually
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {typedModules.map((mod) => (
              <Link key={mod.id} href={`/modules/${mod.id}`} className="group">
                <Card className="h-full transition-colors group-hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">{mod.name}</CardTitle>
                    <CardDescription>
                      {mod.fields.length} {mod.fields.length === 1 ? 'field' : 'fields'}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
