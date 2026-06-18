export type ColorScheme = 'light' | 'dark'

export const COLOR_SCHEME_STORAGE_KEY = 'druzy-color-scheme'

/** Apply explicit light/dark classes on `<html>`. Pass `null` to follow system preference. */
export function applyColorScheme(scheme: ColorScheme | null) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (scheme === 'light') root.classList.add('light')
  if (scheme === 'dark') root.classList.add('dark')
}

export function getStoredColorScheme(): ColorScheme | null {
  try {
    const value = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    // localStorage unavailable (SSR, private browsing, etc.)
  }
  return null
}

export function setStoredColorScheme(scheme: ColorScheme) {
  localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme)
  applyColorScheme(scheme)
  notifyColorSchemeListeners()
}

export function getEffectiveColorScheme(): ColorScheme {
  const stored = getStoredColorScheme()
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const colorSchemeListeners = new Set<() => void>()

function notifyColorSchemeListeners() {
  colorSchemeListeners.forEach((listener) => listener())
}

/** Subscribe to explicit preference, system preference, and cross-tab storage changes. */
export function subscribeColorScheme(onStoreChange: () => void) {
  colorSchemeListeners.add(onStoreChange)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    colorSchemeListeners.delete(onStoreChange)
    media.removeEventListener('change', onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}
