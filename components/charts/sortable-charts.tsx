'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { ModuleChart } from '@/components/module-chart'
import { deleteChart, reorderCharts } from '@/app/actions/charts'
import type { Chart, Entry, Module, ModuleField } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ChartCardProps {
  chart: Chart
  moduleId: string
  entries: Entry[]
  fields: ModuleField[]
  sourceModules?: Module[]
  sourceEntries?: Entry[]
  timezone?: string | null
  onDelete: (chartId: string) => void
}

function SortableChartCard({ chart, moduleId, entries, fields, sourceModules, sourceEntries, timezone, onDelete }: ChartCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: chart.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const title = chart.config.title
    ?? fields.find((f) => f.key === chart.config.series[0]?.field)?.label
    ?? chart.config.chartType

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <button
          {...attributes}
          {...listeners}
          className="touch-none text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-0.5"
          aria-label="Drag to reorder"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span className="flex-1 text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground mr-1">{chart.config.chartType}</span>
        <Link
          href={`/modules/${moduleId}/charts/${chart.id}/edit`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7 text-muted-foreground')}
        >
          <PencilIcon className="size-3.5" />
        </Link>
        <button
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7 text-muted-foreground hover:text-destructive')}
          onClick={() => onDelete(chart.id)}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      {/* Chart body */}
      <div className="p-4">
        <ModuleChart
          chart={chart}
          entries={entries}
          fields={fields}
          sourceModules={sourceModules}
          sourceEntries={sourceEntries}
          timezone={timezone}
        />
      </div>
    </div>
  )
}

interface Props {
  charts: Chart[]
  moduleId: string
  entries: Entry[]
  fields: ModuleField[]
  sourceModules?: Module[]
  sourceEntries?: Entry[]
  timezone?: string | null
}

export function SortableChartsList({
  charts: initialCharts, moduleId, entries, fields, sourceModules, sourceEntries, timezone,
}: Props) {
  const [charts, setCharts] = useState(initialCharts)
  const [, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setCharts((prev) => {
      const oldIdx = prev.findIndex((c) => c.id === active.id)
      const newIdx = prev.findIndex((c) => c.id === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx)
      startTransition(() => {
        void reorderCharts(reordered.map((c, i) => ({ id: c.id, position: i })))
      })
      return reordered
    })
  }

  function handleDelete(chartId: string) {
    if (!confirm('Remove this chart?')) return
    setCharts((prev) => prev.filter((c) => c.id !== chartId))
    startTransition(() => {
      void deleteChart(chartId, moduleId)
    })
  }

  return (
    <DndContext id={`charts-${moduleId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={charts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {charts.map((chart) => (
            <SortableChartCard
              key={chart.id}
              chart={chart}
              moduleId={moduleId}
              entries={entries}
              fields={fields}
              sourceModules={sourceModules}
              sourceEntries={sourceEntries}
              timezone={timezone}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
