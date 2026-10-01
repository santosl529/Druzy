'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { Button } from '@/components/ui/button'
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

  // "Now" in the selected zone, re-read each minute; null during SSR.
  const nowMinute = useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000), () => null)
  const nowLine = nowMinute === null ? null : describeNow(new Date(nowMinute * 60_000), selected)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          items={timezones.map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
          value={selected}
          onValueChange={(v) => { setSelected(v ?? selected); setSaved(false) }}
        >
          <SelectTrigger id="timezone" aria-label="Timezone" className="h-[42px]! w-full max-w-[380px] bg-background dark:bg-background">
            <SelectValue placeholder="Select timezone…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {timezones.map((tz) => (
              <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="h-[42px] px-4" onClick={handleSave} disabled={pending || saved || selected === savedTimezone}>
          {pending ? 'Saving…' : saved || selected === savedTimezone ? 'Saved' : 'Save'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {savedTimezone
            ? selected === browserTz ? 'Matches your browser' : `Your browser is on ${browserTz.replace(/_/g, ' ')}`
            : 'Not saved yet · detected from your browser'}
        </span>
      </div>

      {nowLine && (
        <div className="rounded-[10px] border bg-muted/40 px-3.5 py-2.5 text-[0.8rem] text-foreground/80">
          It&apos;s {nowLine.when}, so anything logged now counts for{' '}
          <b className="text-foreground font-semibold">{nowLine.day}</b>.
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function subscribeMinute(onChange: () => void) {
  const id = setInterval(onChange, 15_000)
  return () => clearInterval(id)
}

function describeNow(now: Date, timeZone: string): { when: string; day: string } | null {
  try {
    const when = now.toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const day = now.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' })
    return { when: when.replace(/, (\d+:\d+)/, ' at $1'), day }
  } catch {
    return null
  }
}
