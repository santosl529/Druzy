'use client'

import { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TrackerModule } from '@/lib/types'
import type { MacroValues, TrackerSelection } from '@/components/food/shared'
import { autoMatchField, macroForField } from '@/components/food/shared'

// ----------------------------------------------------------------
// "Also log to a tracker" section
// ----------------------------------------------------------------

interface TrackerLogSectionProps {
  macros: MacroValues
  modules: TrackerModule[]
  /** Called whenever the selection changes; null = unchecked / no module selected. */
  onChange: (selection: TrackerSelection | null) => void
}

/**
 * Optional second write: the same macros into one of the user's trackers.
 * Each numeric field is matched to a macro by name and follows the macro as
 * it's edited, until the user types over that field's value here.
 */
export function TrackerLogSection({ macros, modules, onChange }: TrackerLogSectionProps) {
  const [enabled, setEnabled] = useState(false)
  // Default to the first tracker whose fields match a macro (e.g. "Nutrition").
  const [selectedId, setSelectedId] = useState<string>(
    () =>
      modules.find((m) => m.numericFields.some((f) => macroForField(f.key, f.label)))?.id ??
      modules[0]?.id ??
      '',
  )
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  const selectedModule = modules.find((m) => m.id === selectedId) ?? null
  const fieldValues: Record<string, string> = {}
  for (const f of selectedModule?.numericFields ?? []) {
    fieldValues[f.key] = overrides[f.key] ?? autoMatchField(f.key, f.label, macros)
  }
  const fieldValuesKey = JSON.stringify(fieldValues)

  useEffect(() => {
    onChange(enabled && selectedModule ? { moduleId: selectedModule.id, fieldValues: JSON.parse(fieldValuesKey) } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selectedModule?.id, fieldValuesKey])

  if (modules.length === 0) return null

  return (
    <div className="rounded-[10px] border bg-muted/40 px-3.5 py-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5 text-[0.8rem]">
        <label className="flex items-center gap-2.5 font-medium cursor-pointer">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          Also log to a tracker
        </label>
        {enabled && (
          <Select
            items={modules.map((m) => ({ value: m.id, label: m.name }))}
            value={selectedId}
            onValueChange={(v) => {
              setSelectedId(v ?? '')
              setOverrides({})
            }}
          >
            <SelectTrigger size="sm" className="ml-auto h-7 text-[0.8rem] min-w-36">
              <SelectValue placeholder="Select a tracker…" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {enabled && selectedModule && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/80">
          {selectedModule.numericFields.map((f) => (
            <label
              key={f.key}
              className="flex items-center gap-1 rounded-md border bg-background pl-2 pr-1 py-0.5 focus-within:border-ring"
            >
              {f.label} ←
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                placeholder="—"
                aria-label={`${f.label} value for ${selectedModule.name}`}
                value={fieldValues[f.key]}
                onChange={(e) => setOverrides((o) => ({ ...o, [f.key]: e.target.value }))}
                className="w-14 bg-transparent tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              {f.unit && <span className="text-muted-foreground">{f.unit}</span>}
            </label>
          ))}
          <span className="text-muted-foreground py-0.5">matched by field name</span>
        </div>
      )}
    </div>
  )
}
