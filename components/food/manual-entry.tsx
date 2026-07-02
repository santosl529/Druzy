'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createFoodEntry, createEntryInModule } from '@/app/actions/food'
import type { FoodEntry, TrackerModule } from '@/lib/types'
import type { MacroValues, TrackerSelection } from '@/components/food/shared'
import { MacroFields } from '@/components/food/macro-fields'
import { TrackerLogSection } from '@/components/food/tracker-log-section'

// ----------------------------------------------------------------
// Manual entry form
// ----------------------------------------------------------------

interface ManualEntryProps {
  date: string
  trackerModules: TrackerModule[]
  onSaved: (entry: FoodEntry) => void
}

export function ManualEntry({ date, trackerModules, onSaved }: ManualEntryProps) {
  const [macros, setMacros] = useState<MacroValues>({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })
  const [trackerSelection, setTrackerSelection] = useState<TrackerSelection | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const [foodResult, trackerResult] = await Promise.all([
        createFoodEntry({
          entry_date: date,
          calories: macros.calories ? Number(macros.calories) : null,
          protein_g: macros.protein_g ? Number(macros.protein_g) : null,
          fat_g: macros.fat_g ? Number(macros.fat_g) : null,
          carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
          source: 'manual',
        }),
        trackerSelection
          ? createEntryInModule(
              trackerSelection.moduleId,
              date,
              Object.fromEntries(
                Object.entries(trackerSelection.fieldValues).map(([k, v]) => [
                  k,
                  v !== '' ? Number(v) : null,
                ])
              )
            )
          : Promise.resolve(null),
      ])

      if (foodResult.error) {
        setError(foodResult.error)
        return
      }
      if (trackerResult && 'error' in trackerResult && trackerResult.error) {
        setError(`Food saved, but tracker error: ${trackerResult.error}`)
      }

      onSaved({
        id: foodResult.id!,
        user_id: '',
        entry_date: date,
        calories: macros.calories ? Number(macros.calories) : null,
        protein_g: macros.protein_g ? Number(macros.protein_g) : null,
        fat_g: macros.fat_g ? Number(macros.fat_g) : null,
        carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
        source: 'manual',
        photo_path: null,
        created_at: new Date().toISOString(),
      })

      setMacros({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })
      setTrackerSelection(null)
    })
  }

  return (
    <div className="space-y-4">
      <MacroFields values={macros} onChange={(k, v) => setMacros((p) => ({ ...p, [k]: v }))} />
      <TrackerLogSection
        macros={macros}
        modules={trackerModules}
        onChange={setTrackerSelection}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSave} disabled={isPending} size="sm">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
        Add entry
      </Button>
    </div>
  )
}
