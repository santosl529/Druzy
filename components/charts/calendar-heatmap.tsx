'use client'

import { useMemo } from 'react'
import { clientEffectiveTimezone, todayInTimezone, isoDate, addDaysISO } from '@/lib/date'

interface Props {
  data: Record<string, number>
  /** How many calendar months to show (ending today). */
  months?: number
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  timezone?: string | null
}

const DAYS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


function getIntensity(value: number, max: number): number {
  if (max === 0 || value === 0) return 0
  return Math.ceil((value / max) * 4)
}

export function CalendarHeatmap({ data, months = 5, timezone }: Props) {
  const { grid, monthLabels, maxValue } = useMemo(() => {
    const todayStr = todayInTimezone(clientEffectiveTimezone(timezone))
    const todayUTC = new Date(todayStr + 'T00:00:00Z')

    // First day of the month `months - 1` months ago
    const startMonthYear = todayUTC.getUTCFullYear()
    const startMonthIdx = todayUTC.getUTCMonth() - (months - 1)
    const firstOfStartMonth = new Date(Date.UTC(startMonthYear, startMonthIdx, 1))
    const firstOfStartStr = isoDate(firstOfStartMonth)

    // Walk back to the preceding Sunday so the grid aligns on week boundaries
    const startDayOfWeek = firstOfStartMonth.getUTCDay() // 0=Sun
    const startStr = addDaysISO(firstOfStartStr, -startDayOfWeek)

    // Total days from that Sunday through today's Sunday + rest of week
    const todayDayOfWeek = todayUTC.getUTCDay()
    const endStr = addDaysISO(todayStr, 6 - todayDayOfWeek) // end of today's week
    const msPerDay = 86400000
    const totalDays =
      Math.round((new Date(endStr + 'T00:00:00Z').getTime() - new Date(startStr + 'T00:00:00Z').getTime()) / msPerDay) + 1
    const weeks = Math.ceil(totalDays / 7)
    const days: Array<{ date: string; value: number; inFuture: boolean }> = []

    for (let i = 0; i < totalDays; i++) {
      const dateStr = addDaysISO(startStr, i)
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
  }, [data, months, timezone])

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
