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
import { EntryForm } from '@/components/entry-form'
import type { Module } from '@/lib/types'

interface Props {
  mod: Module
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone: string | null
  /** Fired after a successful log (with the logged values) so the card can update optimistically. */
  onLogged: (logged: { values: Record<string, unknown>; entryDate: string }) => void
  /** The element that opens the modal (the card's primary "Log" action). */
  children: React.ReactNode
}

/**
 * Lightweight quick-log popup for the trackers grid. Reuses the generic
 * EntryForm renderer and the createEntry server action — no second form, no
 * second write path. The date defaults to today (day-boundary aware) and is
 * editable for late logging.
 */
export function QuickLogDialog({ mod, savedTimezone, onLogged, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log to {mod.name}</DialogTitle>
          <DialogDescription>Defaults to today — change the date to log a past day.</DialogDescription>
        </DialogHeader>
        <EntryForm
          moduleId={mod.id}
          fields={mod.fields}
          savedTimezone={savedTimezone}
          submitLabel="Log entry"
          onSuccess={(logged) => {
            setOpen(false)
            onLogged(logged)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
