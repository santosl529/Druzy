'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createModuleFromProposal } from '@/app/actions/modules'
import { CrystalPicker } from '@/components/crystal-picker'
import { GeodeIcon } from '@/components/geode-icon'
import { CRYSTALS } from '@/lib/crystals'
import { cn } from '@/lib/utils'
import { FIELD_TYPES } from '@/lib/types'
import type { ModuleField } from '@/lib/types'
import type { CrystalKey } from '@/lib/crystals'

interface Props {
  proposal: { name: string; fields: ModuleField[] }
}

function makeKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

// ----------------------------------------------------------------
// Internal state type (fields managed as mutable rows)
// ----------------------------------------------------------------

type FieldRow = ModuleField

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------

export function ModuleProposalCard({ proposal }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(proposal.name)
  const [fields, setFields] = useState<FieldRow[]>(proposal.fields)
  const [crystalType, setCrystalType] = useState<CrystalKey>('amethyst')
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)
  const [showAllCrystals, setShowAllCrystals] = useState(false)

  if (discarded) {
    return (
      <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        Proposal discarded. Describe a new tracker below.
      </div>
    )
  }

  function updateField<K extends keyof FieldRow>(i: number, key: K, value: FieldRow[K]) {
    setFields((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], [key]: value }
      if (key === 'label' && typeof value === 'string') {
        next[i].key = makeKey(value)
      }
      return next
    })
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      { key: '', label: '', type: 'text', required: false },
    ])
  }

  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await createModuleFromProposal(name, fields, crystalType)
      if ('error' in result) {
        setError(result.error)
      } else {
        router.push(`/modules/${result.id}`)
      }
    })
  }

  const crystal = CRYSTALS[crystalType]
  const grid = 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_72px_64px_28px] gap-2.5 items-center'
  const cellInput = 'h-8 bg-background dark:bg-background text-sm'

  return (
    <div
      className="w-full rounded-2xl border bg-card px-[22px] py-5 flex flex-col gap-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--border), var(--primary) 45%)',
        boxShadow: '0 0 28px color-mix(in srgb, var(--primary) 10%, transparent)',
      }}
    >
      {/* Name + crystal */}
      <div className="flex flex-wrap items-center gap-3.5">
        <GeodeIcon crystalType={crystalType} openness={0} className="size-11 shrink-0" />
        <div className="flex-1 min-w-[200px] flex flex-col gap-1">
          <Label htmlFor={`proposal-name-${proposal.name}`} className="text-xs font-normal text-muted-foreground">
            New tracker
          </Label>
          <Input
            id={`proposal-name-${proposal.name}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-[38px] bg-background dark:bg-background font-heading text-[1.05rem] md:text-[1.05rem] font-semibold"
          />
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <span className="text-xs text-muted-foreground">Crystal · {crystal.name}</span>
          <div className="flex items-center gap-2" role="radiogroup" aria-label="Crystal">
            {QUICK_CRYSTALS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={crystalType === key}
                aria-label={CRYSTALS[key].name}
                onClick={() => setCrystalType(key)}
                className="size-3 rotate-45 rounded-[1px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: CRYSTALS[key].primary,
                  boxShadow: crystalType === key ? `0 0 0 2px var(--card), 0 0 0 3px ${CRYSTALS[key].glow}` : undefined,
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => setShowAllCrystals((v) => !v)}
              className="ml-0.5 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={showAllCrystals}
            >
              {showAllCrystals ? 'less' : 'more'}
            </button>
          </div>
        </div>
      </div>
      {showAllCrystals && <CrystalPicker value={crystalType} onChange={setCrystalType} />}

      {/* Fields */}
      <div className="rounded-[10px] border overflow-x-auto">
        <div className="min-w-[480px]">
          <div className={cn(grid, 'px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground')}>
            <span>Label</span>
            <span>Type</span>
            <span>Unit</span>
            <span>Required</span>
            <span />
          </div>
          {fields.map((field, i) => (
            <div key={i} className="border-t px-3 py-2 flex flex-col gap-2">
              <div className={grid}>
                <Input
                  value={field.label}
                  onChange={(e) => updateField(i, 'label', e.target.value)}
                  placeholder="e.g. Hours slept"
                  aria-label="Field label"
                  className={cellInput}
                />
                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(i, 'type', (v ?? field.type) as ModuleField['type'])}
                >
                  <SelectTrigger className="h-8! w-full text-sm bg-background dark:bg-background" aria-label="Field type">
                    <SelectValue>{(v: string) => TYPE_LABELS[v] ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-sm">
                        {TYPE_LABELS[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.type === 'number' || field.type === 'rating' ? (
                  <Input
                    value={field.unit ?? ''}
                    onChange={(e) => updateField(i, 'unit', e.target.value.trim() || undefined)}
                    placeholder="min"
                    aria-label="Unit"
                    className={cellInput}
                  />
                ) : (
                  <span className="text-muted-foreground/60 pl-2">—</span>
                )}
                <Checkbox
                  checked={field.required}
                  onCheckedChange={(v) => updateField(i, 'required', v === true)}
                  aria-label="Required"
                  className="justify-self-start"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={() => removeField(i)}
                  disabled={fields.length === 1}
                  aria-label="Remove field"
                >
                  <XIcon />
                </Button>
              </div>
              {field.type === 'select' && (
                <Input
                  value={field.options?.join(', ') ?? ''}
                  onChange={(e) =>
                    updateField(
                      i,
                      'options',
                      e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    )
                  }
                  placeholder="Options, comma-separated: Good, Neutral, Bad"
                  aria-label="Select options"
                  className={cellInput}
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addField}
            className="w-full border-t px-3 py-2.5 text-left text-[0.8rem] font-medium text-accent-text hover:bg-muted/40"
          >
            + Add field
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="mr-auto text-xs text-muted-foreground">{defaultChartNote(fields)}</span>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDiscarded(true)}
          disabled={pending}
          className="h-9 text-muted-foreground"
        >
          Discard
        </Button>
        <Button className="h-9 px-4" onClick={handleConfirm} disabled={pending || !name.trim() || fields.length === 0}>
          {pending ? 'Creating…' : 'Create tracker'}
        </Button>
      </div>
    </div>
  )
}

const QUICK_CRYSTALS: CrystalKey[] = ['amethyst', 'opal', 'malachite', 'carnelian', 'sapphire', 'citrine']

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  rating: 'Rating 1–5',
  boolean: 'Yes / no',
  date: 'Date',
  select: 'Select',
  photo: 'Photo',
}

/** Mirrors the chart createDefaultChart adds (app/actions/charts.ts). */
function defaultChartNote(fields: ModuleField[]): string {
  const numeric = fields.find((f) => f.type === 'number' || f.type === 'rating')
  if (numeric) return `Comes with a default chart: a line of ${numeric.label || 'the first number'}`
  const textual = fields.find((f) => f.type === 'text' || f.type === 'select')
  if (textual) return `Comes with a default chart: a list of ${textual.label || 'entries'}`
  return 'Comes with a default table of entries'
}
