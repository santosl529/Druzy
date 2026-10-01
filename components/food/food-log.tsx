'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Camera, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clientToday, formatDisplayDate, addDaysISO } from '@/lib/date'
import { geodeVars } from '@/lib/geode-style'
import { cn } from '@/lib/utils'
import type { FoodEntry, DailyTotals, TrackerModule } from '@/lib/types'
import { DailyTotalsBar } from '@/components/food/daily-totals-bar'
import { EntryRow } from '@/components/food/entry-row'
import { PhotoUploader } from '@/components/food/photo-uploader'
import { ManualEntry } from '@/components/food/manual-entry'

// ----------------------------------------------------------------
// Main FoodLog component
// ----------------------------------------------------------------

type AddMode = 'photo' | 'manual'

interface FoodLogProps {
  initialDate: string
  initialEntries: FoodEntry[]
  initialTotals: DailyTotals
  trackerModules: TrackerModule[]
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone: string | null
}

export function FoodLog({
  initialDate,
  initialEntries,
  initialTotals,
  trackerModules,
  savedTimezone,
}: FoodLogProps) {
  const [date, setDate] = useState(initialDate)
  const [entries, setEntries] = useState<FoodEntry[]>(initialEntries)
  const [totals, setTotals] = useState<DailyTotals>(initialTotals)
  const [addMode, setAddMode] = useState<AddMode>('photo')
  const [loadingDate, startDateTransition] = useTransition()

  const recalcTotals = useCallback((updated: FoodEntry[]) => {
    setTotals({
      calories: updated.reduce((s, e) => s + (e.calories ?? 0), 0),
      protein_g: updated.reduce((s, e) => s + (e.protein_g ?? 0), 0),
      fat_g: updated.reduce((s, e) => s + (e.fat_g ?? 0), 0),
      carbs_g: updated.reduce((s, e) => s + (e.carbs_g ?? 0), 0),
    })
  }, [])

  const navigateDate = useCallback((newDate: string) => {
    startDateTransition(async () => {
      const res = await fetch(`/api/food/entries?date=${newDate}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
        setTotals(data.totals)
      }
      setDate(newDate)
    })
  }, [])

  // The server computes the initial date using the saved timezone (or UTC when
  // unset). If the browser-effective "today" differs (e.g. the setting is unset
  // and the server defaulted to UTC), reconcile to the correct day on mount.
  // All state updates run inside the transition to avoid cascading renders.
  useEffect(() => {
    const clientDate = clientToday(savedTimezone)
    if (clientDate === initialDate) return
    startDateTransition(async () => {
      const res = await fetch(`/api/food/entries?date=${clientDate}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
        setTotals(data.totals)
      }
      setDate(clientDate)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaved = (entry: FoodEntry) => {
    setEntries((prev) => {
      const updated = [...prev, entry]
      recalcTotals(updated)
      return updated
    })
  }

  const handleDeleted = (id: string) => {
    setEntries((prev) => {
      const updated = prev.filter((e) => e.id !== id)
      recalcTotals(updated)
      return updated
    })
  }

  const handleUpdated = (updated: FoodEntry) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === updated.id ? updated : e))
      recalcTotals(next)
      return next
    })
  }

  const today = clientToday(savedTimezone)
  const isToday = date === today
  const yesterday = addDaysISO(today, -1)
  const dayName = isToday ? "Today's" : formatDisplayDate(date, { month: 'short', day: 'numeric' })
  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1.5 transition-colors disabled:opacity-50',
      active ? 'border-primary bg-primary/20' : 'text-foreground/80 hover:text-foreground hover:bg-muted/60',
    )

  return (
    <div className="flex flex-col gap-[22px]" style={geodeVars('citrine', 1)}>
      {/* Header + date navigation */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Food</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {formatDisplayDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} · {entries.length}{' '}
            {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[0.8rem] font-medium">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateDate(addDaysISO(date, -1))}
            disabled={loadingDate}
            aria-label="Previous day"
          >
            <ChevronLeft />
          </Button>
          <button type="button" className={chip(isToday)} onClick={() => navigateDate(today)} disabled={loadingDate}>
            Today · {formatDisplayDate(today, { month: 'short', day: 'numeric' })}
          </button>
          <button type="button" className={chip(date === yesterday)} onClick={() => navigateDate(yesterday)} disabled={loadingDate}>
            Yesterday
          </button>
          <label className={cn(chip(!isToday && date !== yesterday), 'relative cursor-pointer')}>
            {!isToday && date !== yesterday ? formatDisplayDate(date, { month: 'short', day: 'numeric' }) : 'Pick date…'}
            <input
              type="date"
              aria-label="Pick a date"
              max={today}
              value={date}
              onChange={(e) => e.target.value && navigateDate(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateDate(addDaysISO(date, 1))}
            disabled={loadingDate || isToday}
            aria-label="Next day"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Daily totals */}
      <DailyTotalsBar totals={totals} entryCount={entries.length} />

      {/* Log panel */}
      <section
        className="rounded-2xl border bg-card px-[22px] py-5 flex flex-col gap-[18px]"
        style={{
          borderColor: 'color-mix(in srgb, var(--border), var(--crystal-primary) 55%)',
          boxShadow: '0 0 28px color-mix(in srgb, var(--crystal-glow) 10%, transparent)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold">Log food</h2>
          <div role="tablist" aria-label="How to log" className="flex rounded-lg border bg-background p-[3px] text-[0.8rem] font-medium">
            {(
              [
                { mode: 'photo', label: 'Photo', icon: Camera },
                { mode: 'manual', label: 'Manual', icon: PenLine },
              ] as const
            ).map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={addMode === mode}
                onClick={() => setAddMode(mode)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3.5 py-1 transition-colors',
                  addMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        {addMode === 'photo' ? (
          <PhotoUploader key={date} date={date} trackerModules={trackerModules} onSaved={handleSaved} />
        ) : (
          <ManualEntry key={date} date={date} trackerModules={trackerModules} onSaved={handleSaved} />
        )}
      </section>

      {/* Entries */}
      <section className={cn('rounded-2xl border bg-card overflow-hidden transition-opacity', loadingDate && 'opacity-60')}>
        <div className="flex items-center justify-between px-[22px] py-4">
          <h2 className="font-heading text-[0.95rem] font-semibold">{dayName} entries</h2>
          <span className="text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {Math.round(totals.calories).toLocaleString('en-US')} kcal
          </span>
        </div>
        {entries.length > 0 ? (
          entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onDeleted={handleDeleted} onUpdated={handleUpdated} />
          ))
        ) : (
          <p className="border-t text-sm text-muted-foreground text-center py-6">No entries for this day.</p>
        )}
      </section>
    </div>
  )
}
