'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GeodeIcon } from '@/components/geode-icon'
import { QuickLogDialog } from '@/components/quick-log-dialog'
import { geodeVars } from '@/lib/geode-style'
import { getBinaryField } from '@/lib/card'
import { computeCardSummary, resolveCardConfig, type CardEntry } from '@/lib/card-summary'
import { cn } from '@/lib/utils'
import { setBinaryToday } from '@/app/actions/entries'
import type { Module, CardSummaryMode, CardTimeWindow } from '@/lib/types'

/** A successful log, carrying the parsed values so the card can update optimistically. */
export type LoggedEntry = { values: Record<string, unknown>; entryDate: string }

interface TrackerCardProps {
  mod: Module
  hasEntryToday: boolean
  /** This module's entries (window filtering happens at compute time). */
  entries: CardEntry[]
  /** Today's date (YYYY-MM-DD) resolved in the user's day-boundary timezone. */
  today: string
  openness: number
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone: string | null
  /** Mark this tracker as logged today (optimistic), carrying the logged values. */
  onLogged: (moduleId: string, logged: LoggedEntry) => void
  /** Mark this tracker as not-logged today (optimistic; binary unmark). */
  onUnlogged: (moduleId: string) => void
}

const MODE_LABEL: Record<CardSummaryMode, string> = {
  sum: 'Total',
  avg: 'Avg',
  min: 'Min',
  max: 'Max',
  median: 'Median',
  count: 'Count',
  latest: 'Latest',
}

const WINDOW_LABEL: Record<CardTimeWindow, string> = {
  today: 'today',
  week: 'this week',
  all: 'all time',
}

export function TrackerCard({
  mod,
  hasEntryToday,
  entries,
  today,
  openness,
  savedTimezone,
  onLogged,
  onUnlogged,
}: TrackerCardProps) {
  const [isPending, startTransition] = useTransition()
  const isFormula = mod.kind === 'formula'
  const binaryField = getBinaryField(mod)

  const summary = computeCardSummary(mod, entries, today)
  const cfg = resolveCardConfig(mod)
  const summaryField = mod.fields.find((f) => f.key === cfg.field)
  // A binary tracker's toggle already conveys its state, so only show a separate
  // summary value there when the user has configured a non-default one.
  const showSummary = !isFormula && (!binaryField || mod.card_config !== null)

  const fieldLabel = summaryField?.label ?? cfg.field
  const caption =
    cfg.mode === 'count'
      ? `Entries · ${WINDOW_LABEL[cfg.timeWindow]}`
      : cfg.mode === 'latest'
        ? `Latest ${fieldLabel} · ${WINDOW_LABEL[cfg.timeWindow]}`
        : `${MODE_LABEL[cfg.mode]} ${fieldLabel} · ${WINDOW_LABEL[cfg.timeWindow]}`

  function handleToggle() {
    const next = !hasEntryToday
    const logged: LoggedEntry = { values: { [binaryField!.key]: true }, entryDate: today }
    // Optimistic flip; revert on error.
    if (next) onLogged(mod.id, logged)
    else onUnlogged(mod.id)
    startTransition(async () => {
      const result = await setBinaryToday(mod.id, binaryField!.key, today, next)
      if (result?.error) {
        if (next) onUnlogged(mod.id)
        else onLogged(mod.id, logged)
      }
    })
  }

  return (
    <Card
      className="h-full transition-shadow hover:shadow-md [--card-spacing:1.2rem]"
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
            <Link href={`/modules/${mod.id}`} className="truncate hover:underline">
              {mod.name}
            </Link>
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

        {/* Secondary affordance: open the full tracker page. */}
        <Link
          href={`/modules/${mod.id}`}
          aria-label={`Open ${mod.name}`}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="size-5" />
        </Link>
      </CardHeader>

      {/* Card summary value + primary logging action. Binary trackers get a
          one-tap toggle; everything else opens the reused entry-form modal.
          Formula trackers can't be logged. */}
      {!isFormula && (
        <CardContent className="space-y-3">
          {showSummary && (
            <div>
              <div
                className={cn(
                  'font-semibold tabular-nums leading-tight',
                  summary.empty ? 'text-lg text-muted-foreground' : 'text-2xl',
                )}
                style={summary.empty ? undefined : { color: 'var(--crystal-primary)' }}
              >
                {summary.text}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{caption}</p>
            </div>
          )}

          {binaryField ? (
            <Button
              className="w-full"
              onClick={handleToggle}
              disabled={isPending}
              style={
                hasEntryToday
                  ? { backgroundColor: 'var(--crystal-primary)', color: 'var(--background)' }
                  : undefined
              }
            >
              {hasEntryToday ? 'Logged' : 'Log'}
            </Button>
          ) : (
            <QuickLogDialog
              mod={mod}
              savedTimezone={savedTimezone}
              onLogged={(logged) => onLogged(mod.id, logged)}
            >
              <Button
                className="w-full"
                style={
                  hasEntryToday
                    ? { backgroundColor: 'var(--crystal-primary)', color: 'var(--background)' }
                    : undefined
                }
              >
                {hasEntryToday ? 'Logged' : 'Log'}
              </Button>
            </QuickLogDialog>
          )}
        </CardContent>
      )}
    </Card>
  )
}
