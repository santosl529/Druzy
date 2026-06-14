'use client'

import { TrendingDownIcon, TrendingUpIcon, MinusIcon, ActivityIcon } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
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
    <div className="grid grid-cols-3 gap-3 text-center">
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
      <div className="grid grid-cols-3 gap-3 text-center">
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
  const strengthColor =
    result.strength === 'strong'
      ? 'text-green-600'
      : result.strength === 'moderate'
        ? 'text-amber-600'
        : 'text-muted-foreground'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">{labels.moduleA} · {labels.fieldA}</p>
          <p className="text-xs text-muted-foreground">{labels.moduleB} · {labels.fieldB}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold tabular-nums ${strengthColor}`}>
            {result.coefficient > 0 ? '+' : ''}{result.coefficient}
          </p>
          <p className="text-xs text-muted-foreground">Pearson r</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Strength" value={result.strength} />
        <Stat label="Direction" value={result.direction} />
        <Stat label="Paired days" value={String(result.count)} />
      </div>
    </div>
  )
}

function StreakStats({ result }: { result: StreakResult }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-center">
      <Stat label="Current streak" value={`${result.currentStreak}d`} highlight />
      <Stat label="Longest streak" value={`${result.longestStreak}d`} />
      <Stat label="Days logged" value={String(result.totalDaysLogged)} />
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-2">
      <p className={`text-sm font-semibold tabular-nums ${highlight ? 'text-primary' : ''}`}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
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
  return (
    <div className="rounded-lg border bg-card shadow-sm w-full max-w-2xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ActivityIcon className="size-4 text-indigo-500 shrink-0" />
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Analytics insight
        </p>
        <Badge variant="secondary" className="ml-auto text-xs">
          {OPERATION_LABELS[operation] ?? operation}
        </Badge>
      </div>

      {/* Context label */}
      <div className="text-sm font-medium">
        {operation === 'correlation' ? (
          <span>
            {labels.moduleA} · {labels.fieldA}
            {labels.unitA ? ` (${labels.unitA})` : ''} vs.{' '}
            {labels.moduleB} · {labels.fieldB}
            {labels.unitB ? ` (${labels.unitB})` : ''}
          </span>
        ) : (
          <span>
            {labels.moduleA} · {labels.fieldA}
            {labels.unitA ? ` (${labels.unitA})` : ''}
          </span>
        )}
      </div>

      <Separator />

      {/* Stats */}
      {result.operation === 'summary' && (
        <SummaryStats result={result} labels={labels} />
      )}
      {result.operation === 'trend' && (
        <TrendStats result={result} labels={labels} />
      )}
      {result.operation === 'correlation' && (
        <CorrelationStats result={result} labels={labels} />
      )}
      {result.operation === 'streak' && (
        <StreakStats result={result} />
      )}
    </div>
  )
}
