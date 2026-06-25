'use client'

import { useTransition, useState, useRef } from 'react'
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
import { createEntry } from '@/app/actions/entries'
import { clientToday } from '@/lib/date'
import type { ModuleField } from '@/lib/types'

interface Props {
  moduleId: string
  fields: ModuleField[]
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone?: string | null
  /**
   * Called after a successful entry, with the values the server parsed so the
   * caller can update optimistically. When provided (e.g. the quick-log modal),
   * the form does not reset — the caller closes the surface. When omitted
   * (module detail page), the form resets in place.
   */
  onSuccess?: (logged: { values: Record<string, unknown>; entryDate: string }) => void
  /** Override the submit button label (defaults to "Log entry"). */
  submitLabel?: string
}

export function EntryForm({ moduleId, fields, savedTimezone, onSuccess, submitLabel }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectValues, setSelectValues] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    // Inject select values (Base UI Select doesn't auto-submit in FormData)
    for (const [key, val] of Object.entries(selectValues)) {
      fd.set(key, val)
    }
    startTransition(async () => {
      const result = await createEntry(moduleId, fields, fd)
      if ('error' in result) {
        setError(result.error)
      } else if (onSuccess) {
        onSuccess(result)
      } else {
        formRef.current?.reset()
        setSelectValues({})
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="entry_date">Date</Label>
          <Input
            id="entry_date"
            name="entry_date"
            type="date"
            defaultValue={clientToday(savedTimezone)}
          />
        </div>

        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {field.type === 'text' && (
              <Input id={field.key} name={field.key} required={field.required} />
            )}

            {field.type === 'number' && (
              <div className="flex items-center gap-2">
                <Input
                  id={field.key}
                  name={field.key}
                  type="number"
                  step="any"
                  placeholder={field.unit ? `0 ${field.unit}` : undefined}
                  required={field.required}
                />
                {field.unit && (
                  <span className="text-sm text-muted-foreground shrink-0">{field.unit}</span>
                )}
              </div>
            )}

            {field.type === 'rating' && (
              <Input
                id={field.key}
                name={field.key}
                type="number"
                min={1}
                max={5}
                step={1}
                placeholder="1–5"
                required={field.required}
              />
            )}

            {field.type === 'date' && (
              <Input id={field.key} name={field.key} type="date" required={field.required} />
            )}

            {field.type === 'boolean' && (
              <div className="flex items-center gap-2 h-8">
                <Checkbox id={field.key} name={field.key} />
                <Label htmlFor={field.key} className="font-normal cursor-pointer">
                  Yes
                </Label>
              </div>
            )}

            {field.type === 'select' && (
              <Select
                value={selectValues[field.key] ?? ''}
                onValueChange={(v) => setSelectValues((s) => ({ ...s, [field.key]: v ?? '' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.type === 'photo' && (
              <Input id={field.key} name={field.key} type="file" accept="image/*" />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : (submitLabel ?? 'Log entry')}
      </Button>
    </form>
  )
}
