'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TrackerModule } from '@/lib/types'
import type { MacroValues, TrackerSelection } from '@/components/food/shared'
import { autoMatchField } from '@/components/food/shared'

// ----------------------------------------------------------------
// "Also log to tracker" collapsible section
// ----------------------------------------------------------------

interface TrackerLogSectionProps {
  macros: MacroValues
  modules: TrackerModule[]
  /** Called whenever the selection changes; null = section closed / no module selected. */
  onChange: (selection: TrackerSelection | null) => void
}

export function TrackerLogSection({ macros, modules, onChange }: TrackerLogSectionProps) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})

  const selectedModule = modules.find((m) => m.id === selectedId) ?? null

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (!next) {
      setSelectedId('')
      setFieldValues({})
      onChange(null)
    }
  }

  const handleModuleChange = (moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    setSelectedId(moduleId)
    if (!mod) {
      setFieldValues({})
      onChange(null)
      return
    }
    const initial: Record<string, string> = {}
    for (const f of mod.numericFields) {
      initial[f.key] = autoMatchField(f.key, f.label, macros)
    }
    setFieldValues(initial)
    onChange({ moduleId: mod.id, fieldValues: initial })
  }

  const handleFieldChange = (key: string, value: string) => {
    const next = { ...fieldValues, [key]: value }
    setFieldValues(next)
    if (selectedModule) {
      onChange({ moduleId: selectedModule.id, fieldValues: next })
    }
  }

  if (modules.length === 0) return null

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors rounded-md"
        onClick={handleToggle}
      >
        <span className="text-muted-foreground">
          {open && selectedModule
            ? `Also logging to "${selectedModule.name}"`
            : 'Also log to a tracker (optional)'}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t pt-3">
          <Select value={selectedId} onValueChange={(v) => handleModuleChange(v ?? '')}>
            <SelectTrigger className="h-8 text-sm">
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

          {selectedModule && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Values are pre-filled from your food entry — adjust if needed.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selectedModule.numericFields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {f.label}
                      {f.unit && (
                        <span className="text-muted-foreground/60"> ({f.unit})</span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={fieldValues[f.key] ?? ''}
                      onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
