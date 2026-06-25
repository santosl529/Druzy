'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createModule, updateModule } from '@/app/actions/modules'
import { CrystalPicker } from '@/components/crystal-picker'
import { FIELD_TYPES, CARD_SUMMARY_MODES, CARD_TIME_WINDOWS } from '@/lib/types'
import type { Module, ModuleField, CardSummaryMode, CardTimeWindow } from '@/lib/types'
import type { CrystalKey } from '@/lib/crystals'

const CARD_MODE_LABEL: Record<CardSummaryMode, string> = {
  sum: 'Total (sum)',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  median: 'Median',
  count: 'Count of entries',
  latest: 'Latest value',
}

const CARD_WINDOW_LABEL: Record<CardTimeWindow, string> = {
  today: 'Today',
  week: 'This week',
  all: 'All time',
}

const AUTO = '__auto__'

interface Props {
  initial?: Module
}

function makeKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function ModuleBuilder({ initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initial?.name ?? '')
  const [fields, setFields] = useState<ModuleField[]>(
    initial?.fields ?? [{ key: '', label: '', type: 'text', required: false }]
  )
  const [crystalType, setCrystalType] = useState<CrystalKey>(initial?.crystal_type ?? 'amethyst')

  // Card summary: which value the dashboard card shows. '' = automatic default.
  const [cardField, setCardField] = useState<string>(initial?.card_config?.field ?? '')
  const [cardMode, setCardMode] = useState<CardSummaryMode>(initial?.card_config?.mode ?? 'sum')
  const [cardWindow, setCardWindow] = useState<CardTimeWindow>(initial?.card_config?.timeWindow ?? 'today')

  function addField() {
    setFields((f) => [...f, { key: '', label: '', type: 'text', required: false }])
  }

  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i))
  }

  function updateField<K extends keyof ModuleField>(i: number, key: K, value: ModuleField[K]) {
    setFields((f) => {
      const next = [...f]
      next[i] = { ...next[i], [key]: value }
      if (key === 'label' && typeof value === 'string') next[i].key = makeKey(value)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('name', name)
    fd.set('fields', JSON.stringify(fields))
    fd.set('crystal_type', crystalType)
    // Only persist a card_config that points at a field that still exists;
    // otherwise leave it automatic (blank → null server-side).
    const cardConfig =
      cardField && fields.some((f) => f.key === cardField)
        ? { field: cardField, mode: cardMode, timeWindow: cardWindow }
        : null
    fd.set('card_config', cardConfig ? JSON.stringify(cardConfig) : '')

    startTransition(async () => {
      const result = initial
        ? await updateModule(initial.id, fd)
        : await createModule(fd)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="name">Tracker name</Label>
        <Input
          id="name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sleep, Mood, Workouts" required
        />
      </div>

      <div className="space-y-2">
        <Label>Crystal</Label>
        <CrystalPicker value={crystalType} onChange={setCrystalType} />
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Fields</h2>
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <PlusIcon /> Add field
          </Button>
        </div>

        {fields.map((field, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Label</Label>
                  <Input
                    value={field.label} onChange={(e) => updateField(i, 'label', e.target.value)}
                    placeholder="e.g. Hours slept" required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Key</Label>
                  <Input
                    value={field.key} onChange={(e) => updateField(i, 'key', e.target.value)}
                    placeholder="e.g. hours_slept" pattern="[a-z0-9_]+" required
                  />
                </div>
              </div>
              <Button
                type="button" variant="ghost" size="icon"
                className="mt-5 shrink-0 text-muted-foreground"
                onClick={() => removeField(i)} disabled={fields.length === 1}
              >
                <Trash2Icon />
              </Button>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={field.type} onValueChange={(v) => updateField(i, 'type', (v ?? field.type) as ModuleField['type'])}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 mt-5">
                <Checkbox
                  id={`required-${i}`} checked={field.required}
                  onCheckedChange={(v) => updateField(i, 'required', v === true)}
                />
                <Label htmlFor={`required-${i}`} className="font-normal cursor-pointer">Required</Label>
              </div>

              {field.type !== 'boolean' && (
                <Badge variant="secondary" className="mt-5">{field.type}</Badge>
              )}
            </div>

            {(field.type === 'number' || field.type === 'rating') && (
              <div className="space-y-1.5">
                <Label>Unit <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  value={field.unit ?? ''}
                  onChange={(e) => updateField(i, 'unit', e.target.value.trim() || undefined)}
                  placeholder="e.g. lbs, kcal, min"
                  className="w-36"
                />
              </div>
            )}
            {field.type === 'select' && (
              <div className="space-y-1.5">
                <Label>Options (comma-separated)</Label>
                <Input
                  value={field.options?.join(', ') ?? ''}
                  onChange={(e) =>
                    updateField(i, 'options', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                  }
                  placeholder="e.g. Good, Neutral, Bad"
                />
              </div>
            )}
            {field.type === 'rating' && (
              <p className="text-xs text-muted-foreground">Rating fields capture values 1–5.</p>
            )}
          </div>
        ))}
      </div>

      <Separator />

      <div className="space-y-3">
        <div>
          <h2 className="font-medium">Card summary</h2>
          <p className="text-sm text-muted-foreground">
            The single value shown on this tracker&apos;s dashboard card. Leave automatic to pick a sensible default.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>Value</Label>
            <Select
              value={cardField || AUTO}
              onValueChange={(v) => setCardField(v === AUTO ? '' : (v ?? ''))}
            >
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Automatic</SelectItem>
                {fields
                  .filter((f) => f.key)
                  .map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {cardField && (
            <>
              <div className="space-y-1.5">
                <Label>Summarize by</Label>
                <Select value={cardMode} onValueChange={(v) => setCardMode((v ?? cardMode) as CardSummaryMode)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARD_SUMMARY_MODES.map((m) => (
                      <SelectItem key={m} value={m}>{CARD_MODE_LABEL[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Over</Label>
                <Select value={cardWindow} onValueChange={(v) => setCardWindow((v ?? cardWindow) as CardTimeWindow)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARD_TIME_WINDOWS.map((w) => (
                      <SelectItem key={w} value={w}>{CARD_WINDOW_LABEL[w]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Create tracker'}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
