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

type YDomain = [number | 'auto', number | 'auto' | string]

// ----------------------------------------------------------------
// Smart Y-axis domain
// ----------------------------------------------------------------

/**
 * Compute the Y domain to pass to Recharts <YAxis domain={...}>.
 *
 * Auto-scaling rules (applied when overrides are absent):
 *  - bar / area  → zero-baseline: [0, 'auto']. Recharts' 'auto' upper bound
 *    already picks a nice round number, so we only pin the lower bound.
 *  - line / scatter → fit-to-data with ~10% headroom. We compute bounds
 *    from the values ourselves because Recharts' default domain without
 *    a hint fits too tightly (no padding) or starts at 0 (wrong for e.g.
 *    body weight 150–160). Edge cases: no data, single point, all-identical
 *    → fall back to ±1 around the value so the axis is never degenerate.
 *    We then pass a formatter function that lets Recharts snap ticks to
 *    nice numbers within our range.
 *
 * Manual overrides (yAxisMin / yAxisMax) always take precedence.
 * zeroBaseline=true forces zero-baseline on any chart type;
 * zeroBaseline=false suppresses it on bar/area (use fit-to-data instead).
 */
function computeYDomain(
  values: number[],
  chartKind: 'zero-baseline' | 'fit-to-data',
  overrideMin: number | undefined,
  overrideMax: number | undefined
): YDomain {
  // Both overrides supplied — use them directly.
  if (overrideMin !== undefined && overrideMax !== undefined) {
    return [overrideMin, overrideMax]
  }

  if (chartKind === 'zero-baseline') {
    // Lower bound is always 0 (or the override).
    // Upper: if override given use it; otherwise let Recharts 'auto' pick a
    // nice ceiling. This also correctly handles empty data.
    return [overrideMin ?? 0, overrideMax ?? 'auto']
  }

  // Fit-to-data with padding.
  const finite = values.filter(Number.isFinite)

  if (finite.length === 0) {
    // No data: return a unit range centred on 0 unless overrides present.
    return [overrideMin ?? -1, overrideMax ?? 1]
  }

  const dataMin = Math.min(...finite)
  const dataMax = Math.max(...finite)

  if (dataMin === dataMax) {
    // All-identical (or single point): pad by 1 in each direction.
    const v = dataMin
    return [overrideMin ?? v - 1, overrideMax ?? v + 1]
  }

  const span = dataMax - dataMin
  const pad = span * 0.1

  // Round outward to keep ticks on nice numbers.
  const rawLo = dataMin - pad
  const rawHi = dataMax + pad

  // Choose a "nice" step based on the padded span, then snap bounds outward.
  const paddedSpan = rawHi - rawLo
  const magnitude = Math.pow(10, Math.floor(Math.log10(paddedSpan / 5)))
  const niceStep = [1, 2, 2.5, 5, 10]
    .map((f) => f * magnitude)
    .find((s) => paddedSpan / s <= 8) ?? magnitude

  const lo = Math.floor(rawLo / niceStep) * niceStep
  const hi = Math.ceil(rawHi / niceStep) * niceStep

  return [overrideMin ?? lo, overrideMax ?? hi]
}

/** Extract all numeric values from a time series for domain calculation. */
function valuesFrom(data: TimeSeriesPoint[]): number[] {
  return data.map((p) => p.value)
}
/** Extract values for a named key from multi-series rows. */
function valuesFromRows(rows: MultiSeriesRow[], key: string): number[] {
  return rows.flatMap((r) => {
    const v = r[key]
    return typeof v === 'number' ? [v] : []
  })
}

const yAxisLabelProps = (label: string | undefined) =>
  label ? { value: label, angle: -90, position: 'insideLeft' as const, style: { fontSize: 11 } } : undefined

export function LineChartView({
  data, label, yLabel, stepAfter, yAxisMin, yAxisMax, zeroBaseline,
}: {
  data: TimeSeriesPoint[]
  label: string
  yLabel?: string
  stepAfter?: boolean
  yAxisMin?: number
  yAxisMax?: number
  zeroBaseline?: boolean
}) {
  const kind = zeroBaseline === true ? 'zero-baseline' : 'fit-to-data'
  const domain = computeYDomain(valuesFrom(data), kind, yAxisMin, yAxisMax)
  return (
    <ChartWrapper>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={domain} label={yAxisLabelProps(yLabel)} />
        <Tooltip />
        <Line type={stepAfter ? 'stepAfter' : 'linear'} dataKey="value" name={label} dot={!stepAfter && data.length < 40} stroke={COLORS[0]} strokeWidth={2} />
      </LineChart>
    </ChartWrapper>
  )
}

export function BarChartView({
  data, label, yLabel, yAxisMin, yAxisMax, zeroBaseline,
}: {
  data: TimeSeriesPoint[]
  label: string
  yLabel?: string
  yAxisMin?: number
  yAxisMax?: number
  zeroBaseline?: boolean
}) {
  const kind = zeroBaseline === false ? 'fit-to-data' : 'zero-baseline'
  const domain = computeYDomain(valuesFrom(data), kind, yAxisMin, yAxisMax)
  return (
    <ChartWrapper>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={domain} label={yAxisLabelProps(yLabel)} />
        <Tooltip />
        <Bar dataKey="value" name={label} fill={COLORS[0]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartWrapper>
  )
}

export function AreaChartView({
  data, label, yLabel, stepAfter, yAxisMin, yAxisMax, zeroBaseline,
}: {
  data: TimeSeriesPoint[]
  label: string
  yLabel?: string
  stepAfter?: boolean
  yAxisMin?: number
  yAxisMax?: number
  zeroBaseline?: boolean
}) {
  const kind = zeroBaseline === false ? 'fit-to-data' : 'zero-baseline'
  const domain = computeYDomain(valuesFrom(data), kind, yAxisMin, yAxisMax)
  return (
    <ChartWrapper>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={domain} label={yAxisLabelProps(yLabel)} />
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
  yAxisMin,
  yAxisMax,
}: {
  data: ScatterPoint[]
  xLabel: string
  yLabel: string
  yAxisMin?: number
  yAxisMax?: number
}) {
  const yDomainVal = computeYDomain(data.map((p) => p.y), 'fit-to-data', yAxisMin, yAxisMax)
  return (
    <ChartWrapper>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="x" name={xLabel} tick={{ fontSize: 11 }} />
        <YAxis dataKey="y" name={yLabel} tick={{ fontSize: 11 }} domain={yDomainVal} />
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
  yAxisMin,
  yAxisMax,
  yRightAxisMin,
  yRightAxisMax,
  zeroBaseline,
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
  yAxisMin?: number
  yAxisMax?: number
  yRightAxisMin?: number
  yRightAxisMax?: number
  zeroBaseline?: boolean
}) {
  const hasRightAxis = series.some((s) => s.yAxis === 'right')
  const legend = showLegend ?? series.length > 1
  const curveType = stepAfter ? 'stepAfter' : 'linear'

  // Apply the same type-driven auto-scaling per axis independently.
  const defaultKind = variant === 'line'
    ? 'fit-to-data'
    : zeroBaseline === false ? 'fit-to-data' : 'zero-baseline'

  const leftKeys = series.filter((s) => s.yAxis !== 'right').map((s) => s.key)
  const rightKeys = series.filter((s) => s.yAxis === 'right').map((s) => s.key)

  const leftValues = leftKeys.flatMap((k) => valuesFromRows(rows, k))
  const rightValues = rightKeys.flatMap((k) => valuesFromRows(rows, k))

  const leftDomain = computeYDomain(leftValues, defaultKind, yAxisMin, yAxisMax)
  const rightDomain = computeYDomain(rightValues, defaultKind, yRightAxisMin, yRightAxisMax)

  const axes = (
    <>
      {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
      <YAxis
        yAxisId="left"
        tick={{ fontSize: 11 }}
        domain={leftDomain}
        label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 11 } } : undefined}
      />
      {hasRightAxis && (
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          domain={rightDomain}
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
