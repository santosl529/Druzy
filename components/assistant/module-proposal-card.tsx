'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Trash2Icon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createModuleFromProposal } from '@/app/actions/modules'
import { FIELD_TYPES } from '@/lib/types'
import type { ModuleField } from '@/lib/types'

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
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)

  if (discarded) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
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
      const result = await createModuleFromProposal(name, fields)
      if ('error' in result) {
        setError(result.error)
      } else {
        router.push(`/modules/${result.id}`)
      }
    })
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm w-full max-w-xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CheckIcon className="size-4 text-green-500 shrink-0" />
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Proposed tracker — review and confirm
        </p>
      </div>

      <Separator />

      {/* Tracker name */}
      <div className="space-y-1.5">
        <Label htmlFor="proposal-name">Tracker name</Label>
        <Input
          id="proposal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-medium"
        />
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Fields</p>
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <PlusIcon className="size-3.5 mr-1" /> Add field
          </Button>
        </div>

        {fields.map((field, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/30">
            {/* Label + key */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  value={field.label}
                  onChange={(e) => updateField(i, 'label', e.target.value)}
                  placeholder="e.g. Hours slept"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Key</Label>
                <Input
                  value={field.key}
                  onChange={(e) => updateField(i, 'key', e.target.value)}
                  placeholder="e.g. hours_slept"
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>

            {/* Type + required + remove */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={field.type}
                  onValueChange={(v) =>
                    updateField(i, 'type', (v ?? field.type) as ModuleField['type'])
                  }
                >
                  <SelectTrigger className="h-8 w-28 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-sm">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(field.type === 'number' || field.type === 'rating') && (
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={field.unit ?? ''}
                    onChange={(e) =>
                      updateField(i, 'unit', e.target.value.trim() || undefined)
                    }
                    placeholder="lbs, min…"
                    className="h-8 w-20 text-sm"
                  />
                </div>
              )}

              <div className="flex items-center gap-1.5 mt-4">
                <Checkbox
                  id={`req-${i}`}
                  checked={field.required}
                  onCheckedChange={(v) => updateField(i, 'required', v === true)}
                />
                <Label htmlFor={`req-${i}`} className="text-xs font-normal cursor-pointer">
                  Required
                </Label>
              </div>

              <div className="mt-4 ml-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => removeField(i)}
                  disabled={fields.length === 1}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Select options */}
            {field.type === 'select' && (
              <div className="space-y-1">
                <Label className="text-xs">Options (comma-separated)</Label>
                <Input
                  value={field.options?.join(', ') ?? ''}
                  onChange={(e) =>
                    updateField(
                      i,
                      'options',
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                  placeholder="Good, Neutral, Bad"
                  className="h-8 text-sm"
                />
              </div>
            )}

            {field.type !== 'boolean' && field.type !== 'select' && (
              <Badge variant="secondary" className="text-[10px]">
                {field.type}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Separator />

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleConfirm} disabled={pending || !name.trim() || fields.length === 0}>
          {pending ? 'Creating…' : 'Create tracker'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDiscarded(true)}
          disabled={pending}
          className="text-muted-foreground"
        >
          Discard
        </Button>
      </div>
    </div>
  )
}
