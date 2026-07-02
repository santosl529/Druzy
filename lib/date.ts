// ----------------------------------------------------------------
// Centralized day-boundary / "today" helpers.
//
// The single source of truth for which calendar day a "now" event belongs to
// is the user's day-boundary timezone (profiles.day_boundary_tz, configured in
// Settings). When unset, the convention is to fall back to the browser's
// timezone on the client, and to UTC on the server.
//
// All "today"-style computations across the app should go through these helpers
// so that entry attribution, status coloring, and chart windows stay consistent
// with the timezone selected in Settings.
// ----------------------------------------------------------------

/** Today's date as YYYY-MM-DD in the given IANA timezone. */
export function todayInTimezone(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date())
  }
}

/**
 * The effective day-boundary timezone on the client: the saved setting, or the
 * browser's timezone when unset (matching the Settings page default).
 */
export function clientEffectiveTimezone(savedTz?: string | null): string {
  if (savedTz) return savedTz
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Today's date (YYYY-MM-DD) on the client, honoring the saved setting. */
export function clientToday(savedTz?: string | null): string {
  return todayInTimezone(clientEffectiveTimezone(savedTz))
}

/** N days before today (YYYY-MM-DD) in the given timezone. */
export function daysAgoInTimezone(n: number, tz: string): string {
  const d = new Date(todayInTimezone(tz) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

/** UTC YYYY-MM-DD of a Date (replaces the hand-rolled toISOString().split('T')[0] pattern). */
export function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Date-string arithmetic in UTC — no timezone drift for pure YYYY-MM-DD values. */
export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

/**
 * Display-format a YYYY-MM-DD string. Parses as a local-calendar date (no UTC
 * shift), so "2026-07-02" renders as July 2 in every host timezone.
 */
export function formatDisplayDate(dateStr: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', options)
}
