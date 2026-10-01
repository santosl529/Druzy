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
import { DateChips } from '@/components/date-chips'
import { createEntry } from '@/app/actions/entries'
import { clientToday } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { ModuleField } from '@/lib/types'

/** Raw, unsubmitted field values keyed by field key (strings as typed). */
export type EntryDraft = Record<string, string>

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
  /**
   * `grid` (default): two-column fields with actions below — the quick-log dialog.
   * `bar`: a full-width log bar with large inputs and the submit button inline —
   * the module detail page.
   */
  layout?: 'grid' | 'bar'
  /** Heading shown beside the date chips in the `bar` layout. */
  title?: string
  /** Shows a Cancel button (and the keyboard hint) when provided. */
  onCancel?: () => void
  /** Fires as the user types or changes the date, with the current raw values (for live previews). */
  onDraftChange?: (draft: EntryDraft, entryDate: string) => void
  /** Rendered between the fields and the actions (grid) or under the bar. */
  preview?: React.ReactNode
  /** Pre-selected entry date (YYYY-MM-DD); defaults to today. */
  initialDate?: string
}

// Inputs pick up the surrounding accent (--chip-accent) on focus, so the
// quick-log dialog glows in the tracker's crystal and the detail page in violet.
const accentFocus =
  'focus-visible:border-[var(--chip-accent,var(--ring))] focus-visible:ring-[color-mix(in_oklch,var(--chip-accent,var(--ring))_30%,transparent)]'

export function EntryForm({
  moduleId,
  fields,
  savedTimezone,
  onSuccess,
  submitLabel,
  layout = 'grid',
  title,
  onCancel,
  onDraftChange,
  preview,
  initialDate,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectValues, setSelectValues] = useState<Record<string, string>>({})
  const [today] = useState(() => clientToday(savedTimezone))
  const [entryDate, setEntryDate] = useState(initialDate ?? today)
  const formRef = useRef<HTMLFormElement>(null)
  const isBar = layout === 'bar'

  function readDraft(form: HTMLFormElement): EntryDraft {
    const draft: EntryDraft = {}
    const fd = new FormData(form)
    for (const f of fields) {
      const v = fd.get(f.key)
      if (typeof v === 'string') draft[f.key] = v
    }
    return { ...draft, ...selectValues }
  }

  function changeDate(date: string) {
    setEntryDate(date)
    if (formRef.current) onDraftChange?.(readDraft(formRef.current), date)
  }

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
        setEntryDate(today)
        onDraftChange?.({}, today)
      }
    })
  }

  const inputClass = cn(
    accentFocus,
    'bg-background dark:bg-background',
    isBar ? 'h-[52px] rounded-[10px] px-3.5 font-heading text-[1.35rem] md:text-[1.35rem] font-semibold' : 'h-10 px-3 text-[0.95rem] md:text-[0.95rem]',
  )

  function renderField(field: ModuleField) {
    const unit = field.type === 'number' ? field.unit : field.type === 'rating' ? '/ 5' : undefined
    return (
      <div key={field.key} className={cn('flex flex-col gap-1.5 min-w-0', isBar && 'flex-1 basis-[150px]')}>
        <Label
          htmlFor={field.key}
          className={cn(isBar ? 'text-xs font-normal text-muted-foreground' : 'text-[0.8rem]')}
        >
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>

        {field.type === 'text' && (
          <Input id={field.key} name={field.key} required={field.required} className={inputClass} />
        )}

        {(field.type === 'number' || field.type === 'rating') && (
          <div className="relative">
            <Input
              id={field.key}
              name={field.key}
              type="number"
              inputMode="decimal"
              step={field.type === 'rating' ? 1 : 'any'}
              min={field.type === 'rating' ? 1 : undefined}
              max={field.type === 'rating' ? 5 : undefined}
              placeholder="0"
              required={field.required}
              className={cn(inputClass, 'tabular-nums placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', unit && 'pr-12')}
            />
            {unit && (
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.8rem] text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
        )}

        {field.type === 'date' && (
          <Input id={field.key} name={field.key} type="date" required={field.required} className={inputClass} />
        )}

        {field.type === 'boolean' && (
          <div className={cn('flex items-center gap-2', isBar ? 'h-[52px]' : 'h-10')}>
            <Checkbox id={field.key} name={field.key} />
            <Label htmlFor={field.key} className="font-normal cursor-pointer">
              Yes
            </Label>
          </div>
        )}

        {field.type === 'select' && (
          <Select
            value={selectValues[field.key] ?? ''}
            onValueChange={(v) => {
              const next = { ...selectValues, [field.key]: v ?? '' }
              setSelectValues(next)
              if (formRef.current) onDraftChange?.({ ...readDraft(formRef.current), ...next }, entryDate)
            }}
          >
            <SelectTrigger className={cn('w-full', isBar ? 'h-[52px]!' : 'h-10!')}>
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
          <Input id={field.key} name={field.key} type="file" accept="image/*" className={cn(inputClass, 'font-sans text-sm md:text-sm font-normal pt-2.5')} />
        )}
      </div>
    )
  }

  const submitButton = (
    <Button
      type="submit"
      disabled={pending}
      className={cn(
        'font-semibold bg-[var(--chip-accent,var(--primary))] text-[var(--chip-accent-fg,var(--primary-foreground))] hover:bg-[color-mix(in_oklch,var(--chip-accent,var(--primary))_85%,transparent)]',
        isBar ? 'h-[52px] rounded-[10px] px-6 text-[0.95rem]' : 'h-9 px-4',
      )}
    >
      {pending ? 'Saving…' : (submitLabel ?? 'Log entry')}
    </Button>
  )

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onInput={(e) => onDraftChange?.(readDraft(e.currentTarget), entryDate)}
      className={cn('flex flex-col', isBar ? 'gap-4' : 'gap-5')}
    >
      {isBar ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-heading text-base font-semibold">{title}</h2>}
          <DateChips today={today} value={entryDate} onChange={changeDate} name="entry_date" />
        </div>
      ) : (
        <DateChips today={today} value={entryDate} onChange={changeDate} name="entry_date" />
      )}

      {isBar ? (
        <div className="flex flex-wrap gap-3.5 items-end">
          {fields.map(renderField)}
          {submitButton}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">{fields.map(renderField)}</div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {preview}

      {!isBar && (
        <div className="flex items-center justify-end gap-2.5">
          {onCancel && (
            <span className="mr-auto hidden sm:block font-mono text-xs text-muted-foreground">
              ↵ to log · esc to close
            </span>
          )}
          {onCancel && (
            <Button type="button" variant="ghost" className="h-9 px-3.5" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {submitButton}
        </div>
      )}
    </form>
  )
}
