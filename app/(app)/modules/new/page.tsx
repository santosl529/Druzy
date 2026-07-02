import { requireUser } from '@/lib/supabase/auth'
import { ModuleBuilder } from '@/components/module-builder'

export default async function NewModulePage() {
  await requireUser()

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10">
      <h1 className="text-2xl font-semibold mb-1">New tracker</h1>
      <p className="text-muted-foreground mb-8">
        Define the fields you want to log, then save.
      </p>
      <ModuleBuilder />
    </main>
  )
}
