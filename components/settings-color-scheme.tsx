'use client'

import { useSyncExternalStore } from 'react'
import {
  clearStoredColorScheme,
  getStoredColorScheme,
  setStoredColorScheme,
  subscribeColorScheme,
} from '@/lib/color-scheme'
import { cn } from '@/lib/utils'

type Choice = 'light' | 'dark' | 'system'

// Swatches are drawn in fixed colors so each card previews its own mode.
const OPTIONS: { value: Choice; label: string; bg: string; edge: string; ink: string }[] = [
  { value: 'light', label: 'Light', bg: '#F4F1ED', edge: '#DDD8D0', ink: '#1C1826' },
  { value: 'dark', label: 'Dark', bg: '#100E17', edge: '#2E2A3B', ink: '#EDE8F5' },
  {
    value: 'system',
    label: 'System',
    bg: 'linear-gradient(115deg, #F4F1ED 0 50%, #100E17 50% 100%)',
    edge: '#5E5872',
    ink: '#8C86A0',
  },
]

export function SettingsColorScheme() {
  const choice = useSyncExternalStore<Choice>(
    subscribeColorScheme,
    () => getStoredColorScheme() ?? 'system',
    () => 'system',
  )

  function pick(value: Choice) {
    if (value === 'system') clearStoredColorScheme()
    else setStoredColorScheme(value)
  }

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-3">
      {OPTIONS.map((o) => {
        const selected = choice === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => pick(o.value)}
            className={cn(
              'rounded-xl border p-2.5 flex flex-col gap-2.5 text-left transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selected ? 'border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_28%,transparent)]' : 'hover:border-foreground/25',
            )}
          >
            <span
              aria-hidden="true"
              className="h-16 rounded-lg border flex items-end gap-1.5 p-2"
              style={{ background: o.bg, borderColor: o.edge }}
            >
              <span className="h-2.5 w-[30%] rounded-[3px]" style={{ background: o.ink }} />
              <span className="ml-auto size-[9px] rotate-45 bg-[#9B6DCC]" />
            </span>
            <span className="text-[0.8rem] font-medium">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
