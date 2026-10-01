'use client'

import { useState, useTransition } from 'react'
import { PenLine, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteFoodEntry, updateFoodEntry } from '@/app/actions/food'
import type { FoodEntry } from '@/lib/types'
import type { MacroValues } from '@/components/food/shared'
import { MacroFields } from '@/components/food/macro-fields'
import { cn } from '@/lib/utils'

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
    val != null ? `${(Math.round(val * 10) / 10).toLocaleString('en-US')} ${unit}` : '—'
  const time = new Date(entry.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  if (editing) {
    return (
      <div className="flex flex-col gap-3 px-[22px] py-3 border-t">
        <MacroFields values={macros} onChange={(k, v) => setMacros((p) => ({ ...p, [k]: v }))} idPrefix={`edit-${entry.id}-`} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const isPhoto = entry.source === 'photo'
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] sm:grid-cols-[44px_72px_76px_repeat(4,minmax(0,1fr))_64px] items-center gap-x-3 gap-y-1 px-[22px] py-2.5 border-t text-sm tabular-nums">
      <span
        aria-hidden="true"
        className={cn(
          'row-span-2 sm:row-span-1 size-11 rounded-lg border flex items-center justify-center font-heading text-[0.8rem] font-semibold text-muted-foreground',
          isPhoto ? 'bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,color-mix(in_oklch,var(--muted)_60%,var(--card))_6px_12px)]' : 'bg-muted/50',
        )}
      >
        {isPhoto ? '' : 'M'}
      </span>
      <span className="text-muted-foreground hidden sm:block">{time}</span>
      <span
        className={cn(
          'hidden sm:inline-flex justify-self-start rounded-full px-2.5 py-0.5 text-xs',
          isPhoto ? 'bg-[color-mix(in_oklch,var(--crystal-glow)_14%,transparent)] crystal-ink' : 'bg-muted text-foreground/80',
        )}
      >
        {isPhoto ? 'Photo' : 'Manual'}
      </span>
      <span className="font-medium">{macro(entry.calories, 'kcal')}</span>
      <span className="hidden sm:block">{macro(entry.protein_g, 'g')} P</span>
      <span className="hidden sm:block">{macro(entry.fat_g, 'g')} F</span>
      <span className="hidden sm:block">{macro(entry.carbs_g, 'g')} C</span>
      <div className="flex items-center justify-end gap-0.5 row-span-2 sm:row-span-1">
        <Button size="icon-sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(true)} aria-label="Edit entry">
          <PenLine />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="Delete entry"
        >
          <Trash2 />
        </Button>
      </div>
      <span className="sm:hidden text-xs text-muted-foreground">
        {time} · {macro(entry.protein_g, 'g')} P · {macro(entry.fat_g, 'g')} F · {macro(entry.carbs_g, 'g')} C
      </span>
    </div>
  )
}
