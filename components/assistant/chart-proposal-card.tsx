'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { BarChart2Icon, CheckIcon, ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChartLoading } from '@/components/charts/chart-loading'
import { addChartFromProposal } from '@/app/actions/charts'
import type { ChartConfig } from '@/lib/types'
import type { MultiSeriesRow, SeriesMeta } from '@/lib/chart-data'

const MultiSeriesChartView = dynamic(
  () => import('@/components/charts/recharts-charts').then((m) => m.MultiSeriesChartView),
  { ssr: false, loading: () => <ChartLoading /> },
)

interface Props {
  config: ChartConfig
  previewData: { rows: MultiSeriesRow[]; series: SeriesMeta[] }
  moduleOptions: Array<{ id: string; name: string }>
  defaultModuleId: string
}

export function ChartProposalCard({ config, previewData, moduleOptions, defaultModuleId }: Props) {
  const [pending, startTransition] = useTransition()
  const [selectedModuleId, setSelectedModuleId] = useState(defaultModuleId)
  const [error, setError] = useState<string | null>(null)
  const [savedModuleId, setSavedModuleId] = useState<string | null>(null)

  const variant = (config.chartType === 'bar' || config.chartType === 'area')
    ? config.chartType
    : 'line'

  function handleAdd() {
    setError(null)
    startTransition(async () => {
      const result = await addChartFromProposal(config, selectedModuleId)
      if ('error' in result) {
        setError(result.error)
      } else {
        setSavedModuleId(selectedModuleId)
      }
    })
  }

  const isEmpty = previewData.rows.length === 0

  return (
    <div className="rounded-lg border bg-card shadow-sm w-full max-w-2xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart2Icon className="size-4 text-indigo-500 shrink-0" />
        <p className="font-heading text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Chart preview
        </p>
        {config.title && (
          <span className="text-sm font-medium ml-auto">{config.title}</span>
        )}
      </div>

      <Separator />

      {/* Chart preview */}
      {isEmpty ? (
        <div className="flex items-center justify-center h-[220px] rounded-md bg-muted/40 text-sm text-muted-foreground">
          No data yet — add some entries first, then this chart will populate.
        </div>
      ) : (
        <div className="-mx-1">
          <MultiSeriesChartView
            rows={previewData.rows}
            series={previewData.series}
            variant={variant}
            showLegend={previewData.series.length > 1}
            yLabel={config.yLabel}
            yRightLabel={config.yRightLabel}
            yAxisMin={config.yAxisMin}
            yAxisMax={config.yAxisMax}
            yRightAxisMin={config.yRightAxisMin}
            yRightAxisMax={config.yRightAxisMax}
            zeroBaseline={config.zeroBaseline}
          />
        </div>
      )}

      {/* Config summary */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {config.bucketBy && config.bucketBy !== 'none' && (
          <span>Grouped by <strong>{config.bucketBy}</strong></span>
        )}
        {config.aggregation && config.aggregation !== 'none' && (
          <span>Aggregation: <strong>{config.aggregation}</strong></span>
        )}
        <span>{previewData.rows.length} data point{previewData.rows.length !== 1 ? 's' : ''}</span>
      </div>

      {savedModuleId ? (
        <>
          <Separator />
          <div className="flex items-center gap-3">
            <CheckIcon className="size-4 text-green-500" />
            <span className="text-sm">Chart added!</span>
            <Link
              href={`/modules/${savedModuleId}`}
              className="text-sm text-accent-text hover:underline flex items-center gap-1"
            >
              View tracker <ExternalLinkIcon className="size-3" />
            </Link>
          </div>
        </>
      ) : (
        <>
          <Separator />

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Attach-to picker + add button */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1 flex-1 min-w-0">
              <Label className="text-xs">Add to tracker</Label>
              <Select value={selectedModuleId} onValueChange={(v) => { if (v) setSelectedModuleId(v) }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {moduleOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-sm">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={pending} className="gap-1.5 shrink-0">
              <CheckIcon className="size-3.5" />
              {pending ? 'Adding…' : 'Add chart'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
