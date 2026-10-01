'use client'

import { useState } from 'react'
import { addDaysISO, formatDisplayDate } from '@/lib/date'
import { cn } from '@/lib/utils'

interface Props {
  /** Today (YYYY-MM-DD) in the user's day-boundary timezone. */
  today: string
  /** The selected date (YYYY-MM-DD). */
  value: string
  onChange: (date: string) => void
  /** Optional form field name; renders a hidden input carrying the value. */
  name?: string
  className?: string
}

const chipBase =
  'inline-flex items-center rounded-full border px-3 py-1.5 text-[0.8rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
// Selected chips take the surrounding accent: --chip-accent (and --chip-accent-ink
// for the label) when a parent sets them, otherwise the app's violet.
const chipOn =
  'border-[var(--chip-accent,var(--primary))] bg-[color-mix(in_oklch,var(--chip-accent,var(--primary))_20%,transparent)] text-[var(--chip-accent-ink,var(--foreground))]'
const chipOff = 'border-border text-foreground/80 hover:text-foreground hover:bg-muted/60'

/**
 * Today / Yesterday / Pick date… chips for choosing an entry date. Picking a
 * custom date swaps the last chip for a native date input.
 */
export function DateChips({ today, value, onChange, name, className }: Props) {
  const yesterday = addDaysISO(today, -1)
  const isCustom = value !== today && value !== yesterday
  const [picking, setPicking] = useState(isCustom)

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label="Entry date">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        aria-pressed={value === today}
        className={cn(chipBase, value === today ? chipOn : chipOff)}
        onClick={() => { setPicking(false); onChange(today) }}
      >
        Today · {formatDisplayDate(today, { month: 'short', day: 'numeric' })}
      </button>
      <button
        type="button"
        aria-pressed={value === yesterday}
        className={cn(chipBase, value === yesterday ? chipOn : chipOff)}
        onClick={() => { setPicking(false); onChange(yesterday) }}
      >
        Yesterday
      </button>
      {picking ? (
        <input
          type="date"
          aria-label="Pick a date"
          value={value}
          max={today}
          autoFocus={!isCustom}
          onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
          className={cn(chipBase, isCustom ? chipOn : chipOff, 'py-1 bg-transparent [color-scheme:light] dark:[color-scheme:dark]')}
        />
      ) : (
        <button type="button" className={cn(chipBase, chipOff)} onClick={() => setPicking(true)}>
          Pick date…
        </button>
      )}
    </div>
  )
}
