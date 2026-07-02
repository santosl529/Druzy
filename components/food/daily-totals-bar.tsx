'use client'

import type { DailyTotals } from '@/lib/types'

// ----------------------------------------------------------------
// Daily totals bar
// ----------------------------------------------------------------

export function DailyTotalsBar({ totals }: { totals: DailyTotals }) {
  const items = [
    { label: 'Calories', value: Math.round(totals.calories), unit: 'kcal' },
    { label: 'Protein', value: Math.round(totals.protein_g * 10) / 10, unit: 'g' },
    { label: 'Fat', value: Math.round(totals.fat_g * 10) / 10, unit: 'g' },
    { label: 'Carbs', value: Math.round(totals.carbs_g * 10) / 10, unit: 'g' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ label, value, unit }) => (
        <div key={label} className="text-center rounded-lg bg-muted/50 px-3 py-3">
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {label} <span className="text-muted-foreground/60">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
