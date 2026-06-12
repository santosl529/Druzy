'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type {
  TimeSeriesPoint,
  ScatterPoint,
  PieSlice,
  HistogramBin,
  StackedBarPoint,
  MultiSeriesRow,
  SeriesMeta,
} from '@/lib/chart-data'
import type { ModuleField } from '@/lib/types'

const COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
]

const CHART_HEIGHT = 300

function ChartWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      {children as React.ReactElement}
    </ResponsiveContainer>
  )
}

export function LineChartView({ data, label, stepAfter }: { data: TimeSeriesPoint[]; label: string; stepAfter?: boolean }) {
  return (
    <ChartWrapper>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line type={stepAfter ? 'stepAfter' : 'linear'} dataKey="value" name={label} dot={!stepAfter && data.length < 40} stroke={COLORS[0]} strokeWidth={2} />
      </LineChart>
    </ChartWrapper>
  )
}

export function BarChartView({ data, label }: { data: TimeSeriesPoint[]; label: string }) {
  return (
    <ChartWrapper>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" name={label} fill={COLORS[0]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartWrapper>
  )
}

export function AreaChartView({ data, label, stepAfter }: { data: TimeSeriesPoint[]; label: string; stepAfter?: boolean }) {
  return (
    <ChartWrapper>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Area
          type={stepAfter ? 'stepAfter' : 'linear'}
          dataKey="value"
          name={label}
          stroke={COLORS[0]}
          fill={COLORS[0]}
          fillOpacity={0.2}
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ChartWrapper>
  )
}

export function ScatterChartView({
  data,
  xLabel,
  yLabel,
}: {
  data: ScatterPoint[]
  xLabel: string
  yLabel: string
}) {
  return (
    <ChartWrapper>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="x" name={xLabel} tick={{ fontSize: 11 }} />
        <YAxis dataKey="y" name={yLabel} tick={{ fontSize: 11 }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data} fill={COLORS[0]} />
      </ScatterChart>
    </ChartWrapper>
  )
}

export function PieChartView({ data }: { data: PieSlice[] }) {
  return (
    <ChartWrapper>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ChartWrapper>
  )
}

export function HistogramView({ data }: { data: HistogramBin[] }) {
  return (
    <ChartWrapper>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="range" tick={{ fontSize: 10 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" name="Count" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartWrapper>
  )
}

export function StackedBarView({
  data,
  fields,
}: {
  data: StackedBarPoint[]
  fields: ModuleField[]
}) {
  return (
    <ChartWrapper>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {fields.map((f, i) => (
          <Bar key={f.key} dataKey={f.key} name={f.label} stackId="a" fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ChartWrapper>
  )
}

export function MultiSeriesChartView({
  rows,
  series,
  variant,
  stepAfter,
  showPoints,
  showGrid = true,
  showLegend,
  yLabel,
  yRightLabel,
}: {
  rows: MultiSeriesRow[]
  series: SeriesMeta[]
  variant: 'line' | 'bar' | 'area'
  stepAfter?: boolean
  showPoints?: boolean
  showGrid?: boolean
  showLegend?: boolean
  yLabel?: string
  yRightLabel?: string
}) {
  const hasRightAxis = series.some((s) => s.yAxis === 'right')
  const legend = showLegend ?? series.length > 1
  const curveType = stepAfter ? 'stepAfter' : 'linear'

  const axes = (
    <>
      {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
      <YAxis
        yAxisId="left"
        tick={{ fontSize: 11 }}
        label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 11 } } : undefined}
      />
      {hasRightAxis && (
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          label={yRightLabel ? { value: yRightLabel, angle: 90, position: 'insideRight', style: { fontSize: 11 } } : undefined}
        />
      )}
      <Tooltip />
      {legend && <Legend />}
    </>
  )

  if (variant === 'bar') {
    return (
      <ChartWrapper>
        <BarChart data={rows}>
          {axes}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              yAxisId={s.yAxis}
              fill={s.color}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartWrapper>
    )
  }

  if (variant === 'area') {
    return (
      <ChartWrapper>
        <AreaChart data={rows}>
          {axes}
          {series.map((s) => (
            <Area
              key={s.key}
              type={curveType}
              dataKey={s.key}
              name={s.name}
              yAxisId={s.yAxis}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.2}
              strokeWidth={2}
              dot={showPoints ?? false}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ChartWrapper>
    )
  }

  return (
    <ChartWrapper>
      <LineChart data={rows}>
        {axes}
        {series.map((s) => (
          <Line
            key={s.key}
            type={curveType}
            dataKey={s.key}
            name={s.name}
            yAxisId={s.yAxis}
            stroke={s.color}
            strokeWidth={2}
            dot={showPoints ?? rows.length < 40}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ChartWrapper>
  )
}

export function NumberStatView({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[200px] gap-1">
      <span className="text-6xl font-bold tabular-nums">
        {value !== null ? value : '—'}
      </span>
      <span className="text-sm text-muted-foreground">{label} (latest)</span>
    </div>
  )
}
