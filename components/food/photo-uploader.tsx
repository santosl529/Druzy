'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFoodEntry, createEntryInModule } from '@/app/actions/food'
import type { FoodEntry, MacroEstimate, TrackerModule } from '@/lib/types'
import type { MacroValues, TrackerSelection } from '@/components/food/shared'
import { MacroFields } from '@/components/food/macro-fields'
import { TrackerLogSection } from '@/components/food/tracker-log-section'

// ----------------------------------------------------------------
// Photo upload + analysis
// ----------------------------------------------------------------

interface PhotoUploaderProps {
  date: string
  trackerModules: TrackerModule[]
  onSaved: (entry: FoodEntry) => void
}

export function PhotoUploader({ date, trackerModules, onSaved }: PhotoUploaderProps) {
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
