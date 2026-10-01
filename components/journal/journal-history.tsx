'use client'

import { useState, useTransition } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteJournalEntry } from '@/app/actions/journal'
import { formatDisplayDate } from '@/lib/date'
import type { JournalEntry, JournalTemplate } from '@/lib/types'

/** One-line digest, e.g. '3 good things · “Long walk” · Hours slept 7.5'. */
function summarize(fields: JournalTemplate['fields'], extracted: Record<string, unknown>): string {
  const parts: string[] = []
  for (const f of fields) {
    const v = extracted[f.key]
    if (v === null || v === undefined || v === '') continue
    if (Array.isArray(v)) {
      const n = v.filter((x) => x !== '').length
      if (n) parts.push(`${n} ${f.label.toLowerCase()}`)
    } else if (f.type === 'text') parts.push(`“${String(v)}”`)
    else parts.push(`${f.label} ${String(v)}`)
  }
  return parts.join(' · ')
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

  const summary = summarize(fields, extracted)

  return (
    <div className="border-t">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] sm:grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-4 px-[22px] py-3 text-sm">
        <span className="text-muted-foreground">
          {formatDisplayDate(entry.entry_date, { month: 'short', day: 'numeric' })}
        </span>
        <span className="truncate">{summary || <span className="text-muted-foreground">Transcription only</span>}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-expanded={expanded}
            className="text-[0.8rem] text-accent-text hover:underline px-1"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : 'View'}
          </button>
          {confirmDelete ? (
            <>
              <span className="text-xs text-destructive ml-1">Delete?</span>
              <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={handleDelete} disabled={isPending}>
                Yes
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={handleDelete}
              disabled={isPending}
              aria-label="Delete entry"
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-[22px] pb-4 pt-1 space-y-4">
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
    <section className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-[22px] py-4">
        <h2 className="font-heading text-[0.95rem] font-semibold">Recent entries</h2>
        <span className="text-xs text-muted-foreground">
          {list.length} {list.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      {list.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          template={template}
          onDeleted={(id) => setList((prev) => prev.filter((e) => e.id !== id))}
        />
      ))}
    </section>
  )
}
