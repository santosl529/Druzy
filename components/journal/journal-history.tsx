'use client'

import { useState, useTransition } from 'react'
import { Trash2Icon, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteJournalEntry } from '@/app/actions/journal'
import { formatDisplayDate } from '@/lib/date'
import type { JournalEntry, JournalTemplate } from '@/lib/types'

function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ')
  return String(value)
}

interface EntryRowProps {
  entry: JournalEntry
  template: JournalTemplate | null
  onDeleted: (id: string) => void
}

function EntryRow({ entry, template, onDeleted }: EntryRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fields = template?.fields ?? []
  const extracted = entry.extracted as Record<string, unknown>

  // Collect non-empty field values for the summary line.
  const fieldSummary = fields
    .filter((f) => {
      const v = extracted[f.key]
      return v !== null && v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0)
    })
    .slice(0, 4)

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    startTransition(async () => {
      await deleteJournalEntry(entry.id)
      onDeleted(entry.id)
    })
  }

  return (
    <div className="rounded-lg border">
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="flex-1 flex items-center gap-3 text-left min-w-0"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-heading text-sm font-medium shrink-0">{formatDisplayDate(entry.entry_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {!expanded && fieldSummary.length > 0 && (
            <span className="text-xs text-muted-foreground truncate">
              {fieldSummary
                .map((f) => `${f.label}: ${renderFieldValue(extracted[f.key])}`)
                .join(' · ')}
            </span>
          )}
        </button>

        {confirmDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-destructive">Delete?</span>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-xs px-2"
              onClick={handleDelete}
              disabled={isPending}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-4 pt-1 space-y-4 border-t">
          {/* Extracted fields */}
          {fields.length > 0 && (
            <div className="space-y-2">
              {fields.map((field) => {
                const v = extracted[field.key]
                return (
                  <div key={field.key} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground shrink-0 min-w-[120px]">
                      {field.label}
                    </span>
                    <span>
                      {Array.isArray(v) ? (
                        v.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="list-disc list-inside space-y-0.5">
                            {(v as string[]).map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        )
                      ) : v !== null && v !== undefined && v !== '' ? (
                        String(v)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Full transcription */}
          {entry.transcription && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Transcription
              </p>
              <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3 font-mono">
                {entry.transcription}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface JournalHistoryProps {
  entries: JournalEntry[]
  template: JournalTemplate | null
}

export function JournalHistory({ entries, template }: JournalHistoryProps) {
  const [list, setList] = useState<JournalEntry[]>(entries)

  return (
    <div className="space-y-2">
      {list.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          template={template}
          onDeleted={(id) => setList((prev) => prev.filter((e) => e.id !== id))}
        />
      ))}
    </div>
  )
}
