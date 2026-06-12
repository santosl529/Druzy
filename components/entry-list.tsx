'use client'

import { useTransition, useState } from 'react'
import { Trash2Icon, PencilIcon, CheckIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { deleteEntry, updateEntry } from '@/app/actions/entries'
import type { Entry, ModuleField } from '@/lib/types'

interface Props {
  moduleId: string
  fields: ModuleField[]
  entries: Entry[]
  /** Hides edit/delete actions — used for computed (formula) values. */
  readOnly?: boolean
}

function formatValue(value: unknown, field: ModuleField): string {
  if (value === null || value === undefined) return '—'
  if (field.type === 'boolean') return value ? 'Yes' : 'No'
  const str = String(value)
  if ((field.type === 'number' || field.type === 'rating') && field.unit) {
    return `${str} ${field.unit}`
  }
  return str
}

// ----------------------------------------------------------------
// Inline edit row
// ----------------------------------------------------------------

interface EditRowProps {
  entry: Entry
  fields: ModuleField[]
  moduleId: string
  onCancel: () => void
}

function EditRow({ entry, fields, moduleId, onCancel }: EditRowProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Initialise select values from the current entry.
  const [selectValues, setSelectValues] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {}
    for (const f of fields) {
      if (f.type === 'select') {
        vals[f.key] = String((entry.values as Record<string, unknown>)[f.key] ?? '')
      }
    }
    return vals
  })

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    for (const [key, val] of Object.entries(selectValues)) fd.set(key, val)

    startTransition(async () => {
      const result = await updateEntry(entry.id, moduleId, fields, fd)
      if (result?.error) {
        setError(result.error)
      } else {
        onCancel()
      }
    })
  }

  const vals = entry.values as Record<string, unknown>

  return (
    <TableRow className="bg-muted/30">
      <TableCell>
        <Input
          name="entry_date"
          type="date"
          defaultValue={entry.entry_date}
          className="h-7 w-32 text-sm"
        />
      </TableCell>
      {fields.map((f) => (
        <TableCell key={f.key} className="py-1">
          {f.type === 'text' && (
            <Input name={f.key} defaultValue={String(vals[f.key] ?? '')} className="h-7 text-sm" />
          )}
          {(f.type === 'number' || f.type === 'rating') && (
            <Input
              name={f.key}
              type="number"
              step={f.type === 'rating' ? '1' : 'any'}
              min={f.type === 'rating' ? 1 : undefined}
              max={f.type === 'rating' ? 5 : undefined}
              defaultValue={vals[f.key] !== null && vals[f.key] !== undefined ? String(vals[f.key]) : ''}
              className="h-7 w-24 text-sm"
            />
          )}
          {f.type === 'date' && (
            <Input name={f.key} type="date" defaultValue={String(vals[f.key] ?? '')} className="h-7 text-sm" />
          )}
          {f.type === 'boolean' && (
            <Checkbox
              name={f.key}
              defaultChecked={vals[f.key] === true}
            />
          )}
          {f.type === 'select' && (
            <Select
              value={selectValues[f.key] ?? ''}
              onValueChange={(v) => setSelectValues((s) => ({ ...s, [f.key]: v ?? '' }))}
            >
              <SelectTrigger className="h-7 w-32 text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {f.type === 'photo' && (
            <span className="text-xs text-muted-foreground italic">photo (not editable)</span>
          )}
        </TableCell>
      ))}
      <TableCell>
        <form onSubmit={handleSave} className="flex items-center gap-1">
          {error && <span className="text-xs text-destructive mr-1">{error}</span>}
          <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-green-600" disabled={pending}>
            <CheckIcon className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onCancel} disabled={pending}>
            <XIcon className="size-3.5" />
          </Button>
        </form>
      </TableCell>
    </TableRow>
  )
}

// ----------------------------------------------------------------
// Main component
// ----------------------------------------------------------------

export function EntryList({ moduleId, fields, entries, readOnly = false }: Props) {
  const [, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {readOnly
          ? 'No computed values yet — log data in the source trackers.'
          : 'No entries yet. Log your first one above.'}
      </p>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {fields.map((f) => (
              <TableHead key={f.key}>{f.label}</TableHead>
            ))}
            {!readOnly && <TableHead className="w-16" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) =>
            !readOnly && editingId === entry.id ? (
              <EditRow
                key={entry.id}
                entry={entry}
                fields={fields}
                moduleId={moduleId}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground">{entry.entry_date}</TableCell>
                {fields.map((f) => (
                  <TableCell key={f.key}>
                    {formatValue((entry.values as Record<string, unknown>)[f.key], f)}
                  </TableCell>
                ))}
                {!readOnly && (
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground h-7 w-7"
                        onClick={() => setEditingId(entry.id)}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground h-7 w-7"
                        onClick={() => {
                          if (!confirm('Delete this entry?')) return
                          startTransition(() => deleteEntry(entry.id, moduleId))
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
    </div>
  )
}
