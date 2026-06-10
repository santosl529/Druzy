'use client'

import { useMemo } from 'react'

interface Props {
  data: Record<string, number>
  weeks?: number
}

const DAYS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Return today as a local YYYY-MM-DD string (never UTC, avoids timezone flipping)
function localToday(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Add days to a YYYY-MM-DD string using UTC arithmetic to avoid DST skips
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function getIntensity(value: number, max: number): number {
  if (max === 0 || value === 0) return 0
  return Math.ceil((value / max) * 4)
}

export function CalendarHeatmap({ data, weeks = 52 }: Props) {
  const { grid, monthLabels, maxValue } = useMemo(() => {
    const todayStr = localToday()

    // Align to the most recent Sunday using UTC arithmetic
    const todayUTC = new Date(todayStr + 'T00:00:00Z')
    const dayOfWeek = todayUTC.getUTCDay() // 0=Sun
    const startStr = addDays(todayStr, -(dayOfWeek + (weeks - 1) * 7))

    const totalDays = weeks * 7
    const days: Array<{ date: string; value: number; inFuture: boolean }> = []

    for (let i = 0; i < totalDays; i++) {
      const dateStr = addDays(startStr, i)
      days.push({
        date: dateStr,
        value: data[dateStr] ?? 0,
        inFuture: dateStr > todayStr,
      })
    }

    // Group into columns (weeks), each column = 7 days
    const cols: typeof days[number][][] = []
    for (let w = 0; w < weeks; w++) {
      cols.push(days.slice(w * 7, w * 7 + 7))
    }

    // Month labels: for each week column, if the first day of the month falls in it
    const labels: Array<{ label: string; col: number }> = []
    let lastMonth = -1
    cols.forEach((col, colIdx) => {
      // Parse as UTC so getUTCMonth() matches the date string exactly
      const firstDay = new Date(col[0].date + 'T00:00:00Z')
      const month = firstDay.getUTCMonth()
      if (month !== lastMonth) {
        labels.push({ label: MONTHS[month], col: colIdx })
        lastMonth = month
      }
    })

    const max = Math.max(0, ...Object.values(data))

    return { grid: cols, monthLabels: labels, maxValue: max }
  }, [data, weeks])

  const CELL = 13
  const GAP = 2

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-0.5 min-w-0">
        {/* Month labels */}
        <div className="flex" style={{ marginLeft: 24 }}>
          {Array.from({ length: grid.length }, (_, i) => {
            const label = monthLabels.find((m) => m.col === i)
            return (
              <div
                key={i}
                style={{ width: CELL + GAP, flexShrink: 0 }}
                className="text-[10px] text-muted-foreground"
              >
                {label?.label ?? ''}
              </div>
            )
          })}
        </div>

        {/* Grid rows = days of week */}
        <div className="flex gap-0.5">
          {/* Day labels */}
          <div className="flex flex-col" style={{ gap: GAP, marginRight: GAP }}>
            {DAYS.map((d, i) => (
              <div
                key={i}
                style={{ height: CELL, width: 18, flexShrink: 0 }}
                className="text-[10px] text-muted-foreground flex items-center justify-end pr-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Week columns */}
          {grid.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col" style={{ gap: GAP }}>
              {col.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.value}`}
                  style={{ width: CELL, height: CELL, flexShrink: 0 }}
                  className={`rounded-sm transition-colors ${
                    day.inFuture
                      ? 'bg-muted/30'
                      : day.value === 0
                      ? 'bg-muted'
                      : getIntensity(day.value, maxValue) >= 4
                      ? 'bg-primary'
                      : getIntensity(day.value, maxValue) === 3
                      ? 'bg-primary/70'
                      : getIntensity(day.value, maxValue) === 2
                      ? 'bg-primary/45'
                      : 'bg-primary/25'
                  }`}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1 mt-2 ml-6">
          <span className="text-[10px] text-muted-foreground mr-1">Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              style={{ width: CELL, height: CELL }}
              className={`rounded-sm ${
                level === 0
                  ? 'bg-muted'
                  : level === 1
                  ? 'bg-primary/25'
                  : level === 2
                  ? 'bg-primary/45'
                  : level === 3
                  ? 'bg-primary/70'
                  : 'bg-primary'
              }`}
            />
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">More</span>
        </div>
      </div>
    </div>
  )
}
