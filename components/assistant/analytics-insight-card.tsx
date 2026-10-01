'use client'

import { TrendingDownIcon, TrendingUpIcon, MinusIcon } from 'lucide-react'
import type {
  SummaryResult,
  TrendResult,
  CorrelationResult,
  StreakResult,
  AnalyticsResult,
} from '@/lib/analytics'

interface Labels {
  moduleA: string
  fieldA: string
  unitA?: string
  moduleB?: string
  fieldB?: string
  unitB?: string
}

interface Props {
  operation: string
  result: AnalyticsResult
  labels: Labels
}

function fmt(n: number, decimals = 1): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

function withUnit(n: number, unit?: string, decimals = 1): string {
  return unit ? `${fmt(n, decimals)} ${unit}` : fmt(n, decimals)
}

// ----------------------------------------------------------------
// Sub-renderers per operation
// ----------------------------------------------------------------

function SummaryStats({ result, labels }: { result: SummaryResult; labels: Labels }) {
  const u = labels.unitA
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Stat label="Average" value={withUnit(result.avg, u)} />
      <Stat label="Total" value={withUnit(result.total, u)} />
      <Stat label="Entries" value={String(result.count)} />
      <Stat label="Min" value={withUnit(result.min, u)} />
      <Stat label="Max" value={withUnit(result.max, u)} />
      <Stat label="Std dev" value={withUnit(result.stdDev, u)} />
    </div>
  )
}

function TrendStats({ result, labels }: { result: TrendResult; labels: Labels }) {
  const u = labels.unitA
  const Icon =
    result.direction === 'up'
      ? TrendingUpIcon
      : result.direction === 'down'
        ? TrendingDownIcon
        : MinusIcon
  const dirColor =
    result.direction === 'up'
      ? 'text-green-600'
      : result.direction === 'down'
        ? 'text-red-500'
        : 'text-muted-foreground'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`size-5 ${dirColor}`} />
        <span className={`text-sm font-medium ${dirColor}`}>
          {result.direction === 'flat'
            ? 'Flat — no significant change'
            : result.direction === 'up'
              ? 'Trending up'
              : 'Trending down'}
        </span>
        {result.percentChange !== null && (
          <span className="text-xs text-muted-foreground ml-auto">
            {result.percentChange > 0 ? '+' : ''}{result.percentChange}% overall
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="First" value={result.firstValue !== null ? withUnit(result.firstValue, u) : '—'} />
        <Stat label="Last" value={result.lastValue !== null ? withUnit(result.lastValue, u) : '—'} />
        <Stat label="Entries" value={String(result.count)} />
      </div>
    </div>
  )
}

function CorrelationStats({
  result,
  labels,
}: {
  result: CorrelationResult
  labels: Labels
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Stat
        label="Pearson r"
        value={`${result.coefficient > 0 ? '+' : ''}${result.coefficient}`}
        sub={`${result.strength} correlation`}
        highlight
      />
      <Stat label="Days with both" value={String(result.count)} sub={`${labels.fieldA} and ${labels.fieldB}`} />
      <Stat label="Direction" value={result.direction} />
    </div>
  )
}

function StreakStats({ result }: { result: StreakResult }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Stat label="Current streak" value={`${result.currentStreak}d`} highlight />
      <Stat label="Longest streak" value={`${result.longestStreak}d`} />
      <Stat label="Days logged" value={String(result.totalDaysLogged)} />
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3.5 py-3 min-w-0">
      <p className="text-xs text-muted-foreground truncate">{label}</p>
      <p className={`font-heading text-2xl font-semibold tabular-nums truncate ${highlight ? 'text-accent-text' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
    </div>
  )
}

// ----------------------------------------------------------------
// Main card
// ----------------------------------------------------------------

const OPERATION_LABELS: Record<string, string> = {
  summary: 'Summary',
  trend: 'Trend',
  correlation: 'Correlation',
  streak: 'Streak',
}

export function AnalyticsInsightCard({ operation, result, labels }: Props) {
  const title =
    operation === 'correlation'
      ? `${labels.fieldA} vs. ${labels.fieldB}`
      : `${labels.moduleA} · ${labels.fieldA}${labels.unitA ? ` (${labels.unitA})` : ''}`
  return (
    <div className="w-full rounded-2xl border bg-card px-[22px] py-5 flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-[0.95rem] font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground shrink-0 lowercase">
          {OPERATION_LABELS[operation] ?? operation}
        </span>
      </div>

      {result.operation === 'summary' && <SummaryStats result={result} labels={labels} />}
      {result.operation === 'trend' && <TrendStats result={result} labels={labels} />}
      {result.operation === 'correlation' && <CorrelationStats result={result} labels={labels} />}
      {result.operation === 'streak' && <StreakStats result={result} />}

      <p className="text-xs text-muted-foreground">
        Druzy calculated these numbers from your entries; the assistant received only these results.
      </p>
    </div>
  )
}
