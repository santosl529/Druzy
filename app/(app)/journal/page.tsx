import Link from 'next/link'
import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { JournalCapture } from '@/components/journal/journal-capture'
import { JournalHistory } from '@/components/journal/journal-history'
import { OllamaStatusPill } from '@/components/journal/ollama-status'
import { buttonVariants } from '@/components/ui/button'
import { geodeVars } from '@/lib/geode-style'
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
    <main
      className="max-w-6xl mx-auto w-full px-4 py-8 flex flex-col gap-[22px]"
      style={geodeVars('rose_quartz', 1)}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Journal</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Photograph a handwritten page. Druzy transcribes it on this device.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <OllamaStatusPill />
          <Link href="/journal/template" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Edit template
          </Link>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-[0.8rem] text-foreground/80">
        <span aria-hidden="true" className="size-2 shrink-0 rotate-45 bg-[#3A9B6F]" />
        Your photos never leave this device, and transcription runs on your local Ollama model. Only the text and
        fields you save are stored.
      </div>

      <JournalCapture template={template} trackerModules={trackerModules} savedTimezone={savedTimezone} />

      {entries.length > 0 && <JournalHistory entries={entries} template={template} />}
    </main>
  )
}
