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
import { formatFieldValue as formatValue } from '@/lib/format-entry'
import { formatDisplayDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { Entry, ModuleField } from '@/lib/types'

interface Props {
  moduleId: string
  fields: ModuleField[]
  entries: Entry[]
  /** Hides edit/delete actions — used for computed (formula) values. */
  readOnly?: boolean
  /** Renders the list as a titled card (module detail page). */
  title?: string
  /** Today (YYYY-MM-DD); older dates render muted. */
  today?: string
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

/**
 * Rows rendered initially and added per "Show more". Long histories otherwise
 * render thousands of DOM nodes (two icon buttons per row) on every page load.
 */
const PAGE_SIZE = 50

export function EntryList({ moduleId, fields, entries, readOnly = false, title, today }: Props) {
  const [, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const header = title && (
    <div className="flex items-center justify-between px-[22px] py-4">
      <h2 className="font-heading text-[0.95rem] font-semibold">{title}</h2>
      <span className="text-xs text-muted-foreground">
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
      </span>
    </div>
  )

  if (entries.length === 0) {
    const empty = (
      <p className="text-sm text-muted-foreground text-center py-8">
        {readOnly
          ? 'No computed values yet — log data in the source trackers.'
          : 'No entries yet. Log your first one above.'}
      </p>
    )
    return title ? <section className="rounded-2xl border bg-card">{header}{empty}</section> : empty
  }

  return (
    <section className={cn('border bg-card overflow-hidden', title ? 'rounded-2xl' : 'rounded-lg')}>
      {header}
      <Table>
        <TableHeader className={cn(title && 'border-t')}>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-[22px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Date</TableHead>
            {fields.map((f) => (
              <TableHead key={f.key} className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {f.label}
              </TableHead>
            ))}
            {!readOnly && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.slice(0, visibleCount).map((entry) =>
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
                <TableCell className={cn('pl-[22px] py-3', today && entry.entry_date !== today && 'text-muted-foreground')}>
                  {formatDisplayDate(entry.entry_date, { month: 'short', day: 'numeric', year: entry.entry_date.slice(0, 4) === (today ?? '').slice(0, 4) ? undefined : 'numeric' })}
                </TableCell>
                {fields.map((f) => (
                  <TableCell key={f.key} className="py-3 tabular-nums">
                    {formatValue((entry.values as Record<string, unknown>)[f.key], f)}
                  </TableCell>
                ))}
                {!readOnly && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1 pr-2">
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
      {entries.length > visibleCount && (
        <div className="flex items-center justify-center gap-3 border-t p-2">
          <span className="text-xs text-muted-foreground">
            Showing {visibleCount} of {entries.length}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Show more
          </Button>
        </div>
      )}
    </section>
  )
}
