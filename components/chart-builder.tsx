'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createChart, updateChart } from '@/app/actions/charts'
import { CHART_TYPES } from '@/lib/types'
import type { Chart, ChartConfig, ChartSeries, ChartType, Module, ModuleField, ReferenceLine } from '@/lib/types'

const TIME_SERIES_TYPES: ChartType[] = ['line', 'bar', 'area', 'histogram', 'stacked-bar']
const AXIS_TYPES: ChartType[] = ['line', 'bar', 'area', 'scatter', 'histogram', 'stacked-bar']
const FILL_FORWARD_TYPES: ChartType[] = ['line', 'bar', 'area']
/** Chart types that support 2+ series, possibly from different modules. */
const MULTI_SERIES_TYPES: ChartType[] = ['line', 'bar', 'area']

const DATE_RANGE_OPTIONS = [
  { value: 'all',         label: 'All time' },
  { value: 'last_7',     label: 'Last 7 days' },
  { value: 'last_30',    label: 'Last 30 days' },
  { value: 'last_90',    label: 'Last 90 days' },
  { value: 'last_365',   label: 'Last 365 days' },
]

interface Props {
  moduleId: string
  fields: ModuleField[]
  /** All of the user's modules, for cross-module series. */
  modules: Module[]
  initial?: Chart
}

interface SeriesRow {
  moduleId: string
  field: string
  label: string
  yAxis: 'left' | 'right'
}

function toDateRangeValue(config: ChartConfig): string {
  const dr = config.dateRange
  if (!dr || dr.type === 'all') return 'all'
  if (dr.type === 'last_n_days') return `last_${dr.n}`
  return 'all'
}

function fromDateRangeValue(val: string): ChartConfig['dateRange'] {
  if (val === 'all' || !val) return { type: 'all' }
  const match = val.match(/^last_(\d+)$/)
  if (match) return { type: 'last_n_days', n: parseInt(match[1]) }
  return { type: 'all' }
}

export function ChartBuilder({ moduleId, fields, modules, initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const initConfig = initial?.config ?? {
    chartType: 'line' as ChartType,
    series: [{ moduleId, field: fields[0]?.key ?? '' }],
  }

  const [chartType, setChartType] = useState<ChartType>(initConfig.chartType)
  const [title, setTitle] = useState(initConfig.title ?? '')
  const [field, setField] = useState(initConfig.series[0]?.field ?? fields[0]?.key ?? '')
  const [seriesRows, setSeriesRows] = useState<SeriesRow[]>(() =>
    initConfig.series.length > 0
      ? initConfig.series.map((s) => ({
          moduleId: s.moduleId,
          field: s.field,
          label: s.label ?? '',
          yAxis: s.yAxis ?? 'left',
        }))
      : [{ moduleId, field: fields[0]?.key ?? '', label: '', yAxis: 'left' }]
  )
  const [scatterYField, setScatterYField] = useState(initConfig.series[1]?.field ?? '')
  const [displayField, setDisplayField] = useState(initConfig.displayField ?? fields[0]?.key ?? '')
  const [secondaryField, setSecondaryField] = useState(initConfig.secondaryField ?? '')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initConfig.sort?.direction ?? 'desc')
  const [dateRangeVal, setDateRangeVal] = useState(toDateRangeValue(initConfig))
  const [bucketBy, setBucketBy] = useState<'none' | 'day' | 'week' | 'month' | 'year'>(initConfig.bucketBy ?? 'none')
  const [aggregation, setAggregation] = useState<'none' | 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median'>(initConfig.aggregation ?? 'none')
  const [fillForward, setFillForward] = useState(initConfig.fillForward ?? false)
  const [showGrid, setShowGrid] = useState(initConfig.showGrid ?? true)
  const [showLegend, setShowLegend] = useState(initConfig.showLegend ?? false)
  const [showPoints, setShowPoints] = useState(initConfig.showPoints ?? false)
  const [xLabel, setXLabel] = useState(initConfig.xLabel ?? '')
  const [yLabel, setYLabel] = useState(initConfig.yLabel ?? '')
  const [refLines, setRefLines] = useState<ReferenceLine[]>(initConfig.referenceLines ?? [])

  const numericFields = fields.filter((f) => f.type === 'number' || f.type === 'rating')
  const textFields = fields.filter((f) => f.type === 'text' || f.type === 'select' || f.type === 'boolean')
  const allFields = fields

  function numericFieldsFor(modId: string): ModuleField[] {
    const mod = modules.find((m) => m.id === modId)
    return (mod?.fields ?? []).filter((f) => f.type === 'number' || f.type === 'rating')
  }

  function updateSeriesRow(i: number, patch: Partial<SeriesRow>) {
    setSeriesRows((rows) => {
      const next = [...rows]
      next[i] = { ...next[i], ...patch }
      // Switching module invalidates the field selection.
      if (patch.moduleId !== undefined && patch.moduleId !== rows[i].moduleId) {
        next[i].field = numericFieldsFor(patch.moduleId)[0]?.key ?? ''
      }
      return next
    })
  }

  function buildSeries(): ChartSeries[] {
    return seriesRows.map((row) => ({
      moduleId: row.moduleId,
      field: row.field,
      label: row.label.trim() || undefined,
      yAxis: row.yAxis === 'right' ? 'right' as const : undefined,
    }))
  }

  function buildConfig(): ChartConfig {
    const base: ChartConfig = {
      chartType,
      title: title.trim() || undefined,
      series: chartType === 'scatter'
        ? [{ moduleId, field }, { moduleId, field: scatterYField }]
        : chartType === 'stacked-bar'
        ? numericFields.map((f) => ({ moduleId, field: f.key }))
        : MULTI_SERIES_TYPES.includes(chartType)
        ? buildSeries()
        : [{ moduleId, field }],
      dateRange: fromDateRangeValue(dateRangeVal),
      referenceLines: refLines.length > 0 ? refLines : undefined,
      xLabel: xLabel.trim() || undefined,
      yLabel: yLabel.trim() || undefined,
      showGrid: showGrid || undefined,
      showLegend: showLegend || undefined,
    }

    if (TIME_SERIES_TYPES.includes(chartType)) {
      base.bucketBy = bucketBy as ChartConfig['bucketBy']
      base.aggregation = aggregation as ChartConfig['aggregation']
    }
    if (FILL_FORWARD_TYPES.includes(chartType)) {
      base.fillForward = fillForward || undefined
    }
    if (chartType === 'line' || chartType === 'area' || chartType === 'scatter') {
      base.showPoints = showPoints || undefined
    }
    if (chartType === 'list') {
      base.displayField = displayField
      base.secondaryField = secondaryField.trim() || undefined
      base.sort = { field: 'entry_date', direction: sortDirection }
    }

    return base
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('module_id', moduleId)
    fd.set('config', JSON.stringify(buildConfig()))

    startTransition(async () => {
      const result = initial
        ? await updateChart(initial.id, moduleId, fd)
        : await createChart(fd)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="title">Title <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Daily score trend" />
      </div>

      {/* Chart type */}
      <div className="space-y-1.5">
        <Label>Chart type</Label>
        <Select value={chartType} onValueChange={(v) => setChartType((v ?? chartType) as ChartType)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHART_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Multi-series editor (line / bar / area) */}
      {MULTI_SERIES_TYPES.includes(chartType) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Series</Label>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() =>
                setSeriesRows((rows) => [
                  ...rows,
                  { moduleId, field: numericFields[0]?.key ?? '', label: '', yAxis: 'left' },
                ])
              }
            >
              <PlusIcon /> Add series
            </Button>
          </div>

          {seriesRows.map((row, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tracker</Label>
                    <Select value={row.moduleId} onValueChange={(v) => v && updateSeriesRow(i, { moduleId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {modules.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Field</Label>
                    <Select value={row.field} onValueChange={(v) => v && updateSeriesRow(i, { field: v })}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {numericFieldsFor(row.moduleId).map((f) => (
                          <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="mt-5 shrink-0 text-muted-foreground"
                  onClick={() => setSeriesRows((rows) => rows.filter((_, j) => j !== i))}
                  disabled={seriesRows.length === 1}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    value={row.label}
                    onChange={(e) => updateSeriesRow(i, { label: e.target.value })}
                    placeholder="(auto)"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Y-axis</Label>
                  <Select value={row.yAxis} onValueChange={(v) => v && updateSeriesRow(i, { yAxis: v as 'left' | 'right' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
          {seriesRows.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Series are joined by date; dates where a series has no entry show a gap.
              Use the right y-axis for series with a very different scale.
            </p>
          )}
        </div>
      )}

      {/* Field selection */}
      {chartType !== 'stacked-bar' && chartType !== 'table' && !MULTI_SERIES_TYPES.includes(chartType) && (
        <div className="space-y-4">
          {chartType === 'list' ? (
            <>
              <div className="space-y-1.5">
                <Label>Display field</Label>
                <Select value={displayField} onValueChange={(v) => setDisplayField(v ?? displayField)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {textFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Secondary field <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={secondaryField} onValueChange={(v) => setSecondaryField(v ?? '')}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="(none)" /></SelectTrigger>
                  <SelectContent>
                    {allFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Select value={sortDirection} onValueChange={(v) => setSortDirection((v ?? sortDirection) as 'asc' | 'desc')}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest first</SelectItem>
                    <SelectItem value="asc">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : chartType === 'scatter' ? (
            <div className="flex gap-4 flex-wrap">
              <div className="space-y-1.5">
                <Label>X field</Label>
                <Select value={field} onValueChange={(v) => setField(v ?? field)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {numericFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Y field</Label>
                <Select value={scatterYField} onValueChange={(v) => setScatterYField(v ?? scatterYField)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {numericFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Field</Label>
              <Select value={field} onValueChange={(v) => setField(v ?? field)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(chartType === 'pie' ? allFields : numericFields).map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {chartType === 'stacked-bar' && (
        <p className="text-sm text-muted-foreground">Stacked bar automatically uses all numeric fields.</p>
      )}

      <Separator />

      {/* Date range + bucketing */}
      {chartType !== 'list' && chartType !== 'table' && (
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <Label>Date range</Label>
            <Select value={dateRangeVal} onValueChange={(v) => setDateRangeVal(v ?? dateRangeVal)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {TIME_SERIES_TYPES.includes(chartType) && (
            <>
              <div className="space-y-1.5">
                <Label>Bucket by</Label>
                <Select value={bucketBy} onValueChange={(v) => v && setBucketBy(v as typeof bucketBy)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['none', 'day', 'week', 'month', 'year'] as const).map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {bucketBy !== 'none' && (
                <div className="space-y-1.5">
                  <Label>Aggregation</Label>
                  <Select value={aggregation} onValueChange={(v) => v && setAggregation(v as typeof aggregation)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['none', 'sum', 'avg', 'count', 'min', 'max', 'median'] as const).map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Axis labels */}
      {AXIS_TYPES.includes(chartType) && (
        <div className="flex gap-4 flex-wrap">
          <div className="space-y-1.5">
            <Label>X label</Label>
            <Input value={xLabel} onChange={(e) => setXLabel(e.target.value)} className="w-40" placeholder="(auto)" />
          </div>
          <div className="space-y-1.5">
            <Label>Y label</Label>
            <Input value={yLabel} onChange={(e) => setYLabel(e.target.value)} className="w-40" placeholder="(auto)" />
          </div>
        </div>
      )}

      <Separator />

      {/* Display toggles */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Display</h3>

        {FILL_FORWARD_TYPES.includes(chartType) && (
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={fillForward} onCheckedChange={(v) => setFillForward(v === true)} />
            <div>
              <span className="text-sm">Fill forward</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Carry last value on days without an entry.
              </p>
            </div>
          </label>
        )}

        {(chartType === 'line' || chartType === 'area' || chartType === 'scatter') && (
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox checked={showPoints} onCheckedChange={(v) => setShowPoints(v === true)} />
            Show data points
          </label>
        )}

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox checked={showGrid} onCheckedChange={(v) => setShowGrid(v === true)} />
          Show grid
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox checked={showLegend} onCheckedChange={(v) => setShowLegend(v === true)} />
          Show legend
        </label>
      </div>

      {/* Reference lines */}
      {AXIS_TYPES.includes(chartType) && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Reference lines</h3>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setRefLines((r) => [...r, { value: 0, label: '' }])}
              >
                <PlusIcon /> Add
              </Button>
            </div>
            {refLines.map((rl, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="number" step="any" value={rl.value} className="w-24"
                  onChange={(e) => setRefLines((r) => r.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
                />
                <Input
                  placeholder="Label (optional)" value={rl.label ?? ''} className="flex-1"
                  onChange={(e) => setRefLines((r) => r.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                />
                <Button type="button" variant="ghost" size="icon" className="text-muted-foreground"
                  onClick={() => setRefLines((r) => r.filter((_, j) => j !== i))}>
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Add chart'}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
