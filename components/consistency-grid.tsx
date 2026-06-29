'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { GeodeIcon } from '@/components/geode-icon'
import { computeColumnStats } from '@/lib/consistency-grid'
import { getCrystal } from '@/lib/crystals'
import { cn } from '@/lib/utils'
import type { GridData, GridCell, ColumnStats } from '@/lib/consistency-grid'
import type { CrystalKey } from '@/lib/crystals'

/** Geode progression info shown in a tracker's column header. */
export interface ModuleStage {
  /** Current openness (0–1) driving the GeodeIcon. */
  openness: number
  /** Name of the next stage, or null when already at the final stage. */
  nextStageName: string | null
  /** Days of daily logging until the next stage; null when not soon / maxed. */
  daysToNext: number | null
}

interface ConsistencyGridProps {
  gridData: GridData
  today: string
  /** Per-module geode openness + next-stage countdown, keyed by module id. */
  stageByModule: Record<string, ModuleStage>
}

type WindowMode = '90' | 'all'

/** Format a YYYY-MM-DD date as "Jun 28" (UTC, no timezone shift). */
function formatDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

interface CrystalCellProps {
  cell: GridCell
  crystalType: CrystalKey
}

function CrystalCell({ cell, crystalType }: CrystalCellProps) {
  const crystal = getCrystal(cell.crystalOverride ?? crystalType)

  if (cell.state === 'inactive') {
    return <div className="w-8 h-8 rounded-sm mx-auto" aria-label="inactive" />
  }

  if (cell.state === 'not-done') {
    return (
      <div
        className="w-8 h-8 rounded-sm flex items-center justify-center bg-[var(--grid-notdone)] mx-auto"
        aria-label="not done"
      />
    )
  }

  // done — crystal glyph, size scales with intensity
  const size = Math.round(6 + cell.intensity * 8) // 6–14 px
  const glow = cell.intensity > 0.4 ? `0 0 ${Math.round(cell.intensity * 8)}px ${crystal.glow}` : undefined

  const ariaLabel = cell.categoryLabel
    ? `done (${cell.categoryLabel})`
    : cell.rawValue !== undefined
    ? `done (${Math.round(cell.rawValue)})`
    : 'done'

  return (
    <div
      className={cn(
        'w-8 h-8 rounded-sm flex items-center justify-center',
        'bg-[var(--grid-done)]',
        // Light mode: add a subtle ring so done cells pop against the card background
        'ring-1 ring-border/60 dark:ring-0',
        'mx-auto',
      )}
      aria-label={ariaLabel}
    >
      <div
        className="rotate-45 rounded-[2px] transition-all duration-200"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: crystal.primary,
          boxShadow: glow,
        }}
      />
    </div>
  )
}

export function ConsistencyGrid({ gridData, today, stageByModule }: ConsistencyGridProps) {
  const [windowMode, setWindowMode] = useState<WindowMode>('90')

  const { modules, dates, cells } = gridData

  // Slice dates based on the window toggle.
  const visibleCount = windowMode === '90' ? Math.min(90, dates.length) : dates.length
  const visibleDates = useMemo(() => dates.slice(0, visibleCount), [dates, visibleCount])

  // Per-column stats recomputed when window changes.
  const columnStats: ColumnStats[] = useMemo(
    () =>
      modules.map((_, mi) =>
        computeColumnStats(cells[mi].slice(0, visibleCount), visibleDates, today),
      ),
    [modules, cells, visibleDates, visibleCount, today],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Window toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {visibleDates.length} {visibleDates.length === 1 ? 'day' : 'days'}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={windowMode === '90' ? 'default' : 'outline'}
            onClick={() => setWindowMode('90')}
          >
            Last 90 days
          </Button>
          <Button
            size="sm"
            variant={windowMode === 'all' ? 'default' : 'outline'}
            onClick={() => setWindowMode('all')}
          >
            All time
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="border-collapse table-fixed w-full">
          <colgroup>
            <col className="w-[80px]" />
            {modules.map((mod) => (
              <col key={mod.id} />
            ))}
          </colgroup>
          {/* Sticky header row */}
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              {/* Date column header */}
              <th className="text-left py-3 pr-3 pl-3 min-w-[80px] align-top" aria-label="Date" />

              {modules.map((mod, mi) => {
                const stats = columnStats[mi]
                const stage = stageByModule[mod.id]
                const crystal = getCrystal(mod.crystal_type)
                return (
                  <th
                    key={mod.id}
                    className="px-1 pt-2 pb-3 text-center min-w-[3rem] align-top"
                  >
                    <Link
                      href={`/modules/${mod.id}`}
                      className="flex flex-col items-center gap-1 group cursor-pointer"
                      title={mod.name}
                    >
                      {/* The tracker's actual geode, opening with its consistency */}
                      <GeodeIcon
                        crystalType={mod.crystal_type}
                        openness={stage?.openness ?? 0}
                        className="size-10 shrink-0"
                      />
                      {/* Tracker name — truncated, underlines on hover */}
                      <span
                        className="text-[11px] font-medium leading-tight group-hover:underline text-foreground"
                        style={{
                          maxWidth: '56px',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {mod.name}
                      </span>
                      {/* Next-stage countdown (assumes daily logging) */}
                      {stage && (
                        <div className="text-[10px] leading-none font-medium" style={{ color: crystal.primary }}>
                          {stage.nextStageName === null
                            ? 'Bloomed'
                            : stage.daysToNext === null
                              ? `${stage.nextStageName} far off`
                              : `${stage.daysToNext}d to ${stage.nextStageName}`}
                        </div>
                      )}
                      {/* Stats */}
                      <div className="text-[10px] text-muted-foreground leading-snug text-center">
                        {stats.currentStreak > 0 && (
                          <div>{stats.currentStreak}d streak</div>
                        )}
                        <div>{stats.completionPct}%</div>
                        {stats.longestStreak > 0 && (
                          <div className="text-muted-foreground/60">{stats.longestStreak} best</div>
                        )}
                      </div>
                    </Link>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Day rows */}
          <tbody>
            {visibleDates.map((date, di) => {
              const rowCells = modules.map((_, mi) => cells[mi][di])
              const doneCount = rowCells.filter((c) => c.state === 'done').length
              const activeCount = rowCells.filter((c) => c.state !== 'inactive').length

              return (
                <tr
                  key={date}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  {/* Date label */}
                  <td className="py-0.5 pl-3 pr-3 text-left align-middle">
                    <div className="text-xs text-muted-foreground whitespace-nowrap leading-tight">
                      {formatDate(date)}
                    </div>
                    {activeCount > 0 && (
                      <div className="text-[10px] text-muted-foreground/50 leading-none mt-0.5">
                        {doneCount}/{activeCount}
                      </div>
                    )}
                  </td>

                  {/* Cells */}
                  {modules.map((mod, mi) => (
                    <td key={mod.id} className="p-0.5 align-middle">
                      <CrystalCell cell={cells[mi][di]} crystalType={mod.crystal_type} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
