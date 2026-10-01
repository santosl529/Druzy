'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { computeGlanceTiles, type GlanceRange, type GlanceTile } from '@/lib/glance'
import { cn } from '@/lib/utils'
import type { CardEntry } from '@/lib/card-summary'
import type { Module } from '@/lib/types'

const RANGES: { value: GlanceRange; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 'all', label: 'All time' },
]

interface Props {
  mod: Module
  entries: CardEntry[]
  /** Today (YYYY-MM-DD) in the user's day-boundary timezone. */
  today: string
}

/**
 * "At a glance" stat tiles. Clicking a tile expands it in place (bigger chart
 * + facts) while the others shrink to chips; the row height never changes.
 * Expects --crystal-primary / --crystal-glow in scope.
 */
export function GlanceTiles({ mod, entries, today }: Props) {
  const [range, setRange] = useState<GlanceRange>(30)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const tiles = useMemo(() => computeGlanceTiles(mod, entries, today, range), [mod, entries, today, range])

  useEffect(() => {
    if (!openKey) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openKey])

  if (entries.length === 0) return null
  const open = tiles.find((t) => t.key === openKey) ?? null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-[0.95rem] font-semibold">
          At a glance
          <span className="font-sans text-xs font-normal text-muted-foreground ml-2.5 hidden sm:inline">
            Click a tile to expand · Esc to close
          </span>
        </h2>
        <div role="group" aria-label="Range" className="flex rounded-lg border bg-card p-[3px] text-[0.8rem] font-medium">
          {RANGES.map((r) => (
            <button
              key={String(r.value)}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                'rounded-md px-3 py-1 transition-colors',
                range === r.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:flex md:h-[172px]">
        {tiles.map((t, i) => {
          const isOpen = open?.key === t.key
          const isChip = open !== null && !isOpen
          return (
            <div
              key={t.key}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setOpenKey(isOpen ? null : t.key)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
                e.preventDefault()
                setOpenKey(isOpen ? null : t.key)
              }}
              className={cn(
                'group min-w-0 cursor-pointer rounded-xl border bg-card px-[18px] py-4 text-left overflow-hidden flex gap-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                'transition-[flex,border-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.3,1)] hover:border-[color-mix(in_oklch,var(--border),var(--primary)_45%)]',
                isOpen && 'col-span-2 border-primary/70 shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_14%,transparent)]',
              )}
              style={{ flex: isOpen ? 3.4 : isChip ? 0.6 : 1 }}
            >
              <TileSummary tile={t} accent={i === 0} open={isOpen} chip={isChip} />
              {isOpen && <TileDetail tile={t} moduleId={mod.id} range={range} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TileSummary({ tile, accent, open, chip }: { tile: GlanceTile; accent: boolean; open: boolean; chip: boolean }) {
  return (
    <div className={cn('flex flex-col min-w-0 h-full', open ? 'flex-1 md:max-w-[220px]' : 'flex-1')}>
      <div className="text-xs text-muted-foreground truncate">{chip ? tile.short : tile.label}</div>
      <div
        className={cn(
          'font-heading font-semibold mt-0.5 whitespace-nowrap',
          chip ? 'text-xl' : 'text-[1.6rem] leading-tight',
          accent && 'crystal-ink',
        )}
      >
        {tile.value}{' '}
        {!chip && tile.unit && <span className="font-sans text-[0.8rem] font-normal text-muted-foreground">{tile.unit}</span>}
      </div>
      {open && tile.delta && (
        <span className="self-start mt-1.5 text-xs font-medium rounded-full px-2 py-0.5 bg-primary/20 text-accent-text whitespace-nowrap">
          {tile.delta}
        </span>
      )}
      {!open && !chip && <Bars bars={tile.bars} className="mt-auto h-10 gap-px pt-3" />}
      {chip && <span className="mt-auto text-xs text-muted-foreground hidden md:block">Click to expand</span>}
    </div>
  )
}

function TileDetail({ tile, moduleId, range }: { tile: GlanceTile; moduleId: string; range: GlanceRange }) {
  return (
    <>
      <div className="hidden md:flex flex-[1.3] min-w-0 flex-col gap-1.5">
        <div className="flex justify-end">
          <Link
            href={`/modules/${moduleId}/charts/new`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-accent-text hover:underline"
          >
            Open as chart →
          </Link>
        </div>
        <Bars bars={tile.bars} goalLine={tile.goalLine} className="flex-1 gap-0.5" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{range === 'all' ? 'First entry' : `${range} days ago`}</span>
          <span>Today</span>
        </div>
      </div>
      <div className="hidden md:flex flex-1 min-w-0 flex-col justify-center border-l pl-5">
        {tile.facts.map((f) => (
          <div key={f.k} className="flex flex-col gap-px py-1.5">
            <span className="text-xs text-muted-foreground">{f.k}</span>
            <span className="text-sm tabular-nums truncate">{f.v}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Bars({ bars, goalLine, className }: { bars: (number | null)[]; goalLine?: number; className?: string }) {
  return (
    <div className={cn('relative flex items-end', className)} aria-hidden="true">
      {goalLine !== undefined && (
        <div
          className="absolute inset-x-0 border-t border-dashed"
          style={{ bottom: `${goalLine * 100}%`, borderColor: 'color-mix(in srgb, var(--crystal-glow) 60%, transparent)' }}
        />
      )}
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[2px]"
          style={{
            height: b === null ? '3px' : `${Math.max(4, b * 100)}%`,
            background: b === null ? 'var(--grid-notdone)' : 'var(--crystal-primary)',
            opacity: b === null ? 1 : 0.55 + b * 0.45,
          }}
        />
      ))}
    </div>
  )
}
