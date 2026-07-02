import { requireUser } from '@/lib/supabase/auth'
import { Nav } from '@/components/nav'
import { JournalTemplateBuilder } from '@/components/journal/journal-template-builder'
import { getJournalTemplate } from '@/app/actions/journal'
import { getTrackerModules, getBinaryTrackerModules } from '@/app/actions/food'

export default async function JournalTemplatePage() {
  const { user } = await requireUser()

  const [template, trackerModules, binaryModules] = await Promise.all([
    getJournalTemplate(),
    getTrackerModules(),
    getBinaryTrackerModules(),
  ])

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-2xl mx-auto w-full px-4 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <a href="/journal" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Journal
            </a>
          </div>
          <h1 className="text-2xl font-semibold">Extraction template</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define what the AI should extract from your journal entries. Add fields for things like
            daily highlights, mood, calories, weight — anything you regularly write down.
            Number fields can be connected to an existing tracker so extracted values are automatically logged.
          </p>
        </div>
        <JournalTemplateBuilder
          initial={template?.fields ?? []}
          initialBinaryModuleId={template?.binary_module_id ?? null}
          trackerModules={trackerModules}
          binaryModules={binaryModules}
        />
      </main>
    </div>
  )
}
