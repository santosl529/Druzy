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
- **Status:** FIXED (commit afbbd72)
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
- **Status:** FIXED (commit afbbd72)
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

## [F-04] A formula day drops only when no input has a numeric value to anchor it — defaults never conjure a date into existence
- **Status:** DECIDE
- **Severity:** low
- **Area:** formula
- **What happens:** `computeFormulaSeries` (lib/formula.ts:236) builds each
  input's `byDate` map only from entries whose field value survives
  `toNumber` (line 219-223: null/undefined/''/non-numeric string → `null`,
  `continue`d out at line 253). Because of this, an entry with a
  non-numeric value is *indistinguishable* from a missing entry — both
  simply never appear in that input's `byDate` map. The real gate on
  whether a date is computed at all is `allDates` (lib/formula.ts:265-266),
  which is the union of every input's `byDate` keys: a date only exists in
  the output if **at least one input contributed a numeric value that
  day**. Once a date clears that bar, each input is resolved independently
  at lib/formula.ts:275-278 — `logged !== undefined` — and a defaulted
  input with no numeric value that day (whether truly absent or logged as
  non-numeric) falls through to its `defaultValue`. So in a multi-input
  formula, a non-numeric value in a defaulted input is harmless when
  another input anchors the day with a real numeric value that day: the
  default still substitutes and the day still computes. The day drops
  entirely only in the *sole-anchor* case — when no input has a numeric
  value that day at all (e.g. a single-input formula, or every input's
  value that day is non-numeric/absent), because then no input's `byDate`
  contributes that key to `allDates` and the date never comes up for
  evaluation in the first place, regardless of any `defaultValue`
  configured. This matches the code's own doc comment ("a configured
  defaultValue for inputs with no entry", line 232-234) read narrowly, but
  the sole-anchor case still creates tension with the more permissive
  promise in components/formula-summary.tsx:47-48 ("computed... when every
  input has a logged value or a configured default") — in that case
  there's no entry at all to anchor the date, so the default is configured
  but never gets a chance to apply, which a user reading that copy
  wouldn't expect.
- **Where:** lib/formula.ts:265-266 (`allDates`, the actual gate — a date
  needs at least one input with a numeric value to be considered at all),
  :275-278 (per-input default substitution, `logged !== undefined` against
  `byDate`, correctly indifferent to *why* the value is missing). Multi-input
  characterization test: lib/__tests__/formula.test.ts "multi-input: a
  non-numeric value in a defaulted input is fine when another input anchors
  the day". Sole-anchor characterization test (pre-existing):
  lib/__tests__/formula.test.ts "non-numeric value in an input field is
  dropped, not NaN — and the day is skipped even with a default" (single
  input, so it is its own sole anchor).
- **Proposed fix:** treat defaulted inputs as date anchors (i.e., a date
  with a non-numeric/absent value in a defaulted input still computes
  using the default), so the sole-anchor case no longer silently drops a
  day when every anchor came from a defaulted input. Trade-off: formulas
  would emit values on days with no real data — a formula chart could show
  a smooth line where the user actually logged nothing, which may be
  surprising or actively misleading; worth confirming this is the desired
  behavior before changing silently-relied-upon output.

## [F-05] Formula-on-formula and dangling module refs are unguarded inside lib/formula.ts itself
- **Status:** DECIDE
- **Severity:** low
- **Area:** formula
- **What happens:** `withFormulaEntries` (lib/formula.ts:328) and
  `computeFormulaSeries` have no defense against a formula module whose
  `FormulaConfig.inputs` reference another formula module's id, or a
  `moduleId` that no longer exists. Currently this state is unreachable
  through the app: both formula-builder pages
  (app/(app)/modules/new/formula/page.tsx:12-14 and
  app/(app)/modules/[id]/edit/formula/page.tsx:17-19) filter `sourceModules`
  to `m.kind !== 'formula'`, and the server actions
  (app/actions/formula.ts `validateFormulaInputs`, line 36) explicitly
  reject `mod.kind === 'formula'` inputs with a user-facing error — this
  guard runs for all three creation paths (`createFormulaModule`,
  `createFormulaModuleFromProposal`, `updateFormulaModule`). But
  `withFormulaEntries` builds `entriesByModule` from a single flat pass
  over already-stored `entries` (lib/formula.ts:332-337) before computing
  any formula outputs, so if that state ever did exist (e.g. a future code
  path, a DB edit, or a regression in the action guard), a formula
  depending on another formula would silently see no data for that input
  every day — no error, no throw, just an always-empty computed series.
  Dangling `module_id` (input module deleted) behaves the same way and is
  already the intended/graceful fallback (`entriesByModule.get(id) ?? []`,
  line 251) — that part is correct and requires no change.
- **Where:** lib/formula.ts:328-339 (`withFormulaEntries`), :236-262
  (`computeFormulaSeries` single-pass evaluation); guards live in
  app/actions/formula.ts:33-36 and the two formula builder pages'
  `sourceModules` filters. Regression tests (characterization):
  lib/__tests__/formula.test.ts "formula-on-formula: a formula module
  whose input references another formula module silently sees no data"
  and "formula whose input module was deleted (dangling module_id) yields
  no entries, does not throw".
- **Proposed fix:** defense-in-depth only, since the guard is already
  enforced at every current entry point. If desired: have
  `withFormulaEntries` filter formula-module inputs out of
  `entriesByModule` construction (or assert on them) so a future guard
  regression fails loudly instead of silently producing empty charts.
  Trade-off: extra defensive code for a state the schema/actions already
  prevent; low priority unless a new formula-creation path is added later
  (e.g. bulk import) that might skip `validateFormulaInputs`.
