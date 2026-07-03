'use client'

import type { Entry, ChartConfig, ModuleField } from '@/lib/types'
import { getListData } from '@/lib/chart-data'
import { clientEffectiveTimezone } from '@/lib/date'

interface Props {
  entries: Entry[]
  config: ChartConfig
  fields: ModuleField[]
  timezone?: string | null
}

function fieldLabel(fields: ModuleField[], key: string): string {
  return fields.find((f) => f.key === key)?.label ?? key
}

export function ListChart({ entries, config, fields, timezone }: Props) {
  const displayField = config.displayField ?? config.series[0]?.field
  const secondaryField = config.secondaryField

  if (!displayField) {
    return <p className="text-sm text-muted-foreground py-4">Configure a display field for this list.</p>
  }

  // Client component: unset timezone falls back to the browser tz per the
  // lib/date.ts convention (server falls back to UTC, client to browser tz).
  const data = getListData(entries, config, clientEffectiveTimezone(timezone))

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No entries yet.</p>
  }

  return (
    <div className="divide-y rounded-lg border overflow-hidden">
      {data.map((entry) => {
        const primary = String((entry.values as Record<string, unknown>)[displayField] ?? '—')
        const secondary = secondaryField
          ? String((entry.values as Record<string, unknown>)[secondaryField] ?? '')
          : null

        return (
          <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors">
            <span className="font-medium">{primary}</span>
            <div className="flex items-center gap-3 text-muted-foreground">
              {secondary && <span>{fieldLabel(fields, secondaryField!)}:&nbsp;{secondary}</span>}
              <span className="text-xs">{entry.entry_date}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
