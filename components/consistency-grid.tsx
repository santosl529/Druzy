'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GeodeIcon } from '@/components/geode-icon'
import { QuickLogDialog } from '@/components/quick-log-dialog'
import { computeColumnStats } from '@/lib/consistency-grid'
import { getCrystal } from '@/lib/crystals'
import { formatDisplayDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { GridData, GridCell } from '@/lib/consistency-grid'
import type { Module } from '@/lib/types'

/** Geode progression info shown beside a tracker's row. */
export interface ModuleStage {
  /** Current openness (0–1) driving the GeodeIcon. */
  openness: number
  /** Caption such as "Cracking · 6d to Breaking". */
  line: string
}

interface ConsistencyGridProps {
  gridData: GridData
  today: string
  /** Per-module geode openness + stage caption, keyed by module id. */
  stageByModule: Record<string, ModuleStage>
  /** moduleId → date → one-line summaries of that day's entries (last 90 days). */
  dayEntries: Record<string, Record<string, string[]>>
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone: string | null
}

type CountMode = 'logged' | 'goal'
const WINDOWS = [30, 60, 90] as const
/** Day tooltip width (px). */
const TOOLTIP_WIDTH = 320
type WindowDays = (typeof WINDOWS)[number]

/** Whether a cell counts as done under the chosen counting rule. */
function isDone(cell: GridCell, mode: CountMode): boolean {
  return cell.state === 'done' || (mode === 'logged' && cell.goalMissed === true)
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

/** Short status for a tracker on one day, e.g. "1,862", "Done", "Goal missed". */
function cellValue(cell: GridCell, mode: CountMode): string {
  if (cell.state === 'inactive') return 'Not tracked yet'
  if (cell.goalMissed) return mode === 'logged' ? 'Logged · goal missed' : 'Goal missed'
  if (cell.state === 'not-done') return 'Not logged'
  if (cell.categoryLabel) return cell.categoryLabel
  if (cell.rawValue !== undefined) return fmt(cell.rawValue)
  return 'Done'
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border bg-card p-[3px] text-[0.8rem] font-medium">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Diamond({ color, glow, className }: { color: string; glow?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rotate-45 rounded-[1px]', className)}
      style={{ background: color, boxShadow: glow ? `0 0 6px ${glow}` : undefined }}
    />
  )
}

export function ConsistencyGrid({ gridData, today, stageByModule, dayEntries, savedTimezone }: ConsistencyGridProps) {
  const router = useRouter()
  const { modules, dates, cells } = gridData
  const hasGoals = modules.some((m) => m.dashboard_config?.mode === 'goal' && m.dashboard_config.goal)

  const [windowDays, setWindowDays] = useState<WindowDays>(90)
  const [countMode, setCountMode] = useState<CountMode>('logged')
  // Hovered day: index into `cols` plus where its tooltip sits in the card.
  const [hover, setHover] = useState<{ col: number; left: number } | null>(null)
  // Day opened in the side panel (index into `cols`).
  const [selected, setSelected] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Visible window, oldest → today (gridData is newest-first).
  const n = Math.min(windowDays, dates.length)
  const cols = useMemo(() => dates.slice(0, n).reverse(), [dates, n])
  // cellAt(mi, ci): the cell for module mi on cols[ci].
  const cellAt = (mi: number, ci: number) => cells[mi][n - 1 - ci]

  const stats = useMemo(
    () =>
      modules.map((_, mi) => {
        const window = cells[mi].slice(0, n).map((c): GridCell =>
          isDone(c, countMode) ? { ...c, state: 'done' } : c,
        )
        return computeColumnStats(window, dates.slice(0, n), today)
      }),
    [modules, cells, dates, n, countMode, today],
  )

  // Trackers done per day, for the bar strip under the timeline.
  const dayTotals = cols.map((_, ci) => {
    let done = 0
    let active = 0
    modules.forEach((_, mi) => {
      const c = cellAt(mi, ci)
      if (c.state === 'inactive') return
      active++
      if (isDone(c, countMode)) done++
    })
    return { done, active }
  })

  // Month labels: one per run of same-month dates.
  const months: { label: string; start: number; span: number }[] = []
  cols.forEach((d, ci) => {
    const key = d.slice(0, 7)
    const last = months[months.length - 1]
    if (last && cols[last.start].slice(0, 7) === key) last.span++
    else months.push({ label: formatDisplayDate(d, { month: 'short' }), start: ci, span: 1 })
  })

  const gridCols = { gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }
  const gap = cols.length > 60 ? '2px' : '3px'

  // The tooltip sits beside the hovered tick, covering half of the next day's
  // tick so that half stays visible (and hoverable) in the gap. It flips to
  // the left of the tick when there's no room on the right.
  function onCellEnter(ci: number, e: React.MouseEvent<HTMLElement>) {
    const el = cardRef.current
    if (!el) return
    const card = el.getBoundingClientRect()
    const cell = e.currentTarget.getBoundingClientRect()
    const offset = parseFloat(gap) + cell.width / 2
    const cellLeft = cell.left - card.left + el.scrollLeft
    const cellRight = cellLeft + cell.width
    const visibleRight = el.scrollLeft + el.clientWidth
    let left = cellRight + offset
    if (left + TOOLTIP_WIDTH > visibleRight - 8) left = cellLeft - offset - TOOLTIP_WIDTH
    setHover({ col: ci, left: Math.max(el.scrollLeft + 8, left) })
  }

  useEffect(() => {
    if (selected === null) return
    function onKey(e: KeyboardEvent) {
      // Leave keys to the quick-log dialog while it's open over the panel.
      if (document.querySelector('[data-slot="dialog-content"]')) return
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'ArrowLeft') setSelected((s) => (s === null ? s : Math.max(0, s - 1)))
      if (e.key === 'ArrowRight') setSelected((s) => (s === null ? s : Math.min(cols.length - 1, s + 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, cols.length])

  // Rows shown in the tooltip and the day panel for one day.
  function dayRows(ci: number) {
    const date = cols[ci]
    return modules.map((mod, mi) => {
      const cell = cellAt(mi, ci)
      const crystal = getCrystal(cell.crystalOverride ?? mod.crystal_type)
      return { mod, cell, crystal, done: isDone(cell, countMode), entries: dayEntries[mod.id]?.[date] ?? [] }
    })
  }

  const rowLayout = 'grid grid-cols-[150px_minmax(0,1fr)_48px] md:grid-cols-[230px_minmax(0,1fr)_64px] gap-3 md:gap-[18px]'

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Consistency</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Last {cols.length} days · all trackers in one view
          </p>
        </div>
        <div className="flex flex-col gap-2.5 lg:items-end">
          <div className="flex flex-wrap items-center gap-2.5 text-[0.8rem]">
            {hasGoals && (
              <>
                <span className="text-muted-foreground">Count a day as done when</span>
                <Segmented
                  label="Count a day as done when"
                  value={countMode}
                  onChange={setCountMode}
                  options={[
                    { value: 'logged', label: 'Anything is logged' },
                    { value: 'goal', label: 'The goal is met' },
                  ]}
                />
              </>
            )}
            <Segmented
              label="Window"
              value={windowDays}
              onChange={setWindowDays}
              options={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[2px] bg-primary" />
              {countMode === 'goal' ? 'Goal met' : 'Logged'}
            </span>
            {hasGoals && countMode === 'goal' && (
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-[2px] shadow-[inset_0_0_0_1px_var(--primary)]" />
                Logged, goal missed
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[2px] bg-[var(--grid-notdone)] shadow-[inset_0_0_0_1px_var(--border)]" />
              Missed
            </span>
            <span>· click a day to open it</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={cardRef}
        className="relative rounded-2xl border bg-card overflow-x-auto"
        onMouseLeave={() => setHover(null)}
      >
        <div className="min-w-[720px] px-6 pt-5 pb-[22px] flex flex-col gap-3">
          <div className={cn(rowLayout, 'items-end')}>
            <div />
            <div className="grid" style={{ ...gridCols, gap }}>
              {months.map((m) => (
                <div
                  key={m.start}
                  className="text-[11px] text-muted-foreground border-l border-foreground/15 pl-1.5 whitespace-nowrap overflow-hidden"
                  style={{ gridColumn: `${m.start + 1} / span ${m.span}` }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground text-right">Done</div>
          </div>

          {modules.map((mod, mi) => {
            const stage = stageByModule[mod.id]
            const s = stats[mi]
            return (
              <div key={mod.id} className={cn(rowLayout, 'items-center')}>
                <Link href={`/modules/${mod.id}`} className="group flex items-center gap-3 min-w-0">
                  <GeodeIcon crystalType={mod.crystal_type} openness={stage?.openness ?? 0} className="size-[34px] shrink-0" />
                  <div className="min-w-0">
                    <div className="font-heading text-[0.95rem] font-semibold leading-tight truncate group-hover:underline">
                      {mod.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.currentStreak}d streak · best {s.longestStreak}d
                    </div>
                  </div>
                </Link>
                <div className="grid h-[30px]" style={{ ...gridCols, gap }}>
                  {cols.map((date, ci) => (
                    <TimelineCell
                      key={date}
                      cell={cellAt(mi, ci)}
                      mod={mod}
                      mode={countMode}
                      highlighted={hover?.col === ci || selected === ci}
                      onEnter={(e) => onCellEnter(ci, e)}
                      onClick={() => setSelected(ci)}
                      label={`${mod.name}, ${formatDisplayDate(date, { month: 'short', day: 'numeric' })}: ${cellValue(cellAt(mi, ci), countMode)}`}
                    />
                  ))}
                </div>
                <div
                  className="crystal-ink font-heading text-[1.05rem] font-semibold text-right"
                  style={{ '--crystal-primary': getCrystal(mod.crystal_type).primary, '--crystal-glow': getCrystal(mod.crystal_type).glow } as React.CSSProperties}
                >
                  {s.completionPct}%
                </div>
              </div>
            )
          })}

          <div className={cn(rowLayout, 'items-end border-t pt-3 mt-1')}>
            <div className="text-xs text-muted-foreground">Trackers done per day</div>
            <div className="grid h-10 items-end" style={{ ...gridCols, gap }}>
              {dayTotals.map((t, ci) => (
                <button
                  key={cols[ci]}
                  type="button"
                  aria-label={`${formatDisplayDate(cols[ci], { month: 'short', day: 'numeric' })}: ${t.done} of ${t.active} done`}
                  onMouseEnter={(e) => onCellEnter(ci, e)}
                  onClick={() => setSelected(ci)}
                  className={cn(
                    'rounded-t-[2px] min-h-[3px] transition-colors',
                    cols[ci] === today ? 'bg-primary' : 'bg-primary/45 hover:bg-primary/70',
                  )}
                  style={{ height: `${t.active ? Math.max(8, (t.done / t.active) * 100) : 8}%` }}
                />
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
              today {dayTotals[dayTotals.length - 1]?.done ?? 0}/{dayTotals[dayTotals.length - 1]?.active ?? 0}
            </div>
          </div>
        </div>

        {/* Hover tooltip */}
        {hover && selected === null && (
          <DayTooltip
            date={cols[hover.col]}
            left={hover.left}
            rows={dayRows(hover.col)}
            mode={countMode}
          />
        )}
      </div>

      {/* Day panel */}
      {selected !== null && (
        <DayPanel
          date={cols[selected]}
          today={today}
          rows={dayRows(selected)}
          mode={countMode}
          stageByModule={stageByModule}
          savedTimezone={savedTimezone}
          canPrev={selected > 0}
          canNext={selected < cols.length - 1}
          onPrev={() => setSelected(selected - 1)}
          onNext={() => setSelected(selected + 1)}
          onClose={() => setSelected(null)}
          onLogged={() => router.refresh()}
        />
      )}
    </div>
  )
}

function TimelineCell({
  cell,
  mod,
  mode,
  highlighted,
  onEnter,
  onClick,
  label,
}: {
  cell: GridCell
  mod: Module
  mode: CountMode
  highlighted: boolean
  onEnter: (e: React.MouseEvent<HTMLElement>) => void
  onClick: () => void
  label: string
}) {
  const crystal = getCrystal(cell.crystalOverride ?? mod.crystal_type)
  const done = isDone(cell, mode)
  // Gradient cells fade with their value; everything else that's done is solid.
  const strength = cell.rawValue !== undefined ? 0.35 + cell.intensity * 0.65 : 1

  let style: React.CSSProperties
  if (cell.state === 'inactive') style = {}
  else if (done)
    style = {
      background: `color-mix(in oklch, ${crystal.primary} ${Math.round(strength * 100)}%, transparent)`,
      boxShadow: cell.rawValue !== undefined && cell.intensity > 0.8 ? `0 0 8px ${crystal.glow}` : undefined,
    }
  else if (cell.goalMissed) style = { boxShadow: `inset 0 0 0 1px ${crystal.primary}` }
  else style = { background: 'var(--grid-notdone)' }

  return (
    <button
      type="button"
      aria-label={label}
      onMouseEnter={onEnter}
      onFocus={(e) => onEnter(e as unknown as React.MouseEvent<HTMLElement>)}
      onClick={onClick}
      className={cn(
        'rounded-[2px] outline-none transition-[filter] focus-visible:ring-2 focus-visible:ring-ring',
        highlighted && 'ring-1 ring-foreground/60 brightness-125',
      )}
      style={style}
    />
  )
}

type DayRow = {
  mod: Module
  cell: GridCell
  crystal: { primary: string; glow: string }
  done: boolean
  entries: string[]
}

function DayTooltip({
  date,
  left,
  rows,
  mode,
}: {
  date: string
  left: number
  rows: DayRow[]
  mode: CountMode
}) {
  const active = rows.filter((r) => r.cell.state !== 'inactive')
  const done = active.filter((r) => r.done).length
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 w-[var(--tooltip-w)] rounded-xl border border-foreground/15 bg-popover/95 backdrop-blur px-4 py-3.5 shadow-[0_16px_40px_rgba(0,0,0,.45)] flex flex-col gap-2.5 text-[0.8rem]"
      style={{ left, '--tooltip-w': `${TOOLTIP_WIDTH}px` } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-heading text-[0.95rem] font-semibold">
            {formatDisplayDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {done} of {active.length} done
          </div>
        </div>
        <div className="flex gap-1.5">
          {rows.map((r) => (
            <Diamond key={r.mod.id} color={r.done ? r.crystal.primary : 'var(--grid-notdone)'} />
          ))}
        </div>
      </div>
      <div className="flex flex-col border-t">
        {rows.map((r) => (
          <div key={r.mod.id} className={cn('flex gap-2.5 py-2 border-b border-border/60 last:border-0', !r.done && 'opacity-55')}>
            <Diamond color={r.crystal.primary} className="mt-1.5" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2">
                <span className="font-semibold truncate">{r.mod.name}</span>
                <span className="font-medium shrink-0" style={{ color: r.done ? r.crystal.glow : undefined }}>
                  {cellValue(r.cell, mode)}
                </span>
              </div>
              {r.entries[0] && <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.entries[0]}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="font-mono text-[11px] text-muted-foreground">click to open this day</div>
    </div>
  )
}

function DayPanel({
  date,
  today,
  rows,
  mode,
  stageByModule,
  savedTimezone,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onClose,
  onLogged,
}: {
  date: string
  today: string
  rows: DayRow[]
  mode: CountMode
  stageByModule: Record<string, ModuleStage>
  savedTimezone: string | null
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onLogged: () => void
}) {
  const active = rows.filter((r) => r.cell.state !== 'inactive')
  const done = active.filter((r) => r.done).length
  const short = formatDisplayDate(date, { month: 'short', day: 'numeric' })

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Entries for ${short}`}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[420px] bg-card border-l border-foreground/15 shadow-[-24px_0_48px_rgba(0,0,0,.45)] flex flex-col">
        <div className="px-[22px] pt-5 pb-4 flex items-start gap-3 border-b">
          <div className="flex-1">
            <h2 className="font-heading text-xl font-semibold leading-tight">
              {formatDisplayDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <p className="text-[0.8rem] text-muted-foreground mt-1">
              {done} of {active.length} trackers done
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon-sm" onClick={onPrev} disabled={!canPrev} aria-label="Previous day">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={onNext} disabled={!canNext} aria-label="Next day">
              <ChevronRight />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {rows.map((r) => {
            const canLog = r.mod.kind !== 'formula' && r.cell.state !== 'inactive'
            return (
              <div
                key={r.mod.id}
                className={cn('px-[22px] py-4 border-b flex flex-col gap-2', !r.done && r.entries.length === 0 && 'opacity-70')}
              >
                <div className="flex items-center gap-2.5">
                  <Diamond color={r.crystal.primary} glow={r.done ? r.crystal.glow : undefined} className="size-[9px]" />
                  <Link href={`/modules/${r.mod.id}`} className="font-heading text-[0.95rem] font-semibold flex-1 truncate hover:underline">
                    {r.mod.name}
                  </Link>
                  <span
                    className="text-xs font-medium rounded-full px-2.5 py-0.5 shrink-0"
                    style={
                      r.done
                        ? { background: `color-mix(in oklch, ${r.crystal.primary} 22%, transparent)`, color: r.crystal.glow }
                        : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {cellValue(r.cell, mode)}
                  </span>
                </div>
                {r.entries.map((text, i) => (
                  <div key={i} className="ml-[19px] rounded-lg border bg-background px-2.5 py-2 text-[0.8rem] flex justify-between gap-2.5">
                    <span className="min-w-0 break-words">{text}</span>
                    <Link
                      href={`/modules/${r.mod.id}`}
                      aria-label={`Edit in ${r.mod.name}`}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Pencil className="size-3.5" />
                    </Link>
                  </div>
                ))}
                {canLog && (
                  <QuickLogDialog
                    mod={r.mod}
                    openness={stageByModule[r.mod.id]?.openness ?? 0}
                    initialDate={date}
                    today={today}
                    savedTimezone={savedTimezone}
                    onLogged={onLogged}
                  >
                    <button
                      type="button"
                      className="ml-[19px] self-start inline-flex items-center gap-1 rounded-lg border border-dashed border-primary/60 px-3 py-1.5 text-[0.8rem] font-medium text-accent-text hover:bg-primary/10"
                    >
                      <Plus className="size-3.5" />
                      {r.entries.length > 0 ? `Log another for ${short}` : `Log for ${short}`}
                    </button>
                  </QuickLogDialog>
                )}
              </div>
            )
          })}
        </div>

        {date !== today && (
          <div className="px-[22px] py-3 border-t bg-muted/40 text-xs text-muted-foreground text-pretty">
            Entries added here are dated {short}, not today, so streaks and charts count them on the right day.
          </div>
        )}
      </div>
    </div>
  )
}
