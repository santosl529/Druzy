'use client'

import { useEffect, useState, useTransition } from 'react'
import { TrackerCard } from '@/components/tracker-card'
import { getTodayEntryStatus } from '@/app/actions/entries'
import type { Module } from '@/lib/types'

interface TrackerGridProps {
  modules: Module[]
  // Module IDs the server believed had entries today (based on server-side date).
  initialDoneToday: string[]
  // The date string the server used — if it differs from the client date we re-fetch.
  serverDate: string
}

export function TrackerGrid({ modules, initialDoneToday, serverDate }: TrackerGridProps) {
  const [doneToday, setDoneToday] = useState(new Set(initialDoneToday))
  const [, startTransition] = useTransition()

  useEffect(() => {
    const clientDate = new Date().toLocaleDateString('en-CA')
    if (clientDate === serverDate) return

    // Server and browser disagree on today (timezone mismatch) — re-fetch with correct date.
    const moduleIds = modules.map((m) => m.id)
    startTransition(async () => {
      const ids = await getTodayEntryStatus(moduleIds, clientDate)
      setDoneToday(new Set(ids))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDate])

  function handleMarkDone(moduleId: string) {
    setDoneToday((prev) => new Set([...prev, moduleId]))
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {modules.map((mod) => (
        <TrackerCard
          key={mod.id}
          mod={mod}
          hasEntryToday={doneToday.has(mod.id)}
          onMarkDone={handleMarkDone}
        />
      ))}
    </div>
  )
}
