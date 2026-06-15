'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Camera, PenLine, Trash2, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createFoodEntry,
  createEntryInModule,
  deleteFoodEntry,
  updateFoodEntry,
} from '@/app/actions/food'
import type { FoodEntry, DailyTotals, MacroEstimate, TrackerModule } from '@/lib/types'

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function todayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Smart-match a module field to one of the four food macros.
 * Returns the matching macro value string, or '' if no match.
 */
function autoMatchField(
  key: string,
  label: string,
  macros: MacroValues
): string {
  const needle = `${key} ${label}`.toLowerCase()
  if (/calor|kcal/.test(needle)) return macros.calories
  if (/protein|prot/.test(needle)) return macros.protein_g
  if (/\bfat\b|lipid/.test(needle)) return macros.fat_g
  if (/carb/.test(needle)) return macros.carbs_g
  return ''
}

// ----------------------------------------------------------------
// Shared types
// ----------------------------------------------------------------

type MacroValues = {
  calories: string
  protein_g: string
  fat_g: string
  carbs_g: string
}

/** What the tracker log section exposes to the parent on save. */
interface TrackerSelection {
  moduleId: string
  fieldValues: Record<string, string>
}

// ----------------------------------------------------------------
// Macro input group
// ----------------------------------------------------------------

interface MacroFieldsProps {
  values: MacroValues
  onChange: (field: string, value: string) => void
  disabled?: boolean
}

function MacroFields({ values, onChange, disabled }: MacroFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(
        [
          { key: 'calories', label: 'Calories', unit: 'kcal' },
          { key: 'protein_g', label: 'Protein', unit: 'g' },
          { key: 'fat_g', label: 'Fat', unit: 'g' },
          { key: 'carbs_g', label: 'Carbs', unit: 'g' },
        ] as const
      ).map(({ key, label, unit }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={key} className="text-xs text-muted-foreground">
            {label} <span className="text-muted-foreground/60">({unit})</span>
          </Label>
          <Input
            id={key}
            type="number"
            min="0"
            step={key === 'calories' ? '1' : '0.1'}
            placeholder="0"
            value={values[key]}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={disabled}
            className="h-9"
          />
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------
// "Also log to tracker" collapsible section
// ----------------------------------------------------------------

interface TrackerLogSectionProps {
  macros: MacroValues
  modules: TrackerModule[]
  /** Called whenever the selection changes; null = section closed / no module selected. */
  onChange: (selection: TrackerSelection | null) => void
}

function TrackerLogSection({ macros, modules, onChange }: TrackerLogSectionProps) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})

  const selectedModule = modules.find((m) => m.id === selectedId) ?? null

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (!next) {
      setSelectedId('')
      setFieldValues({})
      onChange(null)
    }
  }

  const handleModuleChange = (moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    setSelectedId(moduleId)
    if (!mod) {
      setFieldValues({})
      onChange(null)
      return
    }
    const initial: Record<string, string> = {}
    for (const f of mod.numericFields) {
      initial[f.key] = autoMatchField(f.key, f.label, macros)
    }
    setFieldValues(initial)
    onChange({ moduleId: mod.id, fieldValues: initial })
  }

  const handleFieldChange = (key: string, value: string) => {
    const next = { ...fieldValues, [key]: value }
    setFieldValues(next)
    if (selectedModule) {
      onChange({ moduleId: selectedModule.id, fieldValues: next })
    }
  }

  if (modules.length === 0) return null

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors rounded-md"
        onClick={handleToggle}
      >
        <span className="text-muted-foreground">
          {open && selectedModule
            ? `Also logging to "${selectedModule.name}"`
            : 'Also log to a tracker (optional)'}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t pt-3">
          <Select value={selectedId} onValueChange={(v) => handleModuleChange(v ?? '')}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select a tracker…" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedModule && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Values are pre-filled from your food entry — adjust if needed.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selectedModule.numericFields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {f.label}
                      {f.unit && (
                        <span className="text-muted-foreground/60"> ({f.unit})</span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={fieldValues[f.key] ?? ''}
                      onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------
// Daily totals bar
// ----------------------------------------------------------------

function DailyTotalsBar({ totals }: { totals: DailyTotals }) {
  const items = [
    { label: 'Calories', value: Math.round(totals.calories), unit: 'kcal' },
    { label: 'Protein', value: Math.round(totals.protein_g * 10) / 10, unit: 'g' },
    { label: 'Fat', value: Math.round(totals.fat_g * 10) / 10, unit: 'g' },
    { label: 'Carbs', value: Math.round(totals.carbs_g * 10) / 10, unit: 'g' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ label, value, unit }) => (
        <div key={label} className="text-center rounded-lg bg-muted/50 px-3 py-3">
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {label} <span className="text-muted-foreground/60">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------
// Photo upload + analysis
// ----------------------------------------------------------------

interface PhotoUploaderProps {
  date: string
  trackerModules: TrackerModule[]
  onSaved: (entry: FoodEntry) => void
}

function PhotoUploader({ date, trackerModules, onSaved }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [context, setContext] = useState('')
  const [estimate, setEstimate] = useState<MacroEstimate | null>(null)
  const [macros, setMacros] = useState<MacroValues>({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [trackerSelection, setTrackerSelection] = useState<TrackerSelection | null>(null)
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleFileChange = useCallback((file: File) => {
    setAnalyzeError(null)
    setEstimate(null)
    setSaveError(null)
    setMacros({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })

    const url = URL.createObjectURL(file)
    setPreview(url)

    // Decode to base64 and store for later — analysis only runs when user clicks "Analyze"
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setImageBase64(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!imageBase64) return
    setAnalyzeError(null)
    setEstimate(null)
    setAnalyzing(true)
    try {
      const res = await fetch('/api/food/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64, context: context.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setAnalyzeError(data.error ?? 'Analysis failed. You can enter macros manually.')
      } else {
        setEstimate(data as MacroEstimate)
        setMacros({
          calories: String(data.calories),
          protein_g: String(data.protein_g),
          fat_g: String(data.fat_g),
          carbs_g: String(data.carbs_g),
        })
      }
    } catch {
      setAnalyzeError('Could not reach the analysis API. You can enter macros manually.')
    } finally {
      setAnalyzing(false)
    }
  }, [imageBase64, context])

  const handleSave = () => {
    setSaveError(null)
    startTransition(async () => {
      const [foodResult, trackerResult] = await Promise.all([
        createFoodEntry({
          entry_date: date,
          calories: macros.calories ? Number(macros.calories) : null,
          protein_g: macros.protein_g ? Number(macros.protein_g) : null,
          fat_g: macros.fat_g ? Number(macros.fat_g) : null,
          carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
          source: 'photo',
        }),
        trackerSelection
          ? createEntryInModule(
              trackerSelection.moduleId,
              date,
              Object.fromEntries(
                Object.entries(trackerSelection.fieldValues).map(([k, v]) => [
                  k,
                  v !== '' ? Number(v) : null,
                ])
              )
            )
          : Promise.resolve(null),
      ])

      if (foodResult.error) {
        setSaveError(foodResult.error)
        return
      }
      if (trackerResult && 'error' in trackerResult && trackerResult.error) {
        setSaveError(`Food saved, but tracker error: ${trackerResult.error}`)
      }

      onSaved({
        id: foodResult.id!,
        user_id: '',
        entry_date: date,
        calories: macros.calories ? Number(macros.calories) : null,
        protein_g: macros.protein_g ? Number(macros.protein_g) : null,
        fat_g: macros.fat_g ? Number(macros.fat_g) : null,
        carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
        source: 'photo',
        photo_path: null,
        created_at: new Date().toISOString(),
      })

      setPreview(null)
      setImageBase64(null)
      setContext('')
      setEstimate(null)
      setMacros({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })
      setTrackerSelection(null)
    })
  }

  const handleDiscard = () => {
    setPreview(null)
    setImageBase64(null)
    setContext('')
    setEstimate(null)
    setMacros({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })
    setAnalyzeError(null)
    setSaveError(null)
    setTrackerSelection(null)
  }

  if (!preview) {
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileChange(file)
          }}
        />
        <Button
          variant="outline"
          className="w-full h-24 border-dashed flex-col gap-2"
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Take or upload a food photo</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Food photo" className="rounded-lg w-full object-cover max-h-48" />
        <Button
          size="icon"
          variant="secondary"
          className="absolute top-2 right-2 h-7 w-7"
          onClick={handleDiscard}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Context input + Analyze button — shown before estimates */}
      <div className="space-y-2">
        <Label htmlFor="photo-context" className="text-xs text-muted-foreground">
          Context <span className="text-muted-foreground/60">(optional)</span>
        </Label>
        <Input
          id="photo-context"
          placeholder='e.g. "22 grams of salmon" or "plate is 12 inches wide"'
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={analyzing}
          className="h-9 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !analyzing && imageBase64) handleAnalyze()
          }}
        />
      </div>

      {!estimate && !analyzeError && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAnalyze}
          disabled={analyzing || !imageBase64}
          className="gap-1.5"
        >
          {analyzing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
          ) : (
            'Estimate calories'
          )}
        </Button>
      )}

      {analyzeError && (
        <div className="space-y-2">
          <p className="text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">{analyzeError}</p>
          <Button variant="secondary" size="sm" onClick={handleAnalyze} disabled={analyzing} className="gap-1.5">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Try again
          </Button>
        </div>
      )}

      {estimate && (
        <>
          {estimate.notes && (
            <p className="text-sm text-muted-foreground italic">{estimate.notes}</p>
          )}
          <p className="text-xs text-muted-foreground">
            AI estimates — review and adjust before saving.
          </p>
          <MacroFields
            values={macros}
            onChange={(k, v) => setMacros((p) => ({ ...p, [k]: v }))}
            disabled={analyzing}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="text-muted-foreground text-xs h-7 px-2"
            >
              {analyzing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Re-analyze
            </Button>
          </div>
        </>
      )}

      {(estimate || analyzeError) && (
        <>
          {!estimate && (
            <MacroFields
              values={macros}
              onChange={(k, v) => setMacros((p) => ({ ...p, [k]: v }))}
            />
          )}
          <TrackerLogSection
            macros={macros}
            modules={trackerModules}
            onChange={setTrackerSelection}
          />
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={analyzing || isPending} size="sm">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save entry
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ----------------------------------------------------------------
// Manual entry form
// ----------------------------------------------------------------

interface ManualEntryProps {
  date: string
  trackerModules: TrackerModule[]
  onSaved: (entry: FoodEntry) => void
}

function ManualEntry({ date, trackerModules, onSaved }: ManualEntryProps) {
  const [macros, setMacros] = useState<MacroValues>({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })
  const [trackerSelection, setTrackerSelection] = useState<TrackerSelection | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const [foodResult, trackerResult] = await Promise.all([
        createFoodEntry({
          entry_date: date,
          calories: macros.calories ? Number(macros.calories) : null,
          protein_g: macros.protein_g ? Number(macros.protein_g) : null,
          fat_g: macros.fat_g ? Number(macros.fat_g) : null,
          carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
          source: 'manual',
        }),
        trackerSelection
          ? createEntryInModule(
              trackerSelection.moduleId,
              date,
              Object.fromEntries(
                Object.entries(trackerSelection.fieldValues).map(([k, v]) => [
                  k,
                  v !== '' ? Number(v) : null,
                ])
              )
            )
          : Promise.resolve(null),
      ])

      if (foodResult.error) {
        setError(foodResult.error)
        return
      }
      if (trackerResult && 'error' in trackerResult && trackerResult.error) {
        setError(`Food saved, but tracker error: ${trackerResult.error}`)
      }

      onSaved({
        id: foodResult.id!,
        user_id: '',
        entry_date: date,
        calories: macros.calories ? Number(macros.calories) : null,
        protein_g: macros.protein_g ? Number(macros.protein_g) : null,
        fat_g: macros.fat_g ? Number(macros.fat_g) : null,
        carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
        source: 'manual',
        photo_path: null,
        created_at: new Date().toISOString(),
      })

      setMacros({ calories: '', protein_g: '', fat_g: '', carbs_g: '' })
      setTrackerSelection(null)
    })
  }

  return (
    <div className="space-y-4">
      <MacroFields values={macros} onChange={(k, v) => setMacros((p) => ({ ...p, [k]: v }))} />
      <TrackerLogSection
        macros={macros}
        modules={trackerModules}
        onChange={setTrackerSelection}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSave} disabled={isPending} size="sm">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
        Add entry
      </Button>
    </div>
  )
}

// ----------------------------------------------------------------
// Entry row (inline edit)
// ----------------------------------------------------------------

interface EntryRowProps {
  entry: FoodEntry
  onDeleted: (id: string) => void
  onUpdated: (entry: FoodEntry) => void
}

function EntryRow({ entry, onDeleted, onUpdated }: EntryRowProps) {
  const [editing, setEditing] = useState(false)
  const [macros, setMacros] = useState<MacroValues>({
    calories: entry.calories != null ? String(entry.calories) : '',
    protein_g: entry.protein_g != null ? String(entry.protein_g) : '',
    fat_g: entry.fat_g != null ? String(entry.fat_g) : '',
    carbs_g: entry.carbs_g != null ? String(entry.carbs_g) : '',
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSaveEdit = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateFoodEntry(entry.id, {
        calories: macros.calories ? Number(macros.calories) : null,
        protein_g: macros.protein_g ? Number(macros.protein_g) : null,
        fat_g: macros.fat_g ? Number(macros.fat_g) : null,
        carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      onUpdated({
        ...entry,
        calories: macros.calories ? Number(macros.calories) : null,
        protein_g: macros.protein_g ? Number(macros.protein_g) : null,
        fat_g: macros.fat_g ? Number(macros.fat_g) : null,
        carbs_g: macros.carbs_g ? Number(macros.carbs_g) : null,
      })
      setEditing(false)
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      await deleteFoodEntry(entry.id)
      onDeleted(entry.id)
    })
  }

  const macro = (val: number | null, unit: string) =>
    val != null ? `${Math.round(val * 10) / 10}${unit}` : '—'

  if (editing) {
    return (
      <div className="space-y-3 py-3 border-b last:border-0">
        <MacroFields values={macros} onChange={(k, v) => setMacros((p) => ({ ...p, [k]: v }))} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium tabular-nums">{macro(entry.calories, ' kcal')}</span>
        <span className="text-muted-foreground tabular-nums">P {macro(entry.protein_g, 'g')}</span>
        <span className="text-muted-foreground tabular-nums">F {macro(entry.fat_g, 'g')}</span>
        <span className="text-muted-foreground tabular-nums">C {macro(entry.carbs_g, 'g')}</span>
        {entry.source === 'photo' && (
          <span className="text-xs text-muted-foreground/60 hidden sm:inline">photo</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
          <PenLine className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Main FoodLog component
// ----------------------------------------------------------------

type AddMode = 'photo' | 'manual' | null

interface FoodLogProps {
  initialDate: string
  initialEntries: FoodEntry[]
  initialTotals: DailyTotals
  trackerModules: TrackerModule[]
}

export function FoodLog({
  initialDate,
  initialEntries,
  initialTotals,
  trackerModules,
}: FoodLogProps) {
  const [date, setDate] = useState(initialDate)
  const [entries, setEntries] = useState<FoodEntry[]>(initialEntries)
  const [totals, setTotals] = useState<DailyTotals>(initialTotals)
  const [addMode, setAddMode] = useState<AddMode>(null)
  const [loadingDate, startDateTransition] = useTransition()

  const recalcTotals = useCallback((updated: FoodEntry[]) => {
    setTotals({
      calories: updated.reduce((s, e) => s + (e.calories ?? 0), 0),
      protein_g: updated.reduce((s, e) => s + (e.protein_g ?? 0), 0),
      fat_g: updated.reduce((s, e) => s + (e.fat_g ?? 0), 0),
      carbs_g: updated.reduce((s, e) => s + (e.carbs_g ?? 0), 0),
    })
  }, [])

  const navigateDate = (newDate: string) => {
    setAddMode(null)
    startDateTransition(async () => {
      const res = await fetch(`/api/food/entries?date=${newDate}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
        setTotals(data.totals)
      }
      setDate(newDate)
    })
  }

  const handleSaved = (entry: FoodEntry) => {
    const updated = [...entries, entry]
    setEntries(updated)
    recalcTotals(updated)
    setAddMode(null)
  }

  const handleDeleted = (id: string) => {
    const updated = entries.filter((e) => e.id !== id)
    setEntries(updated)
    recalcTotals(updated)
  }

  const handleUpdated = (updated: FoodEntry) => {
    const next = entries.map((e) => (e.id === updated.id ? updated : e))
    setEntries(next)
    recalcTotals(next)
  }

  const isToday = date === todayStr()

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateDate(offsetDate(date, -1))}
          disabled={loadingDate}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <h2 className="font-medium">{formatDate(date)}</h2>
          {!isToday && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              onClick={() => navigateDate(todayStr())}
            >
              Back to today
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateDate(offsetDate(date, 1))}
          disabled={loadingDate || isToday}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Daily totals */}
      <DailyTotalsBar totals={totals} />

      <Separator />

      {/* Entry list */}
      {entries.length > 0 ? (
        <div>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No entries for this day.</p>
      )}

      <Separator />

      {/* Add entry section */}
      {addMode === null ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddMode('photo')}
            className="gap-1.5"
          >
            <Camera className="h-4 w-4" />
            Photo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddMode('manual')}
            className="gap-1.5"
          >
            <PenLine className="h-4 w-4" />
            Manual
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {addMode === 'photo' ? 'Add via photo' : 'Add manually'}
              </CardTitle>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setAddMode(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {addMode === 'photo' ? (
              <PhotoUploader date={date} trackerModules={trackerModules} onSaved={handleSaved} />
            ) : (
              <ManualEntry date={date} trackerModules={trackerModules} onSaved={handleSaved} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
