import { describe, expect, it } from 'vitest'
import { isoDate, addDaysISO, formatDisplayDate } from '../date'

describe('isoDate', () => {
  it('returns UTC YYYY-MM-DD', () => {
    expect(isoDate(new Date('2026-07-02T00:00:00Z'))).toBe('2026-07-02')
    // 23:59 UTC stays on the same UTC day regardless of host timezone
    expect(isoDate(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-31')
  })
})

describe('addDaysISO', () => {
  it('adds and subtracts days', () => {
    expect(addDaysISO('2026-07-02', 1)).toBe('2026-07-03')
    expect(addDaysISO('2026-07-02', -2)).toBe('2026-06-30')
  })
  it('crosses month and year boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('handles leap years', () => {
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29')
  })
})

describe('formatDisplayDate', () => {
  it('formats without timezone shift', () => {
    expect(
      formatDisplayDate('2026-07-02', { month: 'short', day: 'numeric' }),
    ).toBe('Jul 2')
    expect(
      formatDisplayDate('2026-07-02', { weekday: 'long', month: 'long', day: 'numeric' }),
    ).toBe('Thursday, July 2')
  })
})
