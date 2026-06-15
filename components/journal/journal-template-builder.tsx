'use client'

import { useState, useTransition } from 'react'
import { PlusIcon, Trash2Icon, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { saveJournalTemplate } from '@/app/actions/journal'
import { JOURNAL_FIELD_TYPES } from '@/lib/types'
import type { JournalField, JournalFieldType, TrackerModule } from '@/lib/types'

function makeKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

interface Props {
  initial: JournalField[]
  trackerModules: TrackerModule[]
}

const FIELD_TYPE_LABELS: Record<JournalFieldType, string> = {
  text: 'Text — single extracted string',
  list: 'List — array of items',
  number: 'Number — numeric value (can connect to a tracker)',
}

export function JournalTemplateBuilder({ initial, trackerModules }: Props) {
  const [fields, setFields] = useState<JournalField[]>(
    initial.length > 0
      ? initial
      : [{ key: 'transcription_notes', label: 'Notes', type: 'text' }]
  )
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function addField() {
    setFields((f) => [...f, { key: '', label: '', type: 'text' }])
    setExpanded((s) => new Set([...s, fields.length]))
  }

  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i))
    setExpanded((s) => {
      const next = new Set<number>()
      s.forEach((idx) => {
        if (idx < i) next.add(idx)
        if (idx > i) next.add(idx - 1)
      })
      return next
    })
  }

  function updateField<K extends keyof JournalField>(i: number, key: K, value: JournalField[K]) {
    setFields((f) => {
      const next = [...f]
      next[i] = { ...next[i], [key]: value }
      if (key === 'label' && typeof value === 'string') {
        next[i].key = makeKey(value)
      }
      // Switching away from number clears tracker connection.
      if (key === 'type' && value !== 'number') {
        delete next[i].targetModuleId
        delete next[i].targetFieldKey
      }
      // Switching module resets field selection.
      if (key === 'targetModuleId') {
        delete next[i].targetFieldKey
      }
      return next
    })
  }

  function toggleExpanded(i: number) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveJournalTemplate(fields)
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {fields.map((field, i) => {
          const isOpen = expanded.has(i)
          const selectedModule = trackerModules.find((m) => m.id === field.targetModuleId)

          return (
            <div key={i} className="rounded-lg border">
              {/* Row header — always visible */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                  onClick={() => toggleExpanded(i)}
                >
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium truncate">
                    {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{field.type}</span>
                  {field.targetModuleId && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      → {selectedModule?.name ?? field.targetModuleId}
                    </span>
                  )}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  onClick={() => removeField(i)}
                  disabled={fields.length === 1}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-3 pb-4 pt-1 space-y-3 border-t">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(i, 'label', e.target.value)}
                        placeholder="e.g. Today's highlights"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Key</Label>
                      <Input
                        value={field.key}
                        onChange={(e) => updateField(i, 'key', e.target.value)}
                        placeholder="auto-filled from label"
                        pattern="[a-z0-9_]+"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={field.type}
                      onValueChange={(v) =>
                        v && updateField(i, 'type', v as JournalFieldType)
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JOURNAL_FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {FIELD_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Extraction instruction{' '}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      value={field.instruction ?? ''}
                      onChange={(e) =>
                        updateField(i, 'instruction', e.target.value || undefined)
                      }
                      placeholder="e.g. Extract all items listed under Today's meals"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Guides the AI on what to extract for this field.
                    </p>
                  </div>

                  {/* Tracker connection — number fields only */}
                  {field.type === 'number' && trackerModules.length > 0 && (
                    <div className="space-y-2 rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-medium">Connect to tracker (optional)</p>
                      <p className="text-xs text-muted-foreground">
                        When saving, the extracted value will also be logged to this tracker field.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Tracker</Label>
                          <Select
                            value={field.targetModuleId ?? ''}
                            onValueChange={(v) =>
                              updateField(i, 'targetModuleId', v || undefined)
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">(none)</SelectItem>
                              {trackerModules.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Field</Label>
                          <Select
                            value={field.targetFieldKey ?? ''}
                            onValueChange={(v) =>
                              updateField(i, 'targetFieldKey', v || undefined)
                            }
                            disabled={!field.targetModuleId}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {(selectedModule?.numericFields ?? []).map((f) => (
                                <SelectItem key={f.key} value={f.key}>
                                  {f.label}
                                  {f.unit ? ` (${f.unit})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {field.type === 'number' && trackerModules.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No trackers with numeric fields yet. Create a tracker first to connect it.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addField} className="gap-1.5">
        <PlusIcon className="h-4 w-4" />
        Add field
      </Button>

      <Separator />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600">Template saved.</p>}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save template'}
        </Button>
      </div>
    </div>
  )
}
