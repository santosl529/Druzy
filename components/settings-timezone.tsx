'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateDayBoundaryTz } from '@/app/actions/profile'

interface Props {
  /** Currently saved timezone from the DB, or null if unset. */
  savedTimezone: string | null
}

export function SettingsTimezone({ savedTimezone }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Detect the browser's timezone as a sensible default.
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [selected, setSelected] = useState(savedTimezone ?? browserTz)

  // Full list of IANA timezones. Initialised from the browser's Intl API via
  // lazy useState so it runs only on the client (SSR-safe — the list isn't needed
  // during server rendering).
  const [timezones] = useState<string[]>(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return [browserTz]
    }
  })

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateDayBoundaryTz(selected)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Day boundary timezone</h2>
        <p className="text-sm text-muted-foreground">
          Controls which calendar day a new entry belongs to when you log it.
          An entry logged at 11:55 pm will be attributed to that day in this
          timezone — even if it&apos;s already the next day in UTC.
          Per-tracker overrides can be added later; this sets the default for all trackers.
        </p>
        {!savedTimezone && (
          <p className="text-xs text-amber-600 mt-1">
            Not yet saved. Defaulting to your browser timezone ({browserTz}).
          </p>
        )}
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Select value={selected} onValueChange={(v) => { setSelected(v ?? selected); setSaved(false) }}>
            <SelectTrigger id="timezone" className="w-full">
              <SelectValue placeholder="Select timezone…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={pending || saved}>
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
