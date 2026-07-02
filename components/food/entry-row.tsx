'use client'

import { useState, useTransition } from 'react'
import { PenLine, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteFoodEntry, updateFoodEntry } from '@/app/actions/food'
import type { FoodEntry } from '@/lib/types'
import type { MacroValues } from '@/components/food/shared'
import { MacroFields } from '@/components/food/macro-fields'

// ----------------------------------------------------------------
// Entry row (inline edit)
// ----------------------------------------------------------------

interface EntryRowProps {
  entry: FoodEntry
  onDeleted: (id: string) => void
  onUpdated: (entry: FoodEntry) => void
}

export function EntryRow({ entry, onDeleted, onUpdated }: EntryRowProps) {
  const [editing, setEditing] = useState(false)
  const [macros, setMacros] = useState<MacroValues>({
    calories: entry.calories != null ? String(entry.calories) : '',
    protein_g: entry.protein_g != null ? String(entry.protein_g) : '',
    fat_g: entry.fat_g != null ? String(entry.fat_g) : '',
    carbs_g: entry.carbs_g != null ? String(entry.carbs_g) : '',
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSaveEdit = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateFoodEntry(entry.id, {
        calories: macros.calories ? Number(macros.calories) : null,
        protein_g: macros.protein_g ? Number(macros.protein_g) : null,
        fat_g: macros.fat_g ? Number(macros.fat_g) : null,
        carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      onUpdated({
        ...entry,
        calories: macros.calories ? Number(macros.calories) : null,
        protein_g: macros.protein_g ? Number(macros.protein_g) : null,
        fat_g: macros.fat_g ? Number(macros.fat_g) : null,
        carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
      })
      setEditing(false)
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      await deleteFoodEntry(entry.id)
      onDeleted(entry.id)
    })
  }

  const macro = (val: number | null, unit: string) =>
    val != null ? `${Math.round(val * 10) / 10}${unit}` : '—'

  if (editing) {
    return (
      <div className="space-y-3 py-3 border-b last:border-0">
        <MacroFields values={macros} onChange={(k, v) => setMacros((p) => ({ ...p, [k]: v }))} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium tabular-nums">{macro(entry.calories, ' kcal')}</span>
        <span className="text-muted-foreground tabular-nums">P {macro(entry.protein_g, 'g')}</span>
        <span className="text-muted-foreground tabular-nums">F {macro(entry.fat_g, 'g')}</span>
        <span className="text-muted-foreground tabular-nums">C {macro(entry.carbs_g, 'g')}</span>
        {entry.source === 'photo' && (
          <span className="text-xs text-muted-foreground/60 hidden sm:inline">photo</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
          <PenLine className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
