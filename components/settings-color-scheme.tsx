'use client'

import { useSyncExternalStore } from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getEffectiveColorScheme,
  getStoredColorScheme,
  setStoredColorScheme,
  subscribeColorScheme,
  type ColorScheme,
} from '@/lib/color-scheme'

export function SettingsColorScheme() {
  const scheme = useSyncExternalStore(
    subscribeColorScheme,
    getEffectiveColorScheme,
    () => 'light' satisfies ColorScheme,
  )
  const usingSystem = useSyncExternalStore(
    subscribeColorScheme,
    () => getStoredColorScheme() === null,
    () => true,
  )

  function toggle() {
    setStoredColorScheme(scheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Switch between light and dark appearance. When unset, the app follows your
          system preference{usingSystem ? ' (currently active)' : ''}.
        </p>
      </div>

      <Button variant="outline" onClick={toggle} className="gap-2">
        {scheme === 'dark' ? (
          <>
            <SunIcon />
            Switch to light mode
          </>
        ) : (
          <>
            <MoonIcon />
            Switch to dark mode
          </>
        )}
      </Button>
    </div>
  )
}
