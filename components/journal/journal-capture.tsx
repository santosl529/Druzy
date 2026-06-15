'use client'

import { useState, useRef, useTransition, useCallback, useMemo, useEffect } from 'react'
import {
  Camera,
  X,
  Loader2,
  PlusIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { createJournalEntry } from '@/app/actions/journal'
import { transcribeJournal, OllamaError } from '@/lib/ollama'
import type { JournalField, JournalTemplate, TrackerModule } from '@/lib/types'

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ----------------------------------------------------------------
// Field editors (text / list / number)
// ----------------------------------------------------------------

interface FieldEditorProps {
  field: JournalField
  value: unknown
  onChange: (key: string, value: unknown) => void
}

function FieldEditor({ field, value, onChange }: FieldEditorProps) {
  if (field.type === 'number') {
    return (
      <Input
        type="number"
        step="0.1"
        placeholder="0"
        value={value != null ? String(value) : ''}
        onChange={(e) => onChange(field.key, e.target.value !== '' ? Number(e.target.value) : null)}
        className="h-8 w-36 text-sm"
      />
    )
  }

  if (field.type === 'list') {
    const items = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => {
                const next = [...items]
                next[idx] = e.target.value
                onChange(field.key, next)
              }}
              className="h-8 text-sm flex-1"
              placeholder={`Item ${idx + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              onClick={() => onChange(field.key, items.filter((_, i) => i !== idx))}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={() => onChange(field.key, [...items, ''])}
        >
          <PlusIcon className="h-3 w-3" />
          Add item
        </Button>
      </div>
    )
  }

  // text
  return (
    <Input
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(field.key, e.target.value)}
      className="h-8 text-sm"
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
}

export function JournalCapture({ template, trackerModules, onSaved }: JournalCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Photos ──────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<Array<{ preview: string; base64: string }>>([])

  // ── Transcription state ─────────────────────────────────────────
  const [date, setDate] = useState(todayStr())
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)
  const [transcription, setTranscription] = useState('')
  const [extracted, setExtracted] = useState<Record<string, unknown>>({})
  const [hasResult, setHasResult] = useState(false)
  const [showTranscription, setShowTranscription] = useState(false)

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
    try {
      const result = await transcribeJournal({
        images: photos.map((p) => p.base64),
        fields,
      })
      setTranscription(result.transcription)
      setExtracted(result.extracted)
      setHasResult(true)
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
      <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
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
      // Reset
      setPhotos([])
      setTranscription('')
      setExtracted({})
      setHasResult(false)
      setDate(todayStr())
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
    setSaveError(null)
    setSavedModules(null)
    setDate(todayStr())
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Date */}
      <div className="flex items-center gap-3">
        <Label htmlFor="journal-date" className="text-sm shrink-0">Entry date</Label>
        <Input
          id="journal-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 w-40 text-sm"
        />
      </div>

      {/* Photo picker */}
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
        />

        {photos.length === 0 ? (
          <Button
            variant="outline"
            className="w-full h-24 border-dashed flex-col gap-2"
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Add journal page photo(s)
            </span>
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {photos.map((p, idx) => (
                <div key={idx} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.preview}
                    alt={`Page ${idx + 1}`}
                    className="h-24 w-24 object-cover rounded-md border"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute -top-1.5 -right-1.5 h-5 w-5"
                    onClick={() => removePhoto(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <button
                type="button"
                className="h-24 w-24 rounded-md border border-dashed flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                onClick={() => inputRef.current?.click()}
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Transcribe button — shown before result */}
            {!hasResult && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTranscribe}
                disabled={transcribing || photos.length === 0}
                className="gap-1.5"
              >
                {transcribing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Transcribing…
                  </>
                ) : (
                  'Transcribe'
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {transcribeError && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 space-y-1.5">
          <p className="text-sm text-amber-700 font-medium">Transcription failed</p>
          <p className="text-xs text-amber-600">{transcribeError}</p>
          <p className="text-xs text-amber-600">
            You can still fill in the fields manually below.
          </p>
        </div>
      )}

      {/* Review section */}
      {hasResult && (
        <div className="space-y-5">
          <Separator />

          {/* Full transcription — collapsible */}
          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium hover:text-muted-foreground transition-colors"
              onClick={() => setShowTranscription((v) => !v)}
            >
              {showTranscription ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Full transcription
            </button>
            {showTranscription && (
              <textarea
                className="w-full text-sm font-mono bg-muted/40 rounded-md p-3 min-h-32 resize-y border-0 outline-none focus:ring-1 focus:ring-ring"
                value={transcription}
                onChange={(e) => setTranscription(e.target.value)}
                placeholder="(transcription will appear here)"
              />
            )}
          </div>

          {/* Extracted fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Extracted fields</h3>
            {fields.map((field) => {
              const moduleForField = trackerModules.find(
                (m) => m.id === field.targetModuleId
              )
              const trackerFieldLabel = moduleForField?.numericFields.find(
                (f) => f.key === field.targetFieldKey
              )?.label

              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm">{field.label}</Label>
                    {field.type === 'number' && field.targetModuleId && moduleForField && (
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
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
                        <span className="text-xs text-muted-foreground">
                          Log to {moduleForField.name}
                          {trackerFieldLabel ? ` → ${trackerFieldLabel}` : ''}
                        </span>
                      </label>
                    )}
                  </div>
                  <FieldEditor
                    field={field}
                    value={extracted[field.key]}
                    onChange={handleExtractedChange}
                  />
                </div>
              )
            })}
          </div>

          {/* Re-transcribe */}
          {photos.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTranscribe}
              disabled={transcribing}
              className="text-xs text-muted-foreground h-7 px-2"
            >
              {transcribing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Re-transcribe
            </Button>
          )}

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          {savedModules !== null && (
            <p className="text-sm text-green-600">
              Saved.
              {savedModules.length > 0
                ? ` Also logged to: ${savedModules.join(', ')}.`
                : ''}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isPending} size="sm">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save entry
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
