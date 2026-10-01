'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EntryForm, type EntryDraft } from '@/components/entry-form'
import { GeodeIcon } from '@/components/geode-icon'
import { geodeVars } from '@/lib/geode-style'
import { computeLogPreview } from '@/lib/log-preview'
import { formatDisplayDate } from '@/lib/date'
import type { CardEntry } from '@/lib/card-summary'
import type { Module } from '@/lib/types'

interface Props {
  mod: Module
  openness: number
  /** This module's entries, for the "after this entry" preview (omit to hide it). */
  entries?: CardEntry[]
  /** Pre-selected entry date; defaults to today. */
  initialDate?: string
  /** Today (YYYY-MM-DD) in the user's day-boundary timezone. */
  today: string
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone: string | null
  /** Fired after a successful log (with the logged values) so the card can update optimistically. */
  onLogged: (logged: { values: Record<string, unknown>; entryDate: string }) => void
  /** The element that opens the modal (the card's primary "Log" action). */
  children: React.ReactNode
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

/**
 * Lightweight quick-log popup for the trackers grid. Reuses the generic
 * EntryForm renderer and the createEntry server action — no second form, no
 * second write path. The date defaults to today (day-boundary aware) and is
 * editable for late logging. Tinted with the tracker's crystal.
 */
export function QuickLogDialog({ mod, openness, entries, initialDate, today, savedTimezone, onLogged, children }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<EntryDraft>({})
  const [date, setDate] = useState(initialDate ?? today)

  const preview = entries ? computeLogPreview(mod.fields, entries, date, draft) : []
  const dayLabel = date === today ? 'today' : `on ${formatDisplayDate(date, { month: 'short', day: 'numeric' })}`

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setDraft({})
      setDate(initialDate ?? today)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent
        className="sm:max-w-[520px] gap-5 rounded-2xl bg-card p-6 ring-border shadow-[0_24px_64px_rgba(0,0,0,.5),0_0_40px_color-mix(in_srgb,var(--crystal-glow)_12%,transparent)]"
        style={{
          ...geodeVars(mod.crystal_type, openness),
          '--chip-accent': 'var(--crystal-primary)',
          '--chip-accent-fg': 'white',
        } as React.CSSProperties}
      >
        <DialogHeader className="flex-row items-start gap-3.5 pr-6">
          <GeodeIcon crystalType={mod.crystal_type} openness={openness} className="size-10 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="font-heading text-[1.2rem] font-semibold leading-tight">
              Log to {mod.name}
            </DialogTitle>
            <DialogDescription className="text-[0.8rem]">
              {initialDate && initialDate !== today
                ? `Dated ${formatDisplayDate(initialDate, { month: 'short', day: 'numeric' })}. Pick another day if needed.`
                : 'Defaults to today. Pick an earlier day to log late.'}
            </DialogDescription>
          </div>
        </DialogHeader>
        <EntryForm
          moduleId={mod.id}
          fields={mod.fields}
          savedTimezone={savedTimezone}
          initialDate={initialDate}
          submitLabel="Log entry"
          onCancel={() => setOpen(false)}
          onDraftChange={(d, entryDate) => {
            setDraft(d)
            setDate(entryDate)
          }}
          preview={
            preview.length > 0 && (
              <div className="rounded-[10px] border bg-muted/40 px-3.5 py-3 flex flex-wrap gap-x-7 gap-y-2 text-[0.8rem]">
                {preview.map((p) => (
                  <div key={p.label}>
                    <div className="text-xs text-muted-foreground">
                      {p.label} {dayLabel}
                    </div>
                    <div className="tabular-nums mt-0.5">
                      {fmt(p.before)} <span className="text-muted-foreground">→</span>{' '}
                      <span className="crystal-ink font-semibold">
                        {fmt(p.after)}
                        {p.unit ? ` ${p.unit}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
          onSuccess={(logged) => {
            setOpen(false)
            onLogged(logged)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
