# Phase 2 Bug-Hunt Findings — 2026-07-02

Branch: refactor/phase-2-bugs. Workflow: obvious bugs fixed with regression
tests (marked FIXED); judgment calls await user decision (marked DECIDE).

Entry format:
## [F-NN] <one-line title>
- **Status:** FIXED (commit <sha>) | DECIDE
- **Severity:** critical | high | medium | low
- **Area:** date-tz | formula | grid | import | optimistic-ui | actions | journal
- **What happens:** <concrete scenario: inputs/state → wrong outcome>
- **Where:** <file:line>
- **Proposed fix:** <one or two sentences; for DECIDE entries include the trade-off>

## [F-01] Future-dated entry zeroes the current streak
- **Status:** FIXED (commit: task-1 audit commit on refactor/phase-2-bugs)
- **Severity:** medium
- **Area:** date-tz
- **What happens:** `computeStreak` decided "streak active" by looking only at
  the single most recent entry date. With entries on [today+1, today] (real
  scenario: the client's browser tz is a day ahead of the resolved day-boundary
  tz, so the form submits "tomorrow's" date), `lastDate` is neither today nor
  yesterday → `currentStreak` = 0 even though the user logged today. Surfaced
  in the assistant's analytics streak card ("Current streak: 0d").
- **Where:** lib/analytics.ts:285-301 (pre-fix)
- **Proposed fix:** (applied) compute the current streak over dates ≤ today
  only; future dates still count toward `longestStreak`/`totalDaysLogged` and
  `lastLoggedDate` is unchanged. Regression test:
  lib/__tests__/date-edges.test.ts "future-dated entry does not break the
  streak computation" (RED before fix, GREEN after).

## [F-02] ListChart (client component) fell back to UTC instead of browser tz
- **Status:** FIXED (commit: task-1 audit commit on refactor/phase-2-bugs)
- **Severity:** low
- **Area:** date-tz
- **What happens:** `components/charts/list-chart.tsx` is `'use client'` but
  used `timezone ?? 'UTC'`, violating the lib/date.ts convention (client falls
  back to the browser tz, server to UTC). If the fallback ever fired, a
  "last N days" list window would use UTC day boundaries instead of the
  browser's. Currently unreachable: the sole caller
  (components/module-chart.tsx:217) always passes
  `clientEffectiveTimezone(timezone)` — so no user-visible behavior change.
- **Where:** components/charts/list-chart.tsx:25 (pre-fix)
- **Proposed fix:** (applied) `getListData(entries, config,
  clientEffectiveTimezone(timezone))`. No regression test: the repo's vitest
  setup is node-only (no DOM, no `@/` alias resolution), so component-render
  tests aren't feasible without new dependencies/config; the fix is a
  one-line convention alignment on a currently-dead fallback path.

## [F-03] Entry actions' entry_date fallback is UTC-today, not the user's day
- **Status:** DECIDE
- **Severity:** low
- **Area:** actions
- **What happens:** `createEntry`/`updateEntry` fall back to
  `new Date().toISOString().split('T')[0]` (UTC today) when the form omits
  `entry_date`. For a user in UTC-8 logging at 20:00 local, a hypothetical
  missing form value would attribute the entry to *tomorrow* (their local
  next day). Defense-in-depth only: every form (entry-form, tracker-grid,
  journal-capture, food-log) always sends `entry_date` computed via
  `clientToday(savedTimezone)`, so the fallback never fires today.
- **Where:** app/actions/entries.ts:23, app/actions/entries.ts:69
- **Proposed fix:** fall back to the user's saved timezone via
  `getUserTimezone(supabase, user.id)` + `todayInTimezone(...)`. Trade-off:
  adds a profile read on a path that currently never executes, and slightly
  obscures that the form is the real source of truth; leaving as-is keeps
  the fallback simple but silently wrong-by-a-day if a future form forgets
  the field.
