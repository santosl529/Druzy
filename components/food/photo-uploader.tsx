'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { Camera, Loader2, RotateCw, X } from 'lucide-react'
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

  const hasValues = Object.values(macros).some((v) => v !== '')
  const setMacro = (k: string, v: string) => setMacros((p) => ({ ...p, [k]: v }))

  return (
    <div className="grid gap-6 md:grid-cols-[340px_minmax(0,1fr)]">
      {/* Photo + context */}
      <div className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileChange(file)
            e.target.value = ''
          }}
        />
        {preview ? (
          <div className="relative h-[220px] rounded-xl border overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Food photo" className="size-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-6">
              <Button size="xs" variant="secondary" onClick={() => inputRef.current?.click()}>
                Replace
              </Button>
              <Button size="icon-xs" variant="secondary" onClick={handleDiscard} aria-label="Remove photo">
                <X />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-[220px] rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors bg-[repeating-linear-gradient(135deg,transparent_0_10px,color-mix(in_oklch,var(--muted)_50%,transparent)_10px_20px)]"
          >
            <Camera className="size-6" />
            Take or upload a food photo
          </button>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="photo-context" className="text-xs font-normal text-muted-foreground">
            Context (optional)
          </Label>
          <Input
            id="photo-context"
            placeholder='e.g. "about 150 g salmon, 12-inch bowl"'
            value={context}
            onChange={(e) => setContext(e.target.value)}
            disabled={analyzing}
            className="h-10 bg-background dark:bg-background"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !analyzing && imageBase64) handleAnalyze()
            }}
          />
        </div>

        <Button
          variant="outline"
          className="h-[38px]"
          onClick={handleAnalyze}
          disabled={analyzing || !imageBase64}
        >
          {analyzing ? (
            <><Loader2 className="animate-spin" /> Estimating…</>
          ) : estimate || analyzeError ? (
            <><RotateCw /> Estimate again</>
          ) : (
            'Estimate calories'
          )}
        </Button>
      </div>

      {/* Estimate review */}
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-medium">Estimate</span>
          {estimate ? (
            <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-[color-mix(in_oklch,var(--crystal-glow)_14%,transparent)] crystal-ink">
              ≈ approximate, edit before saving
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {preview ? 'Press Estimate calories, or type the values yourself.' : 'Add a photo to get an estimate.'}
            </span>
          )}
        </div>

        <MacroFields values={macros} onChange={setMacro} disabled={analyzing} size="lg" idPrefix="photo-" />

        {estimate?.notes && <p className="text-[0.8rem] text-muted-foreground leading-relaxed">Model note: {estimate.notes}</p>}
        {analyzeError && (
          <p className="text-sm rounded-md px-3 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-300">{analyzeError}</p>
        )}

        <TrackerLogSection macros={macros} modules={trackerModules} onChange={setTrackerSelection} />

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <div className="mt-auto flex justify-end gap-2.5">
          {(preview || hasValues) && (
            <Button variant="ghost" className="h-9" onClick={handleDiscard}>
              Discard
            </Button>
          )}
          <Button className="h-9 px-4" onClick={handleSave} disabled={analyzing || isPending || !hasValues}>
            {isPending && <Loader2 className="animate-spin" />}
            Save entry
          </Button>
        </div>
      </div>
    </div>
  )
}
