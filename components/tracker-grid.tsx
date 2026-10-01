'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { TrackerCard, type CardStage, type LoggedEntry } from '@/components/tracker-card'
import { getTodayEntryStatus } from '@/app/actions/entries'
import { clientToday, formatDisplayDate } from '@/lib/date'
import type { CardEntry } from '@/lib/card-summary'
import type { Module } from '@/lib/types'

interface TrackerGridProps {
  modules: Module[]
  // Module IDs the server believed had entries today (based on server-side date).
  initialDoneToday: string[]
  // Each module's entries (just the fields the card summary needs).
  entriesByModule: Record<string, CardEntry[]>
  // The date string the server used — if it differs from the client date we re-fetch.
  serverDate: string
  // Day-boundary timezone from Settings (null = fall back to browser tz).
  savedTimezone: string | null
  // Openness value [0,1] per module id, computed server-side.
  opennessByModule: Record<string, number>
  // Current geode stage + caption per module id, computed server-side.
  stageByModule: Record<string, CardStage>
}

export function TrackerGrid({ modules, initialDoneToday, entriesByModule, serverDate, savedTimezone, opennessByModule, stageByModule }: TrackerGridProps) {
  const [doneToday, setDoneToday] = useState(new Set(initialDoneToday))
  // Entries are held in state so quick-logs update the card summaries optimistically.
  const [entries, setEntries] = useState(entriesByModule)
  // The authoritative "today" honors the saved timezone, falling back to the
  // browser timezone when unset. Initialized to the server date to avoid a
  // hydration mismatch, then reconciled on mount.
  const [today, setToday] = useState(serverDate)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // Re-derives "today" against the current value of `today` state (not the
    // static `serverDate` prop) so this can be called again later, after
    // mount, when wall-clock time has actually advanced (e.g. tab left open
    // across midnight) — see the visibilitychange/focus listener below.
    function reconcileToday(current: string) {
      const clientDate = clientToday(savedTimezone)
      // Already correct — nothing to reconcile.
      if (clientDate === current) return

      // Client's notion of "today" has moved on — re-fetch status and correct
      // the date. Both updates run inside the transition.
      const moduleIds = modules.map((m) => m.id)
      startTransition(async () => {
        const ids = await getTodayEntryStatus(moduleIds, clientDate)
        setToday(clientDate)
        setDoneToday(new Set(ids))
      })
    }

    // Mount-time reconciliation: catches a client/server timezone disagreement
    // on initial render.
    reconcileToday(serverDate)

    // Re-sync when the tab regains visibility or focus — catches wall-clock
    // day rollover while the tab was left open (no polling/interval).
    function handleWake() {
      setToday((current) => {
        reconcileToday(current)
        return current
      })
    }
    document.addEventListener('visibilitychange', handleWake)
    window.addEventListener('focus', handleWake)
    return () => {
      document.removeEventListener('visibilitychange', handleWake)
      window.removeEventListener('focus', handleWake)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDate, savedTimezone])

  function handleLogged(moduleId: string, logged: LoggedEntry) {
    setDoneToday((prev) => new Set([...prev, moduleId]))
    // Reflect the new entry in the summary immediately. created_at is set to now
    // so it wins latest-tie-breaking; the values match what the server stored.
    const optimistic: CardEntry = {
      entry_date: logged.entryDate,
      values: logged.values,
      created_at: new Date().toISOString(),
    }
    setEntries((prev) => ({ ...prev, [moduleId]: [...(prev[moduleId] ?? []), optimistic] }))
  }

  function handleUnlogged(moduleId: string) {
    setDoneToday((prev) => {
      const next = new Set(prev)
      next.delete(moduleId)
      return next
    })
    // Binary unmark removes today's entries server-side — mirror that here.
    setEntries((prev) => ({
      ...prev,
      [moduleId]: (prev[moduleId] ?? []).filter((e) => e.entry_date !== today),
    }))
  }

  // Formula trackers can't be logged, so they don't count toward the daily tally.
  const loggable = modules.filter((m) => m.kind !== 'formula')
  const loggedCount = loggable.filter((m) => doneToday.has(m.id)).length

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Trackers</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {formatDisplayDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}
            {loggedCount} of {loggable.length} logged today
          </p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <Link href="/modules/new" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Build manually
          </Link>
          <Link href="/assistant" className={buttonVariants({ size: 'lg' })}>
            <Sparkles /> Describe a tracker
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((mod) => (
          <TrackerCard
            key={mod.id}
            mod={mod}
            hasEntryToday={doneToday.has(mod.id)}
            entries={entries[mod.id] ?? []}
            today={today}
            openness={opennessByModule[mod.id] ?? 0}
            stage={stageByModule[mod.id]}
            savedTimezone={savedTimezone}
            onLogged={handleLogged}
            onUnlogged={handleUnlogged}
          />
        ))}

        <div className="rounded-2xl border border-dashed border-foreground/15 p-5 flex flex-col justify-center gap-2.5 min-h-[212px]">
          <h2 className="font-heading text-[1.05rem] font-semibold">New tracker</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Describe it in a sentence (&ldquo;track my saxophone practice&rdquo;) and the assistant drafts the fields.
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            <Link href="/assistant" className={buttonVariants({ size: 'sm' })}>
              <Sparkles /> Describe
            </Link>
            <Link href="/modules/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Build manually
            </Link>
            <Link href="/modules/new/formula" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Formula
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
