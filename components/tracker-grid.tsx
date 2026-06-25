'use client'

import { useEffect, useState, useTransition } from 'react'
import { TrackerCard, type LoggedEntry } from '@/components/tracker-card'
import { getTodayEntryStatus } from '@/app/actions/entries'
import { clientToday } from '@/lib/date'
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
}

export function TrackerGrid({ modules, initialDoneToday, entriesByModule, serverDate, savedTimezone, opennessByModule }: TrackerGridProps) {
  const [doneToday, setDoneToday] = useState(new Set(initialDoneToday))
  // Entries are held in state so quick-logs update the card summaries optimistically.
  const [entries, setEntries] = useState(entriesByModule)
  // The authoritative "today" honors the saved timezone, falling back to the
  // browser timezone when unset. Initialized to the server date to avoid a
  // hydration mismatch, then reconciled on mount.
  const [today, setToday] = useState(serverDate)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const clientDate = clientToday(savedTimezone)
    // When the client and server agree, the initial state is already correct.
    if (clientDate === serverDate) return

    // Server and client disagree on today (timezone mismatch) — re-fetch status
    // and correct the date. Both updates run inside the transition.
    const moduleIds = modules.map((m) => m.id)
    startTransition(async () => {
      const ids = await getTodayEntryStatus(moduleIds, clientDate)
      setToday(clientDate)
      setDoneToday(new Set(ids))
    })
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[1.2rem]">
      {modules.map((mod) => (
        <TrackerCard
          key={mod.id}
          mod={mod}
          hasEntryToday={doneToday.has(mod.id)}
          entries={entries[mod.id] ?? []}
          today={today}
          openness={opennessByModule[mod.id] ?? 0}
          savedTimezone={savedTimezone}
          onLogged={handleLogged}
          onUnlogged={handleUnlogged}
        />
      ))}
    </div>
  )
}
