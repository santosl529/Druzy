import { LockIcon } from 'lucide-react'
import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { JournalCapture } from '@/components/journal/journal-capture'
import { JournalHistory } from '@/components/journal/journal-history'
import { getJournalTemplate, getJournalEntries } from '@/app/actions/journal'
import { getTrackerModules } from '@/app/actions/food'

export default async function JournalPage() {
  const { supabase, user } = await requireUser()

  const [template, entries, trackerModules, savedTimezone] = await Promise.all([
    getJournalTemplate(),
    getJournalEntries(30),
    getTrackerModules(),
    getUserTimezone(supabase, user.id),
  ])

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10 space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Journal</h1>
          <p className="text-muted-foreground mt-1">
            Transcribe handwritten entries locally — photos never leave your device.
          </p>
        </div>
        <a
          href="/journal/template"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          Edit template →
        </a>
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="h-3 w-3 mt-0.5 shrink-0" />
        <p>
          Transcription runs on your local Ollama model. Photos are never sent to any server or
          stored in the database — only the extracted text and field values are saved to your
          Supabase account.
        </p>
      </div>

      {/* Capture */}
      <section>
        <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">New entry</h2>
        <JournalCapture
          template={template}
          trackerModules={trackerModules}
          savedTimezone={savedTimezone}
        />
      </section>

      {/* History */}
      {entries.length > 0 && (
        <section>
          <h2 className="font-heading text-xl font-semibold tracking-tight mb-4">Recent entries</h2>
          <JournalHistory entries={entries} template={template} />
        </section>
      )}
    </main>
  )
}
