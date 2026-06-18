'use client'

import { useEffect } from 'react'
import {
  applyColorScheme,
  COLOR_SCHEME_STORAGE_KEY,
  getStoredColorScheme,
} from '@/lib/color-scheme'

export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyColorScheme(getStoredColorScheme())

    function onStorage(event: StorageEvent) {
      if (event.key === COLOR_SCHEME_STORAGE_KEY) {
        applyColorScheme(getStoredColorScheme())
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return children
}
