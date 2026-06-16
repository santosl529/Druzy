'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { markGreenForToday } from '@/app/actions/entries'
import { cn } from '@/lib/utils'
import type { Module } from '@/lib/types'

interface TrackerCardProps {
  mod: Module
  hasEntryToday: boolean
  onMarkDone?: (moduleId: string) => void
}

export function TrackerCard({ mod, hasEntryToday, onMarkDone }: TrackerCardProps) {
  const [isPending, startTransition] = useTransition()
  const isFormula = mod.kind === 'formula'

  function handleMarkGreen(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    // Use the browser's local date (en-CA gives YYYY-MM-DD), matching how entry forms work.
    const today = new Date().toLocaleDateString('en-CA')
    startTransition(async () => {
      const result = await markGreenForToday(mod.id, today)
      if (!result?.error) {
        onMarkDone?.(mod.id)
      }
    })
  }

  return (
    <div className="relative group">
      <Link href={`/modules/${mod.id}`} className="block">
        <Card
          className={cn(
            'h-full transition-colors group-hover:bg-muted/50',
            !isFormula && hasEntryToday && 'border-green-500 bg-green-500/5',
            !isFormula && !hasEntryToday && 'border-red-400 bg-red-500/5',
          )}
        >
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {!isFormula && (
                <span
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    hasEntryToday ? 'bg-green-500' : 'bg-red-400',
                  )}
                />
              )}
              {mod.name}
              {isFormula && (
                <span className="text-[10px] font-medium uppercase tracking-wide rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  Formula
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {isFormula
                ? 'Computed from other trackers'
                : `${mod.fields.length} ${mod.fields.length === 1 ? 'field' : 'fields'}`}
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      {!isFormula && !hasEntryToday && (
        <div className="absolute bottom-3 right-3 z-10">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleMarkGreen}
            disabled={isPending}
          >
            <Check className="w-3 h-3 mr-1" />
            {isPending ? 'Saving…' : 'Mark done'}
          </Button>
        </div>
      )}
    </div>
  )
}
