'use client'

import { useState, useRef, useTransition, useCallback, useMemo, useEffect } from 'react'
import { Camera, X, Loader2, ChevronDown, ChevronUp, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { createJournalEntry } from '@/app/actions/journal'
import { transcribeJournal, OllamaError } from '@/lib/ollama'
import { clientToday, formatDisplayDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { JournalField, JournalTemplate, TrackerModule } from '@/lib/types'

// ----------------------------------------------------------------
// Field editors (text / list / number)
// ----------------------------------------------------------------

interface FieldEditorProps {
  field: JournalField
  value: unknown
  onChange: (key: string, value: unknown) => void
}

function FieldEditor({ field, value, onChange }: FieldEditorProps) {
  const inputClass = 'bg-background dark:bg-background'
  if (field.type === 'number') {
    return (
      <Input
        id={`journal-${field.key}`}
        type="number"
        step="0.1"
        placeholder="0"
        value={value != null ? String(value) : ''}
        onChange={(e) => onChange(field.key, e.target.value !== '' ? Number(e.target.value) : null)}
        className={cn(inputClass, 'h-11 font-heading text-lg md:text-lg font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none')}
      />
    )
  }

  if (field.type === 'list') {
    const items = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2.5 rounded-lg border bg-background pl-2.5 pr-1 focus-within:border-ring">
            <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45" style={{ background: 'var(--crystal-primary)' }} />
            <input
              value={item}
              onChange={(e) => {
                const next = [...items]
                next[idx] = e.target.value
                onChange(field.key, next)
              }}
              className="flex-1 min-w-0 bg-transparent py-2 text-sm outline-none"
              placeholder={`Item ${idx + 1}`}
              aria-label={`${field.label} item ${idx + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => onChange(field.key, items.filter((_, i) => i !== idx))}
              aria-label="Remove item"
            >
              <X />
            </Button>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-[0.8rem] font-medium text-accent-text hover:underline"
          onClick={() => onChange(field.key, [...items, ''])}
        >
          + Add item
        </button>
      </div>
    )
  }

  // text
  return (
    <Input
      id={`journal-${field.key}`}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(field.key, e.target.value)}
      className={cn(inputClass, 'h-10')}
      placeholder="—"
    />
  )
}

// ----------------------------------------------------------------
// Main component
// ----------------------------------------------------------------

interface JournalCaptureProps {
  template: JournalTemplate | null
  trackerModules: TrackerModule[]
  onSaved?: () => void
  /** Day-boundary timezone from Settings (null = fall back to browser tz). */
  savedTimezone?: string | null
}

export function JournalCapture({ template, trackerModules, onSaved, savedTimezone }: JournalCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Photos ──────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<Array<{ preview: string; base64: string }>>([])

  // ── Transcription state ─────────────────────────────────────────
  const [date, setDate] = useState(() => clientToday(savedTimezone))
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)
  const [transcription, setTranscription] = useState('')
  const [extracted, setExtracted] = useState<Record<string, unknown>>({})
  const [hasResult, setHasResult] = useState(false)
  const [showTranscription, setShowTranscription] = useState(false)
  const [tookSeconds, setTookSeconds] = useState<number | null>(null)

  // ── Tracker enable toggles ──────────────────────────────────────
  const mappedModuleIds = Array.from(
    new Set(
      (template?.fields ?? [])
        .filter((f) => f.type === 'number' && f.targetModuleId)
        .map((f) => f.targetModuleId!)
    )
  )
  const [enabledModuleIds, setEnabledModuleIds] = useState<Set<string>>(
    new Set(mappedModuleIds)
  )

  // ── Save ────────────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedModules, setSavedModules] = useState<string[] | null>(null)
  const [failedModules, setFailedModules] = useState<{ name: string; error: string }[]>([])

  // fields derived before any early return so hooks below are not conditional
  const fields = useMemo(() => template?.fields ?? [], [template])

  // Keep a ref pointing at the latest photos array so the unmount cleanup
  // can revoke any remaining object URLs without stale-closure issues.
  const photosRef = useRef(photos)
  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  // ── Transcription ───────────────────────────────────────────────
  const handleTranscribe = useCallback(async () => {
    if (photos.length === 0) return
    setTranscribeError(null)
    setTranscribing(true)
    const started = performance.now()
    try {
      const result = await transcribeJournal({
        images: photos.map((p) => p.base64),
        fields,
      })
      setTranscription(result.transcription)
      setExtracted(result.extracted)
      setHasResult(true)
      setTookSeconds(Math.round((performance.now() - started) / 1000))
    } catch (err) {
      if (err instanceof OllamaError) {
        setTranscribeError(err.message)
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setTranscribeError('Transcription failed unexpectedly.')
      }
      // Even on error, show the review UI so user can enter values manually
      setHasResult(true)
    } finally {
      setTranscribing(false)
    }
  }, [photos, fields])

  // ── No template state ───────────────────────────────────────────
  if (!template || template.fields.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          No extraction template configured yet.
        </p>
        <a
          href="/journal/template"
          className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Set up template →
        </a>
      </div>
    )
  }

  // ── Photo handlers ──────────────────────────────────────────────
  function handleFilesSelected(files: FileList) {
    Array.from(files).forEach((file) => {
      const preview = URL.createObjectURL(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        if (!dataUrl || !dataUrl.includes(',')) {
          URL.revokeObjectURL(preview)
          return
        }
        const base64 = dataUrl.split(',')[1]
        setPhotos((p) => [...p, { preview, base64 }])
      }
      reader.onerror = () => {
        URL.revokeObjectURL(preview)
      }
      reader.readAsDataURL(file)
    })
  }

  function removePhoto(idx: number) {
    setPhotos((p) => {
      URL.revokeObjectURL(p[idx].preview)
      return p.filter((_, i) => i !== idx)
    })
  }

  function handleExtractedChange(key: string, value: unknown) {
    setExtracted((prev) => ({ ...prev, [key]: value }))
  }

  // ── Save ────────────────────────────────────────────────────────
  function handleSave() {
    setSaveError(null)
    setSavedModules(null)
    setFailedModules([])
    startTransition(async () => {
      const result = await createJournalEntry({
        entry_date: date,
        transcription: transcription || undefined,
        extracted,
        enabledModuleIds: Array.from(enabledModuleIds),
      })
      if (result.error) {
        setSaveError(result.error)
        return
      }
      setSavedModules(result.loggedModules ?? [])
      setFailedModules(result.failedModules ?? [])
      // Reset
      setPhotos([])
      setTranscription('')
      setExtracted({})
      setHasResult(false)
      setTookSeconds(null)
      setDate(clientToday(savedTimezone))
      setEnabledModuleIds(new Set(mappedModuleIds))
      onSaved?.()
    })
  }

  function handleDiscard() {
    photos.forEach((p) => URL.revokeObjectURL(p.preview))
    setPhotos([])
    setTranscription('')
    setExtracted({})
    setHasResult(false)
    setTranscribeError(null)
    setTookSeconds(null)
    setSaveError(null)
    setSavedModules(null)
    setFailedModules([])
    setDate(clientToday(savedTimezone))
  }

  // ── Render ──────────────────────────────────────────────────────
  const filledCount = fields.filter((f) => {
    const v = extracted[f.key]
    return v !== null && v !== undefined && v !== '' && (!Array.isArray(v) || v.some((x) => x !== ''))
  }).length
  const trackerLogs = new Set(
    fields
      .filter((f) => f.type === 'number' && f.targetModuleId && enabledModuleIds.has(f.targetModuleId) && extracted[f.key] != null)
      .map((f) => f.targetModuleId!),
  ).size
  const canSave = filledCount > 0 || transcription.trim() !== ''
  const today = clientToday(savedTimezone)
  const numberFields = fields.filter((f) => f.type === 'number')
  const otherFields = fields.filter((f) => f.type !== 'number')

  return (
    <div className="flex flex-col gap-3">
      {savedModules !== null && (
        <p className="rounded-xl border bg-card px-4 py-2.5 text-sm">
          Saved.
          {savedModules.length > 0 ? ` Also logged to ${savedModules.join(', ')}.` : ''}
        </p>
      )}
      {failedModules.map((f, i) => (
        <p key={`${f.name}-${i}`} className="text-sm text-destructive">
          Couldn&apos;t log to {f.name}: {f.error}
        </p>
      ))}

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        {/* Pages */}
        <section className="rounded-2xl border bg-card p-[18px] flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-base font-semibold">Pages</h2>
            <label className="relative rounded-full border px-2.5 py-0.5 text-xs text-foreground/80 cursor-pointer hover:bg-muted/60">
              {date === today ? 'Today' : formatDisplayDate(date, { month: 'short', day: 'numeric' })} ▾
              <input
                id="journal-date"
                type="date"
                aria-label="Entry date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFilesSelected(e.target.files)
              e.target.value = ''
            }}
          />

          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {photos.map((p, idx) => (
                <div key={idx} className="relative h-[200px] rounded-[10px] border overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={`Page ${idx + 1}`} className="size-full object-cover" />
                  <span className="absolute left-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white">
                    page {idx + 1}
                  </span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    className="absolute top-1.5 right-1.5"
                    onClick={() => removePhoto(idx)}
                    aria-label={`Remove page ${idx + 1}`}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'rounded-[10px] border border-dashed border-foreground/20 text-[0.8rem] font-medium text-accent-text hover:bg-muted/40 transition-colors',
              photos.length === 0 ? 'h-[200px] flex flex-col items-center justify-center gap-2' : 'py-2.5',
            )}
          >
            {photos.length === 0 && <Camera className="size-6 text-muted-foreground" />}
            {photos.length === 0 ? 'Add a photo of a journal page' : '+ Add page'}
          </button>

          <Button
            variant="outline"
            className="h-[38px]"
            onClick={handleTranscribe}
            disabled={transcribing || photos.length === 0}
          >
            {transcribing ? (
              <><Loader2 className="animate-spin" /> Transcribing…</>
            ) : hasResult ? (
              <><RotateCw /> Transcribe again</>
            ) : (
              'Transcribe'
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            {tookSeconds !== null ? `Transcribed in ${tookSeconds} s · ` : ''}
            Photos stay in this browser tab and are never uploaded.
          </p>
          {transcribeError && (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium">Transcription failed</p>
              <p>{transcribeError}</p>
              <p>You can still fill in the fields by hand.</p>
            </div>
          )}
        </section>

        {/* Review */}
        <section
          className="rounded-2xl border bg-card px-[22px] py-5 flex flex-col gap-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--border), var(--crystal-primary) 45%)',
            boxShadow: '0 0 28px color-mix(in srgb, var(--crystal-glow) 8%, transparent)',
          }}
        >
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="font-heading text-base font-semibold">Review</h2>
            <span className="text-xs text-muted-foreground">
              {fields.length} {fields.length === 1 ? 'field' : 'fields'} from your template ·{' '}
              {hasResult ? 'edit anything' : 'transcribe a page or type them in'}
            </span>
          </div>

          {otherFields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`journal-${field.key}`} className="text-xs font-normal text-muted-foreground">
                {field.label} · {field.type}
              </Label>
              <FieldEditor field={field} value={extracted[field.key]} onChange={handleExtractedChange} />
            </div>
          ))}

          {numberFields.length > 0 && (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {numberFields.map((field) => {
                const moduleForField = trackerModules.find((m) => m.id === field.targetModuleId)
                const trackerFieldLabel = moduleForField?.numericFields.find((f) => f.key === field.targetFieldKey)?.label
                const v = extracted[field.key]
                return (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`journal-${field.key}`} className="text-xs font-normal text-muted-foreground">
                      {field.label} · number
                    </Label>
                    <FieldEditor field={field} value={v} onChange={handleExtractedChange} />
                    {field.targetModuleId && moduleForField ? (
                      <label className="flex items-center gap-2 text-[0.8rem] mt-0.5 cursor-pointer select-none">
                        <Checkbox
                          checked={enabledModuleIds.has(field.targetModuleId)}
                          onCheckedChange={(checked) => {
                            setEnabledModuleIds((prev) => {
                              const next = new Set(prev)
                              if (checked) next.add(field.targetModuleId!)
                              else next.delete(field.targetModuleId!)
                              return next
                            })
                          }}
                        />
                        <span>
                          Also log{v != null ? ` ${v}` : ''} to{' '}
                          <span className="font-medium">
                            {moduleForField.name}
                            {trackerFieldLabel ? ` · ${trackerFieldLabel}` : ''}
                          </span>
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs text-muted-foreground mt-0.5">Not linked to a tracker</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="rounded-[10px] border overflow-hidden">
            <button
              type="button"
              aria-expanded={showTranscription}
              onClick={() => setShowTranscription((v) => !v)}
              className="w-full flex items-center justify-between bg-muted/40 px-3.5 py-2.5 text-[0.8rem] font-medium"
            >
              Full transcription
              {showTranscription ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
            </button>
            {showTranscription && (
              <textarea
                className="block w-full border-t bg-transparent px-3.5 py-3 font-mono text-[0.8rem] leading-relaxed text-foreground/85 min-h-32 resize-y outline-none"
                value={transcription}
                onChange={(e) => setTranscription(e.target.value)}
                placeholder="(the transcription appears here)"
                aria-label="Full transcription"
              />
            )}
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-auto text-xs text-muted-foreground">
              Saves {transcription.trim() ? 'the text and ' : ''}
              {filledCount} {filledCount === 1 ? 'field' : 'fields'}
              {trackerLogs > 0 ? `, and logs ${trackerLogs} tracker ${trackerLogs === 1 ? 'entry' : 'entries'}` : ''}
            </span>
            <Button variant="ghost" className="h-9" onClick={handleDiscard} disabled={isPending}>
              Discard
            </Button>
            <Button className="h-9 px-4" onClick={handleSave} disabled={isPending || !canSave}>
              {isPending && <Loader2 className="animate-spin" />}
              Save entry
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
