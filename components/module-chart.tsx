'use client'

import {
  getTimeSeries,
  getScatterData,
  getPieData,
  getHistogramData,
  getStackedBarData,
  getCalendarData,
} from '@/lib/chart-data'
import {
  LineChartView,
  BarChartView,
  AreaChartView,
  ScatterChartView,
  PieChartView,
  HistogramView,
  StackedBarView,
  NumberStatView,
} from '@/components/charts/recharts-charts'
import { CalendarHeatmap } from '@/components/charts/calendar-heatmap'
import { ListChart } from '@/components/charts/list-chart'
import { EntryList } from '@/components/entry-list'
import type { Chart, Entry, ModuleField } from '@/lib/types'

interface Props {
  chart: Chart
  entries: Entry[]
  fields: ModuleField[]
}

function NoData() {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
      No data yet — log some entries to see this chart.
    </div>
  )
}

function seriesLabel(chart: Chart, fields: ModuleField[]): string {
  const field = chart.config.series[0]?.field
  if (!field) return ''
  return fields.find((f) => f.key === field)?.label ?? field
}

export function ModuleChart({ chart, entries, fields }: Props) {
  const { config } = chart

  if (entries.length === 0 && config.chartType !== 'list' && config.chartType !== 'table') {
    return <NoData />
  }

  const label = seriesLabel(chart, fields)
  const fillForward = config.fillForward ?? false
  const numericFields = fields.filter((f) => f.type === 'number' || f.type === 'rating')

  switch (config.chartType) {
    case 'line': {
      const data = getTimeSeries(entries, config)
      if (data.length === 0) return <NoData />
      return <LineChartView data={data} label={label} stepAfter={fillForward} />
    }

    case 'bar': {
      const data = getTimeSeries(entries, config)
      if (data.length === 0) return <NoData />
      return <BarChartView data={data} label={label} />
    }

    case 'area': {
      const data = getTimeSeries(entries, config)
      if (data.length === 0) return <NoData />
      return <AreaChartView data={data} label={label} stepAfter={fillForward} />
    }

    case 'scatter': {
      const data = getScatterData(entries, config)
      if (data.length === 0) return <NoData />
      const xLabel = config.xLabel ?? fields.find((f) => f.key === config.series[0]?.field)?.label ?? ''
      const yLabel = config.yLabel ?? fields.find((f) => f.key === config.series[1]?.field)?.label ?? ''
      return <ScatterChartView data={data} xLabel={xLabel} yLabel={yLabel} />
    }

    case 'pie': {
      const data = getPieData(entries, config)
      if (data.length === 0) return <NoData />
      return <PieChartView data={data} />
    }

    case 'histogram': {
      const data = getHistogramData(entries, config)
      if (data.length === 0) return <NoData />
      return <HistogramView data={data} />
    }

    case 'stacked-bar': {
      if (numericFields.length < 2) return <NoData />
      const stackConfig = { ...config, series: numericFields.map((f) => ({ moduleId: chart.module_id, field: f.key })) }
      const data = getStackedBarData(entries, stackConfig, numericFields)
      return <StackedBarView data={data} fields={numericFields} />
    }

    case 'number-stat': {
      const sorted = [...entries].sort(
        (a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at)
      )
      const field = config.series[0]?.field
      const raw = field ? (sorted[0]?.values as Record<string, unknown>)?.[field] : null
      const value = raw != null ? Number(raw) : null
      return <NumberStatView value={isNaN(value as number) ? null : value} label={label} />
    }

    case 'calendar-heatmap': {
      const data = getCalendarData(entries, config)
      return <CalendarHeatmap data={data} />
    }

    case 'heatmap': {
      return (
        <p className="text-sm text-muted-foreground p-4">
          Heatmap requires two categorical fields + a numeric value. Switch to a different chart type or add more fields.
        </p>
      )
    }

    case 'list': {
      return <ListChart entries={entries} config={config} fields={fields} />
    }

    case 'table': {
      return <EntryList moduleId={chart.module_id} fields={fields} entries={entries} />
    }

    default:
      return <NoData />
  }
}
