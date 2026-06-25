'use client'

import { useEffect, useState, useTransition } from 'react'
import { TrackerCard } from '@/components/tracker-card'
import { getTodayEntryStatus } from '@/app/actions/entries'
import { clientToday } from '@/lib/date'
import type { Module } from '@/lib/types'

interface TrackerGridProps {
  modules: Module[]
  // Module IDs the server believed had entries today (based on server-side date).
  initialDoneToday: string[]
  // The date string the server used — if it differs from the client date we re-fetch.
  serverDate: string
  // Day-boundary timezone from Settings (null = fall back to browser tz).
  savedTimezone: string | null
  // Openness value [0,1] per module id, computed server-side.
  opennessByModule: Record<string, number>
}

export function TrackerGrid({ modules, initialDoneToday, serverDate, savedTimezone, opennessByModule }: TrackerGridProps) {
  const [doneToday, setDoneToday] = useState(new Set(initialDoneToday))
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

  function handleLogged(moduleId: string) {
    setDoneToday((prev) => new Set([...prev, moduleId]))
  }

  function handleUnlogged(moduleId: string) {
    setDoneToday((prev) => {
      const next = new Set(prev)
      next.delete(moduleId)
      return next
    })
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[1.2rem]">
      {modules.map((mod) => (
        <TrackerCard
          key={mod.id}
          mod={mod}
          hasEntryToday={doneToday.has(mod.id)}
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
