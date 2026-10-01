'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { ChevronRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GeodeIcon } from '@/components/geode-icon'
import { QuickLogDialog } from '@/components/quick-log-dialog'
import { geodeVars } from '@/lib/geode-style'
import { getBinaryField } from '@/lib/card'
import { STAGES } from '@/lib/stages'
import { computeCardSummaries, type CardEntry } from '@/lib/card-summary'
import { cn } from '@/lib/utils'
import { setBinaryToday } from '@/app/actions/entries'
import type { Module } from '@/lib/types'

/** A successful log, carrying the parsed values so the card can update optimistically. */
export type LoggedEntry = { values: Record<string, unknown>; entryDate: string }

/** The geode's current stage (0–4) and its one-line caption, e.g. "Cracking · 6d to Breaking". */
export type CardStage = { index: number; line: string }

interface TrackerCardProps {
  mod: Module
  hasEntryToday: boolean
  /** This module's entries (window filtering happens at compute time). */
  entries: CardEntry[]
  /** Today's date (YYYY-MM-DD) resolved in the user's day-boundary timezone. */
  today: string
  openness: number
  stage?: CardStage
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone: string | null
  /** Mark this tracker as logged today (optimistic), carrying the logged values. */
  onLogged: (moduleId: string, logged: LoggedEntry) => void
  /** Mark this tracker as not-logged today (optimistic; binary unmark). */
  onUnlogged: (moduleId: string) => void
}

export function TrackerCard({
  mod,
  hasEntryToday,
  entries,
  today,
  openness,
  stage,
  savedTimezone,
  onLogged,
  onUnlogged,
}: TrackerCardProps) {
  const [isPending, startTransition] = useTransition()
  const isFormula = mod.kind === 'formula'
  const binaryField = getBinaryField(mod)

  const summaries = computeCardSummaries(mod, entries, today)

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

  const logButtonClass = cn(
    'w-full h-9 transition-all duration-200',
    hasEntryToday
      ? 'border-0 text-white'
      : 'bg-black/5 hover:bg-black/10 border border-black/10 text-foreground dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:border-white/[0.14]',
  )
  const logButtonStyle = hasEntryToday ? { backgroundColor: 'var(--crystal-primary)' } : undefined
  const logButtonLabel = hasEntryToday ? <><Check className="size-3.5" />Logged</> : 'Log'

  return (
    <div
      className="relative h-full min-h-[212px] rounded-2xl border bg-card text-card-foreground p-5 flex flex-col gap-4 transition-shadow"
      style={{
        ...geodeVars(mod.crystal_type, openness),
        borderColor:
          'color-mix(in oklch, var(--stone-border), var(--crystal-primary) calc(var(--openness) * 100%))',
        boxShadow:
          '0 0 24px color-mix(in srgb, var(--crystal-glow) calc(var(--openness) * 45%), transparent)',
      }}
    >
      <div className="flex items-start gap-3.5">
        <GeodeIcon crystalType={mod.crystal_type} openness={openness} className="size-12 shrink-0 -ml-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-[1.2rem] font-semibold leading-tight flex items-center gap-2.5">
            <Link href={`/modules/${mod.id}`} className="truncate hover:underline">
              {mod.name}
            </Link>
            {isFormula && (
              <span className="font-sans text-[0.7rem] font-medium uppercase tracking-wide rounded-full bg-muted px-2 py-0.5 text-muted-foreground shrink-0">
                Formula
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isFormula
              ? 'Computed from other trackers'
              : `${mod.fields.length} ${mod.fields.length === 1 ? 'field' : 'fields'}`}
          </p>
          {stage && (
            <p className="crystal-ink text-xs font-medium mt-0.5 truncate">
              {stage.line}
            </p>
          )}
        </div>

        {/* Secondary affordance: open the full tracker page. */}
        <Link
          href={`/modules/${mod.id}`}
          aria-label={`Open ${mod.name}`}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="size-5" />
        </Link>
      </div>

      {/* Stage bar: one segment per geode stage, lit up to the current one. */}
      {stage && (
        <div className="flex gap-[3px] -mt-1" aria-hidden="true">
          {STAGES.map((s, i) => (
            <div
              key={s.name}
              className="flex-1 h-[3px] rounded-full"
              style={{ background: i <= stage.index ? 'var(--crystal-primary)' : 'var(--border)' }}
            />
          ))}
        </div>
      )}

      {/* Summary values fill the body; the logging action is pinned to the
          bottom so every card shares the same vertical rhythm. Formula
          trackers can't be logged. */}
      {!isFormula && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {summaries.map((s, i) => (
              <div key={i} className="min-w-0">
                <div
                  className={cn(
                    'font-semibold tabular-nums leading-tight truncate',
                    s.empty ? 'text-base text-muted-foreground' : 'crystal-ink text-xl',
                  )}
                >
                  {s.text}
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            {binaryField ? (
              <Button className={logButtonClass} onClick={handleToggle} disabled={isPending} style={logButtonStyle}>
                {logButtonLabel}
              </Button>
            ) : (
              <QuickLogDialog
                mod={mod}
                openness={openness}
                entries={entries}
                today={today}
                savedTimezone={savedTimezone}
                onLogged={(logged) => onLogged(mod.id, logged)}
              >
                <Button className={logButtonClass} style={logButtonStyle}>
                  {logButtonLabel}
                </Button>
              </QuickLogDialog>
            )}
          </div>
        </>
      )}
    </div>
  )
}
