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

  // Fully controlled state for every field. The inputs live in sibling table
  // cells (not inside the <form>), so we can't rely on FormData reading the DOM —
  // we build the FormData manually from this state on save.
  const [entryDate, setEntryDate] = useState(entry.entry_date)
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial = entry.values as Record<string, unknown>
    const vals: Record<string, unknown> = {}
    for (const f of fields) vals[f.key] = initial[f.key]
    return vals
  })

  function setField(key: string, val: unknown) {
    setValues((s) => ({ ...s, [key]: val }))
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const fd = new FormData()
    fd.set('entry_date', entryDate)
    for (const f of fields) {
      const val = values[f.key]
      if (f.type === 'boolean') {
        // Match the create path: checked -> 'on', unchecked -> omitted (false).
        if (val === true) fd.set(f.key, 'on')
      } else if (val !== null && val !== undefined) {
        fd.set(f.key, String(val))
      } else {
        fd.set(f.key, '')
      }
    }

    startTransition(async () => {
      const result = await updateEntry(entry.id, moduleId, fields, fd)
      if (result?.error) {
        setError(result.error)
      } else {
        onCancel()
      }
    })
  }

  return (
    <TableRow className="bg-muted/30">
      <TableCell>
        <Input
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="h-7 w-32 text-sm"
        />
      </TableCell>
      {fields.map((f) => (
        <TableCell key={f.key} className="py-1">
          {f.type === 'text' && (
            <Input
              value={String(values[f.key] ?? '')}
              onChange={(e) => setField(f.key, e.target.value)}
              className="h-7 text-sm"
            />
          )}
          {(f.type === 'number' || f.type === 'rating') && (
            <Input
              type="number"
              step={f.type === 'rating' ? '1' : 'any'}
              min={f.type === 'rating' ? 1 : undefined}
              max={f.type === 'rating' ? 5 : undefined}
              value={values[f.key] !== null && values[f.key] !== undefined ? String(values[f.key]) : ''}
              onChange={(e) => setField(f.key, e.target.value)}
              className="h-7 w-24 text-sm"
            />
          )}
          {f.type === 'date' && (
            <Input
              type="date"
              value={String(values[f.key] ?? '')}
              onChange={(e) => setField(f.key, e.target.value)}
              className="h-7 text-sm"
            />
          )}
          {f.type === 'boolean' && (
            <Checkbox
              checked={values[f.key] === true}
              onCheckedChange={(v) => setField(f.key, v === true)}
            />
          )}
          {f.type === 'select' && (
            <Select
              value={String(values[f.key] ?? '')}
              onValueChange={(v) => setField(f.key, v ?? '')}
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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)

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
    <div className="rounded-lg border overflow-x-auto">
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
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground h-7 w-7"
                        disabled={deletingId === entry.id}
                        onClick={() => setEditingId(entry.id)}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground h-7 w-7"
                        disabled={deletingId === entry.id}
                        onClick={() => {
                          if (!confirm('Delete this entry?')) return
                          setDeleteError(null)
                          setDeletingId(entry.id)
                          startTransition(async () => {
                            try {
                              const result = await deleteEntry(entry.id, moduleId)
                              if (result?.error) {
                                setDeleteError({ id: entry.id, message: result.error })
                              }
                            } catch {
                              setDeleteError({ id: entry.id, message: 'Something went wrong. Try again.' })
                            } finally {
                              setDeletingId(null)
                            }
                          })
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                      {deleteError?.id === entry.id && (
                        <span className="text-xs text-destructive">{deleteError.message}</span>
                      )}
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
