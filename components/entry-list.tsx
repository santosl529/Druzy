'use client'

import { useTransition } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { deleteEntry } from '@/app/actions/entries'
import type { Entry, ModuleField } from '@/lib/types'

interface Props {
  moduleId: string
  fields: ModuleField[]
  entries: Entry[]
}

function formatValue(value: unknown, type: ModuleField['type']): string {
  if (value === null || value === undefined) return '—'
  if (type === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function EntryList({ moduleId, fields, entries }: Props) {
  const [, startTransition] = useTransition()

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No entries yet. Log your first one above.
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
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground">{entry.entry_date}</TableCell>
              {fields.map((f) => (
                <TableCell key={f.key}>
                  {formatValue((entry.values as Record<string, unknown>)[f.key], f.type)}
                </TableCell>
              ))}
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground h-7 w-7"
                  onClick={() =>
                    startTransition(() => deleteEntry(entry.id, moduleId))
                  }
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
