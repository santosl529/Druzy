'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Camera, PenLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { clientToday, formatDisplayDate, addDaysISO } from '@/lib/date'
import type { FoodEntry, DailyTotals, TrackerModule } from '@/lib/types'
import { DailyTotalsBar } from '@/components/food/daily-totals-bar'
import { EntryRow } from '@/components/food/entry-row'
import { PhotoUploader } from '@/components/food/photo-uploader'
import { ManualEntry } from '@/components/food/manual-entry'

// ----------------------------------------------------------------
// Main FoodLog component
// ----------------------------------------------------------------

type AddMode = 'photo' | 'manual' | null

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
  const [addMode, setAddMode] = useState<AddMode>(null)
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
    setAddMode(null)
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
    setAddMode(null)
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

  const isToday = date === clientToday(savedTimezone)

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateDate(addDaysISO(date, -1))}
          disabled={loadingDate}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <h2 className="font-medium">{formatDisplayDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          {!isToday && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:pointer-events-none"
              onClick={() => navigateDate(clientToday(savedTimezone))}
              disabled={loadingDate}
            >
              Back to today
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateDate(addDaysISO(date, 1))}
          disabled={loadingDate || isToday}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Daily totals */}
      <DailyTotalsBar totals={totals} />

      <Separator />

      {/* Entry list */}
      {entries.length > 0 ? (
        <div>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No entries for this day.</p>
      )}

      <Separator />

      {/* Add entry section */}
      {addMode === null ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddMode('photo')}
            className="gap-1.5"
          >
            <Camera className="h-4 w-4" />
            Photo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddMode('manual')}
            className="gap-1.5"
          >
            <PenLine className="h-4 w-4" />
            Manual
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {addMode === 'photo' ? 'Add via photo' : 'Add manually'}
              </CardTitle>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setAddMode(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {addMode === 'photo' ? (
              <PhotoUploader date={date} trackerModules={trackerModules} onSaved={handleSaved} />
            ) : (
              <ManualEntry date={date} trackerModules={trackerModules} onSaved={handleSaved} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
