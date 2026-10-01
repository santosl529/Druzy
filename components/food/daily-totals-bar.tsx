'use client'

import type { DailyTotals } from '@/lib/types'

// ----------------------------------------------------------------
// Daily totals tiles
// ----------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

/**
 * The day's calories and macros as stat tiles. Each macro's bar shows its
 * share of the day's calories (4 kcal/g protein and carbs, 9 kcal/g fat).
 * Expects --crystal-primary / --crystal-glow in scope.
 */
export function DailyTotalsBar({ totals, entryCount }: { totals: DailyTotals; entryCount: number }) {
  const cal = totals.calories
  const share = (kcal: number) => (cal > 0 ? Math.min(100, Math.round((kcal / cal) * 100)) : 0)
  const items = [
    { label: 'Protein', value: totals.protein_g, pct: share(totals.protein_g * 4), color: 'var(--crystal-glow)' },
    { label: 'Fat', value: totals.fat_g, pct: share(totals.fat_g * 9), color: 'color-mix(in oklch, var(--muted-foreground) 70%, var(--card))' },
    { label: 'Carbs', value: totals.carbs_g, pct: share(totals.carbs_g * 4), color: 'color-mix(in oklch, var(--crystal-primary) 70%, var(--card))' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-xl border bg-card px-4 py-3.5 flex flex-col gap-2">
        <div className="text-xs text-muted-foreground">Calories</div>
        <div className="crystal-ink font-heading text-[1.6rem] font-semibold leading-tight tabular-nums">
          {fmt(Math.round(cal))} <span className="font-sans text-sm font-normal text-muted-foreground">kcal</span>
        </div>
        <div className="h-1 rounded-full" style={{ background: entryCount ? 'var(--crystal-primary)' : 'var(--border)' }} />
        <div className="text-xs text-muted-foreground">
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
        </div>
      </div>
      {items.map(({ label, value, pct, color }) => (
        <div key={label} className="rounded-xl border bg-card px-4 py-3.5 flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-heading text-[1.6rem] font-semibold leading-tight tabular-nums">
            {fmt(Math.round(value * 10) / 10)} <span className="font-sans text-sm font-normal text-muted-foreground">g</span>
          </div>
          <div className="h-1 rounded-full bg-border">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </div>
          <div className="text-xs text-muted-foreground">{cal > 0 ? `${pct}% of calories` : '—'}</div>
        </div>
      ))}
    </div>
  )
}
