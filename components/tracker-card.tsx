'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GeodeIcon } from '@/components/geode-icon'
import { geodeVars } from '@/lib/geode-style'
import { markGreenForToday } from '@/app/actions/entries'
import { cn } from '@/lib/utils'
import type { Module } from '@/lib/types'

interface TrackerCardProps {
  mod: Module
  hasEntryToday: boolean
  /** Today's date (YYYY-MM-DD) resolved in the user's day-boundary timezone. */
  today: string
  openness: number
  onMarkDone?: (moduleId: string) => void
}

export function TrackerCard({ mod, hasEntryToday, today, openness, onMarkDone }: TrackerCardProps) {
  const [isPending, startTransition] = useTransition()
  const isFormula = mod.kind === 'formula'

  function handleMarkGreen(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      const result = await markGreenForToday(mod.id, today)
      if (!result?.error) onMarkDone?.(mod.id)
    })
  }

  return (
    <div className="relative group">
      <Link href={`/modules/${mod.id}`} className="block">
        <Card
          className="h-full transition-shadow group-hover:shadow-md [--card-spacing:1.2rem]"
          style={{
            ...geodeVars(mod.crystal_type, openness),
            borderColor:
              'color-mix(in oklch, var(--stone-border), var(--crystal-primary) calc(var(--openness) * 100%))',
            boxShadow:
              '0 0 24px color-mix(in srgb, var(--crystal-glow) calc(var(--openness) * 45%), transparent)',
          }}
        >
          <CardHeader className="flex flex-row items-start gap-3.5">
            <GeodeIcon crystalType={mod.crystal_type} openness={openness} className="size-12 shrink-0" />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-[1.2rem] flex items-center gap-2.5">
                <span className="truncate">{mod.name}</span>
                {isFormula && (
                  <span className="text-xs font-medium uppercase tracking-wide rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground shrink-0">
                    Formula
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-[1.05rem]">
                {isFormula
                  ? 'Computed from other trackers'
                  : `${mod.fields.length} ${mod.fields.length === 1 ? 'field' : 'fields'}`}
              </CardDescription>
            </div>

            {/* Today status pill — only for loggable (non-formula) trackers */}
            {!isFormula && (
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  hasEntryToday
                    ? 'text-background'
                    : 'border border-border text-muted-foreground',
                )}
                style={
                  hasEntryToday
                    ? { backgroundColor: 'var(--crystal-primary)' }
                    : undefined
                }
              >
                {hasEntryToday ? <Check className="size-3.5" /> : null}
                {hasEntryToday ? 'Logged' : 'Today'}
              </span>
            )}
          </CardHeader>
        </Card>
      </Link>

      {!isFormula && !hasEntryToday && (
        <div className="absolute bottom-3.5 right-3.5 z-10">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2.5 text-[0.9rem] sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={handleMarkGreen}
            disabled={isPending}
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            {isPending ? 'Saving…' : 'Mark done'}
          </Button>
        </div>
      )}
    </div>
  )
}
