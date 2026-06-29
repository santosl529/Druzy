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
import type { Module, ModuleField, CardSummaryMode, CardTimeWindow, CardSummaryItem, GoalCondition } from '@/lib/types'
import type { CrystalKey } from '@/lib/crystals'

const MAX_CARD_ITEMS = 4

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

interface Props {
  initial?: Module
}

function makeKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** Read the initial summary items, tolerating the legacy single-object shape. */
function initialCardItems(initial?: Module): CardSummaryItem[] {
  const cfg = initial?.card_config as unknown
  if (!cfg || typeof cfg !== 'object') return []
  if (Array.isArray((cfg as { items?: unknown }).items)) return (cfg as { items: CardSummaryItem[] }).items
  if (typeof (cfg as CardSummaryItem).field === 'string') return [cfg as CardSummaryItem]
  return []
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

  // Card summary: the values shown on the dashboard card. Empty = automatic default.
  const [cardItems, setCardItems] = useState<CardSummaryItem[]>(initialCardItems(initial))

  // Dashboard config state
  type GoalOp = 'gte' | 'lte' | 'eq' | 'between'
  const [dashMode, setDashMode] = useState<'auto' | 'binary' | 'goal' | 'gradient'>(
    initial?.dashboard_config?.mode ?? 'auto'
  )
  const [goalConditions, setGoalConditions] = useState<GoalCondition[]>(
    initial?.dashboard_config?.goal?.conditions ?? []
  )
  const [gradientField, setGradientField] = useState(
    initial?.dashboard_config?.gradientField ?? ''
  )
  const [gradientMin, setGradientMin] = useState(
    initial?.dashboard_config?.gradientRange?.min?.toString() ?? ''
  )
  const [gradientMax, setGradientMax] = useState(
    initial?.dashboard_config?.gradientRange?.max?.toString() ?? ''
  )

  function addCardItem() {
    const firstField = fields.find((f) => f.key)?.key ?? ''
    setCardItems((items) => [...items, { field: firstField, mode: 'sum', timeWindow: 'today' }])
  }

  function removeCardItem(i: number) {
    setCardItems((items) => items.filter((_, idx) => idx !== i))
  }

  function updateCardItem<K extends keyof CardSummaryItem>(i: number, key: K, value: CardSummaryItem[K]) {
    setCardItems((items) => {
      const next = [...items]
      next[i] = { ...next[i], [key]: value }
      return next
    })
  }

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
    // Only persist summary items that point at a field that still exists;
    // no items → automatic (blank → null server-side).
    const validItems = cardItems.filter((it) => it.field && fields.some((f) => f.key === it.field))
    fd.set('card_config', validItems.length ? JSON.stringify({ items: validItems }) : '')

    // Build dashboard_config
    let dashConfig: unknown = null
    if (dashMode === 'binary') {
      dashConfig = { mode: 'binary' }
    } else if (dashMode === 'goal' && goalConditions.length > 0) {
      dashConfig = { mode: 'goal', goal: { conditions: goalConditions, combine: 'all' } }
    } else if (dashMode === 'gradient' && gradientField) {
      const range =
        gradientMin !== '' && gradientMax !== ''
          ? { min: Number(gradientMin), max: Number(gradientMax) }
          : undefined
      dashConfig = { mode: 'gradient', gradientField, gradientRange: range }
    }
    fd.set('dashboard_config', dashConfig ? JSON.stringify(dashConfig) : '')

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
            The values shown on this tracker&apos;s dashboard card (up to {MAX_CARD_ITEMS}). Leave empty to pick a sensible default automatically.
          </p>
        </div>

        {cardItems.map((item, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Value</Label>
              <Select value={item.field} onValueChange={(v) => updateCardItem(i, 'field', v ?? '')}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Pick a field" /></SelectTrigger>
                <SelectContent>
                  {fields
                    .filter((f) => f.key)
                    .map((f) => (
                      <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Summarize by</Label>
              <Select value={item.mode} onValueChange={(v) => updateCardItem(i, 'mode', (v ?? item.mode) as CardSummaryMode)}>
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
              <Select value={item.timeWindow} onValueChange={(v) => updateCardItem(i, 'timeWindow', (v ?? item.timeWindow) as CardTimeWindow)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARD_TIME_WINDOWS.map((w) => (
                    <SelectItem key={w} value={w}>{CARD_WINDOW_LABEL[w]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button" variant="ghost" size="icon"
              className="shrink-0 text-muted-foreground"
              onClick={() => removeCardItem(i)}
              aria-label="Remove value"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}

        <Button
          type="button" variant="outline" size="sm"
          onClick={addCardItem}
          disabled={cardItems.length >= MAX_CARD_ITEMS || !fields.some((f) => f.key)}
        >
          <PlusIcon /> {cardItems.length === 0 ? 'Add summary value' : 'Add another'}
        </Button>
      </div>

      <Separator />
      <div>
        <h2 className="text-base font-semibold mb-1">Dashboard mode</h2>
        <p className="text-sm text-muted-foreground mb-3">
          How this tracker appears in the consistency grid.
        </p>

        <div className="mb-3">
          <Label className="text-xs mb-1 block">Mode</Label>
          <Select value={dashMode} onValueChange={(v) => setDashMode(v as typeof dashMode)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (sensible default)</SelectItem>
              <SelectItem value="binary">Binary (logged / not logged)</SelectItem>
              <SelectItem value="goal">Goal (conditions must be met)</SelectItem>
              <SelectItem value="gradient">Gradient (intensity by value)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Goal mode: condition builder */}
        {dashMode === 'goal' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">All conditions must be met for the cell to show as done.</p>
            {goalConditions.map((cond, i) => (
              <div key={i} className="flex gap-2 items-center flex-wrap">
                {/* Field */}
                <Select
                  value={cond.field}
                  onValueChange={(v) => {
                    const next = [...goalConditions]; next[i] = { ...next[i], field: v ?? '' }; setGoalConditions(next)
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.filter((f) => f.type === 'number' || f.type === 'rating').map((f) => (
                      <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Op */}
                <Select
                  value={cond.op}
                  onValueChange={(v) => {
                    const next = [...goalConditions]; next[i] = { ...next[i], op: v as GoalOp }; setGoalConditions(next)
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gte">≥ (at least)</SelectItem>
                    <SelectItem value="lte">≤ (at most)</SelectItem>
                    <SelectItem value="eq">= (exactly)</SelectItem>
                    <SelectItem value="between">between</SelectItem>
                  </SelectContent>
                </Select>
                {/* Value(s) */}
                {cond.op === 'between' ? (
                  <>
                    <Input
                      type="number"
                      placeholder="min"
                      className="w-20"
                      value={cond.min ?? ''}
                      onChange={(e) => {
                        const next = [...goalConditions]; next[i] = { ...next[i], min: Number(e.target.value) }; setGoalConditions(next)
                      }}
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="number"
                      placeholder="max"
                      className="w-20"
                      value={cond.max ?? ''}
                      onChange={(e) => {
                        const next = [...goalConditions]; next[i] = { ...next[i], max: Number(e.target.value) }; setGoalConditions(next)
                      }}
                    />
                  </>
                ) : (
                  <Input
                    type="number"
                    placeholder="value"
                    className="w-24"
                    value={cond.value ?? ''}
                    onChange={(e) => {
                      const next = [...goalConditions]; next[i] = { ...next[i], value: Number(e.target.value) }; setGoalConditions(next)
                    }}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGoalConditions(goalConditions.filter((_, j) => j !== i))}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGoalConditions([...goalConditions, { field: fields.find((f) => f.type === 'number' || f.type === 'rating')?.key ?? '', op: 'gte', value: 0 }])}
              disabled={fields.filter((f) => f.type === 'number' || f.type === 'rating').length === 0}
            >
              <PlusIcon className="size-4 mr-1" /> Add condition
            </Button>
            {fields.filter((f) => f.type === 'number' || f.type === 'rating').length === 0 && (
              <p className="text-xs text-muted-foreground">Add a number or rating field to use goal mode.</p>
            )}
          </div>
        )}

        {/* Gradient mode: field + optional range */}
        {dashMode === 'gradient' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Value field</Label>
              <Select value={gradientField} onValueChange={(v) => setGradientField(v ?? '')}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Pick a field" />
                </SelectTrigger>
                <SelectContent>
                  {fields.filter((f) => f.type === 'number' || f.type === 'rating').map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Fixed range (optional — leave blank for auto)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  placeholder="Min"
                  className="w-24"
                  value={gradientMin}
                  onChange={(e) => setGradientMin(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="number"
                  placeholder="Max"
                  className="w-24"
                  value={gradientMax}
                  onChange={(e) => setGradientMax(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
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
