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

## Summary

| ID | Sev | Area | Title | Status |
|---|---|---|---|---|
| F-11 | medium | import | Partial chunk-insert failure during bulk import is swallowed by the wizard when at least one earlier chunk succeeded | FIXED |
| F-17 | medium | actions | `deleteModule` discards its delete error and still unconditionally redirects home | FIXED |
| F-03 | low | actions | Entry actions' entry_date fallback is UTC-today, not the user's day | FIXED |
| F-04 | low | formula | A formula day drops only when no input has a numeric value to anchor it — defaults never conjure a date into existence | WONTFIX |
| F-05 | low | formula | Formula-on-formula and dangling module refs are unguarded inside lib/formula.ts itself | WONTFIX |
| F-07 | low | grid | Gradient mode shares evaluateGoal's phantom-zero coercion bug (unfixed, lower severity) | FIXED |
| F-09 | low | grid | An invalid (not merely unmapped) crystalOverride falls back to a hardcoded default crystal instead of the module's own crystal | FIXED |
| F-10 | low | import | Out-of-range rating values import silently — the `warning` from `coerceImportValue` is generated but never read anywhere in the pipeline | FIXED |
| F-13 | low | optimistic-ui | `tracker-grid.tsx`'s "today" is reconciled only once, on mount — a tab left open across midnight keeps showing yesterday's logged state | DECIDE |
| F-14 | low | optimistic-ui | `EntryList`'s delete button has no in-flight guard — the shared transition's pending flag is discarded — and `deleteEntry` swallows write errors with no client-visible feedback | FIXED |
| F-15 | low | optimistic-ui | Food-log's "Back to today" control is not gated on its own in-flight state | DECIDE |
| F-18 | low | journal | `createJournalEntry`'s per-tracker and binary-module writes capture their error but only ever expose success/failure as silent omission from `loggedModules` | FIXED |
| F-20 | low | journal | Binary-entry duplicate guard keys on row *existence*, not row *value* — a pre-existing `false` entry (unchecked manual log) permanently blocks the journal's "mark as journaled" write for that day | DECIDE |
| F-01 | medium | date-tz | Future-dated entry zeroes the current streak | FIXED |
| F-06 | medium | grid | `evaluateGoal` treated a missing/non-numeric field as a contributed 0, letting zero-satisfied conditions "phantom-pass" on days with no real data for that field | FIXED |
| F-08 | medium | grid | Same-day category-mode tiebreak was nondeterministic, driven by unspecified DB query row order | FIXED |
| F-12 | medium | optimistic-ui | `FoodLog`'s save/delete/update handlers derived next state from a stale closure over `entries`, racing concurrent row operations | FIXED |
| F-16 | medium | actions | Three server actions discarded their Supabase write error entirely (no destructure at all) | FIXED |
| F-19 | medium | journal | Binary-entry duplicate guard used `.maybeSingle()`, which errors (and was silently swallowed) when more than one entry already exists for the day — reopening the exact duplicate the guard exists to prevent | FIXED |
| F-02 | low | date-tz | ListChart (client component) fell back to UTC instead of browser tz | FIXED |

## Open decisions (DECIDE)

## [F-04] A formula day drops only when no input has a numeric value to anchor it — defaults never conjure a date into existence
- **Status:** WONTFIX (ruled 2026-07-06)
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
  day when every anchor came from a defaulted input. The implementable
  anchor rule here is entry-*presence*, not entry-value: a defaulted input
  that has an entry for the day (even one whose field value is
  non-numeric) can anchor the date, because there is a real row to key
  off; a truly absent entry — no row for that module/day at all — still
  contributes no date, since there is nothing to anchor to. Trade-off:
  formulas would emit values on days with a non-numeric logged value in a
  defaulted input but no other anchor — a formula chart could show a
  computed point where the defaulted input's own data was junk, which may
  be surprising or actively misleading; worth confirming this is the
  desired behavior before changing silently-relied-upon output.
- **Ruling (2026-07-06):** WONTFIX. Keep the current drop-day semantics
  (a date needs at least one input with a real numeric value to anchor
  it; defaulted inputs never conjure a date into existence on their own).
  The tension this finding raises isn't in lib/formula.ts's mechanism —
  it's in components/formula-summary.tsx's copy overpromising ("computed
  when every input has a logged value or a configured default"). That
  copy alignment is deferred to Phase 3 rather than bundled into this
  fix wave; see "Phase 3 notes" below.

## [F-05] Formula-on-formula and dangling module refs are unguarded inside lib/formula.ts itself
- **Status:** WONTFIX (ruled 2026-07-06)
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
- **Ruling (2026-07-06):** WONTFIX. Guards at all reachable entry points
  (both formula-builder pages' `sourceModules` filters, plus
  `validateFormulaInputs` in app/actions/formula.ts enforced across all
  three creation/update paths) already make this state unreachable through
  the app. Adding an internal guard inside lib/formula.ts itself for a
  state nothing can currently produce is YAGNI — revisit only if a new
  formula-creation path (e.g. bulk import) is added that might bypass
  `validateFormulaInputs`.

## [F-13] `tracker-grid.tsx`'s "today" is reconciled only once, on mount — a tab left open across midnight keeps showing yesterday's logged state
- **Status:** DECIDE
- **Severity:** low
- **Area:** optimistic-ui
- **What happens:** `today` (components/tracker-grid.tsx:31, initialized from
  `serverDate`) is only ever updated by the `useEffect` at lines 34-48, whose
  dependency array is `[serverDate, savedTimezone]` — both of which are
  static props that never change after the initial server render. The
  effect runs once on mount to reconcile a client/server timezone
  disagreement (comparing `clientToday(savedTimezone)` to `serverDate`), then
  never re-runs. There is no `visibilitychange` listener, focus handler, or
  interval anywhere in the file (or in `food-log.tsx`, which has the
  identical pattern via its own mount-only effect at lines 69-82) that
  would re-derive "today" as wall-clock time actually advances. A user who
  opens the dashboard before midnight and leaves the tab open past it keeps
  `today` (and therefore `doneToday` / the "Logged" checkmark state) pinned
  to the stale day: trackers logged "today" (now yesterday) still show as
  done, and if the user then quick-logs while the tab is stale,
  `handleUnlogged`'s `entry_date !== today` filter (line 71) compares
  against the wrong day, and `QuickLogDialog`/`EntryForm`'s date field
  (defaulted via `clientToday(savedTimezone)` at mount time inside the
  dialog, not from the parent's stale `today`) would actually default
  correctly since it's freshly computed on dialog open — so the practical
  blast radius is the checkmark/summary display and `handleUnlogged`'s
  filter, not new entries getting the wrong date.
- **Where:** components/tracker-grid.tsx:31 (`today` state), :34-48 (mount-only
  reconciliation effect, deps never change post-mount), :71 (`handleUnlogged`'s
  `entry_date !== today` filter uses the potentially-stale value). Same
  mount-only pattern (not separately findable by file name in the brief, but
  structurally identical) at components/food/food-log.tsx:69-82.
- **Proposed fix:** add a `visibilitychange` (or `focus`) listener that
  re-derives `clientToday(savedTimezone)` and, if it differs from `today`,
  re-runs the same re-fetch-and-reconcile logic already in the mount effect
  (extracted to a named function so both the mount effect and the listener
  call it). Trade-off: this changes *when* client state resyncs with the
  server relative to wall-clock time — a behavioral change explicitly
  called out by the brief as requiring a DECIDE rather than a mechanical
  fix, and the severity is low in practice since most sessions don't stay
  open across a day boundary, but it's a real gap given the brief flags it
  by name.

## [F-15] Food-log's "Back to today" control is not gated on its own in-flight state
- **Status:** DECIDE
- **Severity:** low
- **Area:** optimistic-ui
- **What happens:** In `components/food/food-log.tsx`, the two chevron date-nav
  buttons correctly disable on `loadingDate` (lines 119, 138), but the
  "Back to today" text control (a raw `<button>`, lines 126-131) does not —
  it can be clicked again while a previous `navigateDate` fetch is still in
  flight, firing a second concurrent `fetch('/api/food/entries?date=...')`.
  Both calls eventually call `setEntries`/`setTotals`/`setDate` with
  whichever response resolves last (no request-id/AbortController guard),
  so out-of-order network responses can transiently (or, if the earlier
  request is slower, permanently until the next nav) leave the view showing
  the wrong day's entries against the URL/date-header shown. This is a
  read-navigation race, not a write/double-submit (no duplicate server-side
  record is created), so it falls outside the brief's check #1 framing
  literally, but is the same class of missing-in-flight-guard issue.
- **Where:** components/food/food-log.tsx:126-131 (`Back to today` button,
  no `disabled`); :52-63 (`navigateDate`, no request-ordering guard).
- **Proposed fix:** add `disabled={loadingDate}` to the "Back to today"
  button (mechanical on its face), but flagged as DECIDE rather than
  auto-applied because the deeper issue — out-of-order fetch responses
  racing regardless of button disabling (e.g. slow network + rapid
  chevron-chevron-chevron before any single click completes, still
  possible since disabling only blocks re-clicking the *same already-timed-out*
  button, not a genuinely stale in-flight request finishing after a newer
  one) — needs an `AbortController` or request-sequence check to fully
  close, which is a behavior change beyond adding one `disabled` prop.
  Bundling the trivial `disabled` addition without the sequencing fix would
  give a false sense that the race is closed, so both are left for a
  combined decision.

## [F-20] Binary-entry duplicate guard keys on row *existence*, not row *value* — a pre-existing `false` entry (unchecked manual log) permanently blocks the journal's "mark as journaled" write for that day
- **Status:** DECIDE
- **Severity:** low
- **Area:** journal
- **What happens:** The manual "log an entry" form for any standard module
  (`createEntry`, app/actions/entries.ts:7-49) writes
  `values[field.key] = raw === 'on'` for boolean fields — i.e. leaving the
  checkbox unchecked and submitting still inserts a row, with the field set
  to `false`, not no row at all. (The one-tap grid toggle,
  `setBinaryToday` in app/actions/entries.ts:126-168 — delete branch at
  139-146 — behaves differently: `done=false` *deletes* the day's rows
  rather than writing `false`, so "false" rows are reachable specifically
  through the generic entry form, not the toggle.) If a user submits that
  form with the box unchecked for today, then separately saves a journal
  entry the same day with that same tracker connected as the template's
  "journaled" marker, `createJournalEntry`'s guard
  (app/actions/journal.ts:225-238, post F-19 fix) finds the existing
  `false` row via `.limit(1)` and skips the write — the journal save
  silently never upgrades that day's entry to `true`, even though
  completing the journal is the exact signal the "mark as journaled"
  feature is meant to record. The user sees no error; `loggedModules`
  simply won't include that tracker's name (compounding F-18's
  silent-omission problem).
- **Where:** app/actions/journal.ts:225-238 — the guard's `if (existing.length
  === 0)` treats "a row is present" as "already journaled today," without
  checking whether that row's boolean field is actually `true`.
- **Proposed fix:** two directions, DECIDE because both are behavior
  changes to a data-mutation path: (a) tighten the guard to only skip when
  an existing row already has the boolean field `=== true` (query
  `.contains('values', { [boolField.key]: true })` or filter client-side
  after a `.limit(5)` fetch), and otherwise call `createEntryInModule`
  to add a corroborating `true` entry for the day — accepts that the tracker
  could then show 2 rows for one day (mirrors the existing multi-row
  possibility from the manual form, which the app already tolerates per
  `getEntryState`'s `dayEntries.some(...)` check in
  lib/consistency-grid.ts:154-157); (b) leave as-is and treat "already has
  any entry today" as sufficient (current behavior) — simplest, but silently
  disagrees with a user who explicitly unchecked the tracker earlier and
  then completed the journal intending to override that. Recommend (a):
  the grid's own `done` calculation already treats "any `true` entry that
  day" as done, so adding a second `true` row is consistent with how the
  feature is read elsewhere, whereas never overriding a `false` makes the
  "mark as journaled" feature unreliable exactly when a user changes their
  mind mid-day.

## Fixed during the hunt (audit record)

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
- **Status:** FIXED (commit 5e0a963) — ruled by user 2026-07-06
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
- **Implemented (2026-07-06):** as proposed. Both `createEntry` and
  `updateEntry` now read `formData.get('entry_date')` first and only await
  `getUserTimezone(supabase, user.id)` (falling back to `'UTC'` when unset)
  when that value is empty — the `||` short-circuit keeps the fallback
  lazy, so no extra profile read happens on the (currently universal) path
  where the form supplies the date. No unit test possible (server action
  with a live Supabase dependency, no action-test harness in this repo,
  consistent with F-16/F-19's precedent) — verified by code reading plus
  `npx tsc --noEmit` / lint / full suite passing.

## [F-06] `evaluateGoal` treated a missing/non-numeric field as a contributed 0, letting zero-satisfied conditions "phantom-pass" on days with no real data for that field
- **Status:** FIXED (commit 9ca609c)
- **Severity:** medium
- **Area:** grid
- **What happens:** `evaluateGoal`'s reduce used `Number(entry[cond.field])`
  guarded only by `isNaN`. Two distinct failure modes: (1) `Number(null)`
  is `0` and `Number(true)`/`Number(false)` are `1`/`0` — none of these are
  `NaN`, so a `null` or boolean value logged under a numeric goal field
  was silently coerced and counted as a real contribution instead of
  being ignored. (2) Separately, because the reduce seed is `0` and a
  genuinely-missing field is (correctly) excluded from the sum, a day
  where the field never appears in *any* entry evaluates the condition
  against `0` — indistinguishable from the user having actually logged
  `0`. For a condition satisfied by `0` (e.g. `lte 0`, `eq 0`, or a
  `between` range straddling `0`), this "phantom zero" reports the goal
  as met on a day nothing was logged for that field at all. Both are the
  same root cause the codebase already guards against in
  `lib/formula.ts`'s `toNumber` (rejects `null`/`undefined`/`''` before
  calling `Number()`) — `evaluateGoal` never had the equivalent guard.
- **Where:** lib/consistency-grid.ts (`evaluateGoal`, `toFiniteNumber`
  helper added). Regression tests: lib/__tests__/consistency-grid.test.ts
  `describe('evaluateGoal value coercion', ...)` — string-numeric
  coercion (kept, unchanged behavior), null/boolean values no longer
  satisfy conditions, missing-field-across-all-entries returns false
  even for zero-straddling ranges, and a genuinely logged `0` still
  counts (regression guard against overcorrecting).
- **Proposed fix:** (applied) added `toFiniteNumber` (rejects
  `null`/`undefined`/`''`/`boolean` before `Number()` coercion, mirroring
  `lib/formula.ts`'s `toNumber`) and tracked whether any entry
  contributed a real value per condition (`sawValue`); if none did, the
  condition is false regardless of what the reduce-seed `0` would
  otherwise satisfy. Note: the identical `Number(e[fieldKey])`/`isNaN`
  pattern also exists in gradient mode (cell computation and the
  auto-fit range scan) — see F-07, left unfixed as out of this task's
  scope (lower severity: affects a display intensity value, not a
  boolean pass/fail gate).

## [F-07] Gradient mode shares evaluateGoal's phantom-zero coercion bug (unfixed, lower severity)
- **Status:** FIXED (commit 5e0a963) — ruled by user 2026-07-06
- **Severity:** low
- **Area:** grid
- **What happens:** `computeCellState`'s `'gradient'` branch
  (`lib/consistency-grid.ts`, the `rawValue` reduce) and
  `buildGridData`'s gradient auto-fit range scan use the same
  `Number(e[fieldKey])` / `isNaN` pattern that F-06 fixed in
  `evaluateGoal`. `null`/boolean field values are silently coerced
  (`Number(null)===0`, `Number(true)===1`) into the summed `rawValue`,
  and a day with no real numeric value for the field computes `rawValue
  = 0` — identical to a genuinely logged `0`. Unlike `evaluateGoal`,
  gradient mode's output is a display intensity/hover value, not a
  boolean goal-met gate, so the practical impact is softer: a day with a
  stray `null`/boolean value (or entirely missing field, which is
  already the common "no entry" case elsewhere) renders at the bottom of
  the gradient range instead of being visually distinguished from a
  real `0`. Since `computeCellState`'s dispatch already returns early
  for `dayEntries.length === 0` (true no-entry days), this only bites
  when an entry *exists* for the day but the configured gradient field
  specifically holds `null`/a boolean/a non-numeric string on it (e.g. a
  field left blank in a multi-field form, or type drift after a field's
  type was changed).
- **Where:** lib/consistency-grid.ts, `computeCellState` case
  `'gradient'` (rawValue reduce), and `buildGridData`'s gradient
  auto-fit range scan (same reduce pattern). No regression test added —
  this is an unfixed DECIDE, not a characterized behavior change.
- **Proposed fix:** reuse the `toFiniteNumber` helper added for F-06 in
  both gradient-mode reduces, and track `sawValue` the same way so a
  field with zero real numeric contributions can render as a distinct
  "no data" state instead of `rawValue = 0`. Trade-off: gradient mode
  currently has no "no data but entry exists" visual state — `rawValue:
  undefined` would need a rendering decision (blank cell? floor
  intensity? excluded from auto-fit min/max?), which is a product call
  beyond a one-line coercion fix; deferred rather than bundled into F-06
  to keep that fix minimal and scoped to the brief's Step 1 target.
- **Implemented (2026-07-06):** reused `toFiniteNumber` (from F-06) in both
  the `computeCellState` gradient-mode reduce and `buildGridData`'s
  auto-fit min/max scan, tracking `sawValue` the same way. Ruling: a day
  whose entries have no finite numeric value for the gradient field now
  renders exactly like a day with no entries at all (`{ state: 'not-done',
  intensity: 0 }`, no `rawValue`) — no new visual state introduced, and
  such days are excluded from auto-fit range computation. Regression
  tests: lib/__tests__/consistency-grid.test.ts — non-numeric/null/boolean
  gradient-field value renders as no-data (not phantom-zero); auto-fit
  range unaffected by a non-numeric day; genuine `0` still counts
  (anti-regression, mirrors F-06).

## [F-09] An invalid (not merely unmapped) crystalOverride falls back to a hardcoded default crystal instead of the module's own crystal
- **Status:** FIXED (commit 5e0a963) — ruled by user 2026-07-06
- **Severity:** low
- **Area:** grid
- **What happens:** The category-mode spec says "unmapped options fall
  back to the module's crystal," and `computeCellState` implements that
  correctly for options genuinely absent from `categoryColors` — it
  leaves `crystalOverride` as `undefined`, and the renderer
  (`components/consistency-grid.tsx` `CrystalCell`) does
  `getCrystal(cell.crystalOverride ?? crystalType)`, which falls through
  to the module's own `crystalType`. But `categoryColors` values are
  never validated against `CRYSTAL_KEYS` at the `computeCellState`
  layer — it's a plain object lookup, so a *present but invalid* mapped
  value (e.g. stale config data from a renamed/removed crystal key) is
  passed through as `crystalOverride` unchanged. `cell.crystalOverride
  ?? crystalType` only catches `null`/`undefined`, not an
  invalid-but-truthy string, so `getCrystal(garbage)` is called instead
  — and `getCrystal`'s own fallback (lib/crystals.ts:54-56,
  already covered by an existing passing test in
  lib/__tests__/crystals.test.ts) returns the hardcoded default
  (`amethyst`), not the module's actual configured crystal. Net effect:
  an unmapped option renders in the module's crystal (correct per spec);
  an invalid-but-mapped option renders in amethyst regardless of the
  module's crystal (spec-adjacent but not what "fall back to the
  module's crystal" says). Currently unreachable through the UI — the
  module-builder's category config only offers `CRYSTAL_KEYS` values via
  a `<Select>` — this only matters for stale/hand-edited config rows.
- **Where:** lib/consistency-grid.ts `computeCellState` case `'category'`
  (no validation on `categoryColors[label]` lookup);
  components/consistency-grid.tsx:39 (`getCrystal(cell.crystalOverride
  ?? crystalType)`); lib/crystals.ts:54-56 (`getCrystal`'s hardcoded
  fallback). Probe (characterization, no crash):
  lib/__tests__/consistency-grid.test.ts 'category mode, categoryColors
  maps to a crystal key not in CRYSTAL_KEYS → computeCellState passes it
  through as-is, no crash'.
- **Proposed fix:** either (a) validate `categoryColors` values against
  `CRYSTAL_KEYS` in `computeCellState` and treat an invalid entry the
  same as unmapped (`crystalOverride` stays `undefined`, falls back to
  the module's crystal, matching spec intent exactly), or (b) change the
  renderer's fallback to `getCrystal(cell.crystalOverride ?? crystalType,
  crystalType)`-style two-level fallback. Trade-off: this is unreachable
  dead-config territory today (no UI path produces an invalid key), so
  it's low priority defense-in-depth; (a) is the more spec-faithful fix
  and belongs in lib/consistency-grid.ts rather than the renderer.
- **Implemented (2026-07-06):** option (a). `computeCellState`'s
  `'category'` case now validates the mapped `categoryColors[label]`
  value against `CRYSTAL_KEYS` (imported from `@/lib/crystals`); an
  invalid value is treated as unmapped, so `crystalOverride` stays
  `undefined` and the renderer falls back to the module's own crystal
  instead of `getCrystal`'s hardcoded `amethyst` default. The existing
  characterization test ('passes it through as-is, no crash') was renamed
  and updated to assert the new fallback-to-unmapped behavior; a new test
  pins that a valid `CRYSTAL_KEYS` value still passes through unchanged.

## [F-10] Out-of-range rating values import silently — the `warning` from `coerceImportValue` is generated but never read anywhere in the pipeline
- **Status:** FIXED (commit 5e0a963) — ruled by user 2026-07-06
- **Severity:** low
- **Area:** import
- **What happens:** `coerceImportValue`'s `'rating'` case (lib/import.ts:117-124)
  deliberately treats an out-of-bounds rating (e.g. "7" for a 1–5 scale) as a
  *warning*, not an *error* — it returns `{ value: n, warning: "... is
  outside 1–max" }` and lets the raw value through unclamped. That looks
  intentional (errors block a row; warnings were presumably meant to let it
  through with a flag). But nothing downstream ever reads `.warning`:
  `validateImportRows` (lib/import.ts:209-211) destructures `{ value, error }`
  and only pushes to `errors` when `error` is set — the `warning` field is
  silently dropped. The row ends up `status: 'ok'`, `rowsToImport` includes
  it unchanged, and `app/actions/import.ts`'s `validateRowServer` calls
  `coerceImportValue` again server-side but has the same blind spot (only
  checks `error`, app/actions/import.ts:38-39).
  Net effect: importing a CSV with a "9" in a 1–5 rating column inserts a
  literal 9 into the entry, with no error, no preview-table warning row (the
  wizard's `problemRows` filter is `status !== 'ok'`, so a warned-but-ok row
  never appears there), and no indication to the user anywhere that the value
  was out of range. Downstream chart/analytics code that assumes ratings are
  bounded 1–max would then silently render/aggregate a value outside that
  range.
- **Where:** lib/import.ts:117-124 (`coerceImportValue` rating case, produces
  `warning`); lib/import.ts:209-211 (`validateImportRows`, only reads
  `error`, drops `warning`); app/actions/import.ts:38-39 (`validateRowServer`,
  same pattern server-side); components/import/import-wizard.tsx:190
  (`problemRows` only surfaces non-`ok` rows, so warned rows are invisible in
  the preview UI). Probe (characterization):
  lib/__tests__/import.test.ts `'coerceImportValue — rating bounds'` →
  `'out-of-range rating is a WARNING not an error — value passes through
  unbounded'`, and `'validateImportRows — duplicate semantics'` →
  `'out-of-range rating warning does not block the row from ending up ok and
  importable'`.
- **Proposed fix:** two reasonable directions, trade-off is product intent:
  (a) treat rating-out-of-range as a hard `error` like every other coercion
  failure — simplest, consistent with how the rest of the function treats
  invalid input, but forecloses any future "allow with warning" UX; or
  (b) actually wire `warning` through — surface it in `ImportRowResult` (new
  optional field or reuse `reason` with a distinct status), show it in the
  wizard's preview table, and decide whether `rowsToImport` should still
  include warned rows or require explicit opt-in via `includeDuplicates`-style
  checkbox. (b) is more work but preserves the apparent original intent of
  having a separate warning channel at all. Recommend (a) unless there's a
  known use case for importing intentionally-out-of-scale ratings.
- **Implemented (2026-07-06):** option (a). `coerceImportValue`'s
  `'rating'` case now returns `{ value: null, error }` for an out-of-bounds
  rating, matching every other coercion failure in the function; the row
  is blocked with `status: 'error'` and excluded from `rowsToImport`. The
  now-dead `warning` field was removed from `coerceImportValue`'s return
  type (grepped: it was the sole producer, and nothing downstream ever
  read it). `app/actions/import.ts`'s `validateRowServer` needed no
  change — it already only inspects `error`. The two characterization
  tests that pinned warning-passthrough
  (lib/__tests__/import.test.ts, `coerceImportValue — rating bounds` and
  `validateImportRows — duplicate semantics`) were renamed and updated to
  assert the new hard-error/blocked-row behavior.

## [F-08] Same-day category-mode tiebreak was nondeterministic, driven by unspecified DB query row order
- **Status:** FIXED (commit 9ca609c)
- **Severity:** medium
- **Area:** grid
- **What happens:** The category-mode spec
  (docs/superpowers/specs/2026-06-29-category-mode-design.md) says the
  "most recent entry" wins when two entries land on the same day, read
  from `dayEntries[dayEntries.length - 1]` in `computeCellState`. But
  `buildGridData` populated `dayEntries` by pushing entries into each
  day's array in whatever order the input `entries` array arrived in —
  and the sole production caller
  (app/(app)/dashboard/page.tsx:24-30) issues an unordered
  `.select('module_id, entry_date, values, created_at')...` Supabase
  query with no `.order()` clause. Postgres gives no ordering guarantee
  without `ORDER BY`, so "last in the array" was not reliably "most
  recently created" — the winning category for a same-day conflict
  could flip between page loads or after unrelated writes/vacuums
  changed physical row order, with no code change and no user action.
  Per the task brief, order-dependent nondeterminism is treated as a bug
  even though the spec is silent on the underlying query's ordering.
- **Where:** lib/consistency-grid.ts, `buildGridData` step 1 (entry
  indexing loop). Regression test:
  lib/__tests__/consistency-grid.test.ts `'same-day category conflict
  resolves by entry_date creation order (created_at), not raw
  array/query order'` — builds the grid twice from the same two entries
  in opposite array order and asserts both runs agree on the winner
  (RED before fix: reversed-array run picked the array-last entry
  instead of the chronologically-last one; GREEN after).
- **Proposed fix:** (applied) sort the `entries` array by `created_at`
  ascending once, up front in `buildGridData`, before building the
  per-day index — so `dayEntries[dayEntries.length - 1]` is
  deterministically the chronologically latest entry regardless of
  input array order. Fixed at the `lib` layer (not the Supabase query)
  so the guarantee holds for any caller, not just the current dashboard
  page.

## [F-12] `FoodLog`'s save/delete/update handlers derived next state from a stale closure over `entries`, racing concurrent row operations
- **Status:** FIXED (commit 5394e38)
- **Severity:** medium
- **Area:** optimistic-ui
- **What happens:** `handleSaved`/`handleDeleted`/`handleUpdated`
  (components/food/food-log.tsx, pre-fix lines 84-101) each read the
  component-level `entries` variable captured at render time, computed
  `updated`/`next` from it, and called `setEntries(updated)` with a plain
  value rather than a functional updater. Each handler is passed as a prop
  (`onSaved`/`onDeleted`/`onUpdated`) into a child (`PhotoUploader`,
  `ManualEntry`, `EntryRow`) that invokes it only after its own server
  action resolves inside its own `useTransition`. Because each `EntryRow`
  has independent pending state, two concurrent operations on different
  rows (e.g. deleting row A and editing row B in quick succession, both
  in flight before either resolves) both close over the *same* pre-render
  `entries` snapshot. Whichever `setEntries` call's callback fires last
  wins outright — it computes its `updated`/`next` from the stale
  snapshot, silently discarding the other operation's change from local
  state (e.g. a deleted row reappears in the UI, or an edit is dropped)
  until the next full data fetch (date navigation or page refresh). The
  underlying Supabase writes/deletes both still succeed — this is a
  client-side display desync, not data loss — but it shows the wrong
  entries list until the user navigates away and back.
- **Where:** components/food/food-log.tsx, `handleSaved`/`handleDeleted`/
  `handleUpdated` (pre-fix lines 84-101), each computing `updated`/`next`
  from the closed-over `entries` instead of the setter's `prev` argument.
- **Proposed fix:** (applied) converted all three handlers to
  `setEntries((prev) => { const updated = ...prev...; recalcTotals(updated);
  return updated })`, deriving the new list from the setter's own `prev`
  argument instead of the render-time closure, and calling `recalcTotals`
  on that up-to-date value. No behavior change on the single-operation
  happy path; eliminates the lost-update race on concurrent operations.
  Mechanical fix per the task brief (functional-updater conversion, no
  intended-behavior change) — no regression test added (no component-render
  test harness in this repo; verified by tsc/lint/existing suite plus the
  reasoning above).

## [F-16] Three server actions discarded their Supabase write error entirely (no destructure at all)
- **Status:** FIXED (commit 1c48ca9)
- **Severity:** medium
- **Area:** actions
- **What happens:** Task 6's write-error grep
  (`await supabase.from(...).{insert,update,delete,upsert}`) found three
  call sites that didn't even destructure `{ error }` from the Postgrest
  response — the error was unreachable, not just unchecked: (1)
  `createDefaultChart` (app/actions/charts.ts, pre-fix line 45) inserts the
  auto-generated default chart on every module/formula creation path (4
  call sites across modules.ts and formula.ts) with a bare `await`; a
  failed insert here means a newly created tracker silently has no chart,
  discovered only later by the user noticing a blank charts section. (2)
  `deleteChart` (app/actions/charts.ts, pre-fix line 100) — a failed delete
  (RLS denial, network blip) leaves the chart in the DB but
  `revalidatePath` still runs and the client already removed it from local
  state (components/charts/sortable-charts.tsx `handleDelete` calls
  `setCharts` before `startTransition`), so the chart reappears on the next
  real refetch with zero indication anything failed — same "phantom
  success" shape as F-14's `deleteEntry` and F-11's import-wizard gap. (3)
  `reorderCharts` (app/actions/charts.ts, pre-fix line 151) fires N
  concurrent `.update()` calls via `Promise.all` and awaited them with no
  destructure; a mid-batch failure (e.g. one chart deleted concurrently in
  another tab) leaves that chart's `position` un-persisted while
  `revalidatePath` still runs, silently reverting just that one card's
  order on next load with no error surfaced anywhere.
- **Where:** app/actions/charts.ts (`createDefaultChart` pre-fix line 45,
  `deleteChart` pre-fix line 100, `reorderCharts` pre-fix line 151).
- **Proposed fix:** (applied) all three now capture `{ error }` (or, for
  `reorderCharts`, check each settled result from `Promise.all`) and return
  `{ error?: string }` instead of `void`/nothing, matching the file's
  existing convention on `createChart`/`updateChart`/`addChartFromProposal`.
  All current callers (`components/delete-module-button.tsx`,
  `components/charts/sortable-charts.tsx`, and the 4
  `createDefaultChart` call sites in modules.ts/formula.ts) already
  fire-and-forget these calls via bare `await`/`startTransition` and
  discard the return value, so this is a pure capture-and-return with zero
  behavior change today — no new user-facing error state, per the brief's
  FIX criteria. `startTransition`'s callback type requires `void |
  Promise<VoidOrUndefinedOnly>`, so the two `sortable-charts.tsx` call
  sites needed a `void reorderCharts(...)` / `void deleteChart(...)` wrapper
  to keep the callback void-returning — mechanical, not a behavior change
  (still fire-and-forget). Errors are now at least capturable by a future
  caller; none render yet, so surfacing them in the UI remains a separate
  DECIDE (see F-17 for the one case — `deleteModule` — where the discarded
  error is compounded by an unconditional `redirect`).

## [F-19] Binary-entry duplicate guard used `.maybeSingle()`, which errors (and was silently swallowed) when more than one entry already exists for the day — reopening the exact duplicate the guard exists to prevent
- **Status:** FIXED (commit 7c7ff3d)
- **Severity:** medium
- **Area:** journal
- **What happens:** The duplicate guard added in a51b1db
  (`createJournalEntry`, pre-fix app/actions/journal.ts:225-231) queries
  `entries` filtered by `module_id` + `entry_date` + `user_id` and calls
  `.maybeSingle()`, then checks `if (!existing)` to decide whether to
  insert. `entries` has no unique constraint on
  `(module_id, user_id, entry_date)` (supabase/migrations/20240101000000_initial.sql:60-67),
  and the generic manual-entry form `createEntry` (app/actions/entries.ts:7-49)
  allows unlimited inserts per module per day with no dedup of its own. So a
  user who has manually logged the connected binary tracker twice on the same
  day (e.g. via its own module page) already has 2 rows for that
  module+date. When `createJournalEntry` then runs its guard,
  `.maybeSingle()` receives a "multiple (or no) rows returned" failure for
  that query — synthesized **client-side** by postgrest-js (v2.107.0,
  dist/index.cjs:389-401: when `isMaybeSingle` and the parsed JSON array has
  more than one row, the library discards the array, sets `data = null`,
  and manufactures a `PGRST116` error object itself) after an ordinary
  plain-JSON fetch — the PostgREST server itself never returned this as an
  HTTP error; the client library detects the row count and re-shapes the
  response after the fact. The net observable behavior is the same either
  way (`data = null` plus a `PGRST116`-coded error), and the pre-fix code
  destructured only `{ data: existing }`, discarding that error entirely,
  so `existing` came back `undefined` and `if (!existing)` was true — the
  guard fell through and inserted a third, duplicate row. This is the
  identical duplicate-entry class a51b1db was written to close, reopened
  specifically in the multi-row case.
- **Residual:** The guard's own select still discards its `error` (app/actions/journal.ts:234) — if the guard QUERY fails (network/RLS), the code fails open and inserts anyway; capturing the error and skipping the insert is the fail-closed alternative, left as a judgment call.
- **Where:** app/actions/journal.ts:225-231 (pre-fix; guard query using
  `.maybeSingle()` with discarded `error`).
- **Proposed fix:** (applied) switched the existence check to
  `.limit(1)`, which returns an array and never errors based on row count;
  the guard now checks `existing.length === 0` before inserting. No other
  behavior changed — a single pre-existing row still skips the insert
  exactly as before; the fix only closes the multi-row gap. Action-level
  code with a live Supabase dependency and no action-test harness in this
  repo (confirmed: no existing test mocks `createClient`/`requireUser` for
  `app/actions/*`), so verified by code reading plus the PostgREST
  multiple-rows contract for `.maybeSingle()` rather than an executable
  regression test; documented here per the brief's "fix + documented
  reasoning" path for action logic without test infra.

## [F-11] Partial chunk-insert failure during bulk import is swallowed by the wizard when at least one earlier chunk succeeded
- **Status:** FIXED (commit 0e99bc8) — ruled by user 2026-07-06
- **Severity:** medium
- **Area:** import
- **What happens:** `bulkImportEntries` (app/actions/import.ts:123-129) inserts
  in chunks of `CHUNK_SIZE = 500` via a sequential loop, not one atomic bulk
  insert. If chunk 3 of 5 fails (e.g. a transient DB error, a constraint hit
  by a row that slipped past validation), the loop returns immediately with
  `{ inserted: <rows from chunks 1-2>, skipped, error: error.message }` —
  so the *return value* correctly reflects a partial success and does carry
  the error message. The bug is entirely on the caller side:
  `ImportWizard.handleImport` (components/import/import-wizard.tsx:214-221)
  guards the error path with `if (result.error && result.inserted === 0)`.
  When `inserted > 0` (i.e. any earlier chunk committed), that condition is
  false, so the function falls through to `router.push(...); router.refresh()`
  — navigating away as if the import fully succeeded. The error message and
  the partial count (e.g. "1000 of 2200 imported, then failed") are never
  shown to the user. For imports at or near `MAX_IMPORT_ROWS` (5000 rows /
  10 chunks), a failure partway through silently leaves the tracker with an
  incomplete, un-flagged import and no way for the user to know which rows
  are missing short of manually diffing.
- **Where:** app/actions/import.ts:123-129 (chunked insert loop, correct
  partial-count return); components/import/import-wizard.tsx:213-221
  (`handleImport`'s `result.inserted === 0` guard drops the partial-failure
  case). No test added — this is a UI/state-flow read, not a pure-function
  probe; confirmed by static trace of the `if` condition against the
  possible `{inserted, skipped, error}` return shapes from
  `bulkImportEntries`.
- **Proposed fix:** change the wizard's condition to branch on `result.error`
  alone (regardless of `inserted`), and when both `error` and `inserted > 0`
  are present, show a distinct message like `Imported ${inserted} of
  ${rows.length} rows, then stopped: ${result.error}` instead of either the
  generic error path or a silent success redirect. Trade-off: this is a
  UX/copy decision (what to tell the user, whether to still navigate to the
  module page so they can see what did land, whether to offer "retry
  remaining rows") rather than a one-line logic fix, so it's flagged for
  product judgment rather than auto-applied.
- **Ruling (2026-07-06):** FIXED per the consistent inline-error pattern (server
  actions return `{ error? }`, components render destructive text inline).
  `ImportWizard.handleImport` (components/import/import-wizard.tsx) now
  branches on `result.error` alone; when `result.inserted > 0` it shows
  "Import stopped after {inserted} of {total} rows: {error}. The imported
  rows are saved; retrying will skip them as duplicates." and does not
  navigate away. Retry-safety is made real, not just promised: the wizard
  slices the first `result.inserted` entries off the same `rows` array it
  sent to the server (chunks insert in payload order, so those rows are the
  ones that landed) and folds their `entry_date`s into a new
  `confirmedInsertedDates` state, merged into `existingDateSet` alongside the
  `existingDates` prop — so `validateImportRows` on a retry marks them
  `duplicate` instead of re-inserting. `inserted === 0` keeps the original
  full-failure behavior (generic error, no navigation). `app/actions/import.ts`
  needed no change, as the brief specified.
- **Residual gap (found in review, mitigated 2026-07-06):** the retry-safety
  mechanism above was entirely inert whenever `includeDuplicates` was
  checked at the time of the partial failure: both the client's own
  duplicate check (`validateImportRows(..., { includeDuplicates })`) and the
  server's duplicate guard are bypassed by that flag, so folding the landed
  dates into `confirmedInsertedDates` had no effect — a retry would
  re-insert every row that already landed, exactly contradicting the "will
  skip them as duplicates" message. Fixed by having `handleImport` reset
  `includeDuplicates` to `false` on partial failure, so the duplicate check
  is guaranteed active for the retry, and by rewording the message to match
  ("they'll be skipped as duplicates when you retry," plus a note that
  re-checking "include duplicates" would re-import them). One narrower gap
  remains, not fixed: the mechanism assumes the first `result.inserted` rows
  of the *retry's* payload are a prefix-for-prefix match with the rows that
  landed on the *original* attempt. Server-side re-validation on the retry
  (the required-field check and the fresh duplicate check in
  `app/actions/import.ts`) can skip rows that pass differently than they did
  the first time (e.g. a date that was a duplicate before but no longer is,
  or vice versa), which shifts which rows occupy `rows.slice(0,
  result.inserted)` on the retry relative to the original. Because the
  server-side duplicate guard is active whenever `includeDuplicates` is off
  (which this fix now guarantees on the retry), this cannot cause a second
  double-insert of the same row — the blast radius is limited to
  label/count noise (a landed row briefly mismarked, or the reported
  inserted-count description reading slightly off), not new duplicate
  writes.

## [F-14] `EntryList`'s delete button has no in-flight guard — the shared transition's pending flag is discarded — and `deleteEntry` swallows write errors with no client-visible feedback
- **Status:** FIXED (commit 0e99bc8) — ruled by user 2026-07-06
- **Severity:** low
- **Area:** optimistic-ui
- **What happens:** Two compounding issues in the non-edit delete path of
  `components/entry-list.tsx`. (1) The main `EntryList` component destructures
  `const [, startTransition] = useTransition()` (line 186), discarding the
  pending flag entirely, so the delete button (lines 240-250) has no
  `disabled` guard — unlike the `EditRow` save/cancel buttons in the same
  file, which correctly wire `disabled={pending}` (lines 169, 172). A user
  who clicks delete, dismisses the native `confirm()`, and clicks again
  before the first `deleteEntry` call resolves can fire multiple concurrent
  deletes of the same row (harmless — deleting an already-deleted id is a
  no-op — but reflects the same missing-disabled pattern flagged elsewhere
  as a mechanical fix candidate). (2) `deleteEntry`
  (app/actions/entries.ts:94-100) has a `Promise<void>` return type and
  never checks the Supabase `.delete()` call's error — a failed delete
  (e.g. RLS denial, network error, revoked session) is silently discarded
  both server-side (no error captured) and client-side (`entry-list.tsx`
  line 246 does `startTransition(() => deleteEntry(...))` and never reads
  a result). The row is never removed from `entries` optimistically
  (`EntryList` relies entirely on `revalidatePath` + a server refetch to
  reflect the deletion), so a failed delete simply leaves the row in place
  with zero indication to the user that anything went wrong — it looks
  identical to "nothing happened yet."
- **Where:** components/entry-list.tsx:186 (discarded pending flag),
  :240-250 (delete button, no `disabled`, no result handling);
  app/actions/entries.ts:94-100 (`deleteEntry`, `Promise<void>`, error from
  `.delete()` never captured or returned).
- **Proposed fix:** wiring `disabled={pending}` onto the delete button alone
  is not purely mechanical here because the transition is shared across
  every row in the list (`[, startTransition]` at the `EntryList` level,
  not per-row) — disabling it while any row's delete is in flight would
  also disable *other* rows' delete (and, if reused, edit) buttons, a
  cross-row UX change beyond "add disabled to the control that was
  clicked." Fixing this properly means either lifting per-row pending state
  (e.g. track the deleting id) or accepting the cross-row disable, both of
  which are judgment calls. Separately, `deleteEntry` should return
  `{error?: string}` (matching `updateEntry`'s shape) and the component
  should render it — but that is squarely "what is shown on error," called
  out by the brief as a DECIDE. Recommend: change `deleteEntry`'s signature
  to return `{error?: string}`, track a per-row `deletingId` in
  `EntryList` state to disable only the clicked row's buttons, and show a
  brief inline error (mirroring `EditRow`'s existing `error` span) on
  failure.
- **Ruling (2026-07-06):** FIXED as recommended. `deleteEntry`
  (app/actions/entries.ts) now captures `{ error }` from the `.delete()` call
  and returns `Promise<{ error?: string } | void>`. `EntryList` adds a
  per-row `deletingId` state (distinct from the still-shared
  `startTransition`) and a `deleteError: { id, message } | null` state; the
  delete button sets `deletingId` before calling the action, clears it after,
  and both the edit and delete buttons for that row are disabled only while
  `deletingId === entry.id` — other rows' buttons remain interactive, closing
  the cross-row-disable concern the DECIDE flagged without over-scoping into
  a shared-pending redesign. On error, the message renders as inline
  destructive text next to that row's action buttons (mirroring `EditRow`'s
  existing error span) and clears on the next delete attempt for that row.

## [F-17] `deleteModule` discards its delete error and still unconditionally redirects home
- **Status:** FIXED (commit 0e99bc8) — ruled by user 2026-07-06
- **Severity:** medium
- **Area:** actions
- **What happens:** `deleteModule` (app/actions/modules.ts, pre-fix line
  176) called `await supabase.from('modules').delete()...` with no error
  destructure, then unconditionally ran `revalidatePath('/')` and
  `redirect('/')`. Unlike `deleteChart`/`deleteEntry` (F-14, F-16), which at
  least leave the user on the same page after a silent failure, this one
  actively navigates the user away to the dashboard on every call
  regardless of whether the delete actually succeeded — a failed delete
  (RLS denial, FK constraint from a dependent row, network error) looks
  identical to a successful one from the user's perspective: the tracker
  disappears from view (redirected home) even though it's still in the DB
  and will reappear the next time its module list is fetched. The sole
  caller (`components/delete-module-button.tsx`) fire-and-forgets the call
  inside `startTransition` with no result handling, so there's currently no
  UI path that could surface an error even if one were returned.
- **Where:** app/actions/modules.ts, `deleteModule` (pre-fix line 176,
  unconditional `redirect('/')` after an uninspected delete).
- **Proposed fix:** (partially applied) captured the error and logged it
  server-side (`console.error`) so failures are at least visible in server
  logs, but left the `redirect('/')` unconditional — making the redirect
  conditional on success is a genuine behavior change (what happens on
  failure: stay on the tracker page? show a toast before redirecting?) that
  needs a product decision, not a mechanical fix, and doing it silently
  would risk leaving the user on a tracker page they just "deleted" with no
  explanation either way. Recommend: change the return type to
  `Promise<{ error?: string } | never>` (matching `createChart`'s
  `{ error } | never` pattern), skip the redirect on error, and have
  `DeleteModuleButton` render the error inline (mirroring the
  `EditRow`-style error span called out in F-14).
- **Ruling (2026-07-06):** FIXED as recommended, replacing the partial
  console.error fix. `deleteModule` now returns `Promise<{ error: string } |
  never>`: on delete error it returns `{ error: error.message }` instead of
  falling through; `revalidatePath('/')` + `redirect('/')` now only run on
  the success path (the console.error call was removed — the error is
  returned instead, so it's no longer merely a server-log artifact).
  `DeleteModuleButton` (sole caller) awaits the result inside
  `startTransition` and renders `{error}` as inline destructive text under
  the button (matching `EntryForm`'s error-paragraph idiom); a failed delete
  now leaves the user on the tracker page with a visible reason instead of
  redirecting home as if it succeeded. Verified `redirect()` still functions
  correctly on the success path via `npm run build` (a misused/swallowed
  `redirect()` throws a Next.js internal control-flow signal that build-time
  static analysis and runtime rendering both depend on) — build passed.

## [F-18] `createJournalEntry`'s per-tracker and binary-module writes capture their error but only ever expose success/failure as silent omission from `loggedModules`
- **Status:** FIXED (commit 0e99bc8) — ruled by user 2026-07-06
- **Severity:** low
- **Area:** journal
- **What happens:** `createJournalEntry` (app/actions/journal.ts:192-245)
  fires one `createEntryInModule` call per connected tracker field (loop at
  line 194-207) and, separately, one for the template's binary
  "journaled" marker module (lines 233-242). Both call sites correctly read
  `result.error`/`binaryResult.error` — this is not the "never checked"
  class of bug — but the *only* thing done with a failure is skip pushing
  that module's name onto `loggedModules`; there is no distinction between
  "field wasn't enabled/connected for this module" and "the write to this
  tracker failed." The journal entry itself has already been committed by
  this point (insert at lines 150-159, checked and returned on error
  correctly), so a downstream per-module write failure is genuinely
  non-fatal to the user's data — but the user has no way to tell, from the
  UI, that they journaled "I ran 5 miles" and checked the box to log it to
  their Running tracker, yet the tracker entry silently didn't get created
  because of e.g. a transient DB error. The code comment at line 206
  ("Non-fatal: journal entry already saved; log errors are surfaced via
  loggedModules absence") documents this as intentional, but "surfaced via
  absence" is indistinguishable from "the user didn't check that box in the
  first place."
- **Where:** app/actions/journal.ts:192-207 (per-field tracker loop),
  :233-242 (binary module write) — both discard the specific error message
  from `createEntryInModule`, keeping only a boolean bit of information
  (present/absent in `loggedModules`).
- **Proposed fix:** two directions, both DECIDE since either changes what
  the client can show: (a) minimal — return a separate `failedModules:
  string[]` (or `{name, error}[]`) alongside `loggedModules` so the caller
  *could* show "Logged to Sleep; failed to log to Running: <reason>",
  without forcing a UI change immediately; (b) fuller — have the journal
  capture UI actually render the distinction. Recommend (a) as the
  lower-risk step: it's an additive return-shape change (existing callers
  destructuring `{ id, loggedModules }` are unaffected) that unblocks a UI
  fix later without committing to one now.
- **Ruling (2026-07-06):** FIXED — option (a) plus the minimal render option
  (b), per the user's ruling to adopt the consistent inline-error pattern
  everywhere. `createJournalEntry` now additionally returns `failedModules:
  { name: string; error: string }[]`, populated in both the per-tracker loop
  and the binary-module block wherever `result.error`/`binaryResult.error` is
  set (previously discarded, keeping only the boolean
  present/absent-in-`loggedModules` signal). The stale line-206 comment
  ("log errors are surfaced via loggedModules absence") was corrected to
  describe the current behavior. The return-shape change is additive, so
  `{ id, loggedModules }`-only callers remain type-compatible.
  `components/journal/journal-capture.tsx` adds a `failedModules` state,
  populated from the result on save, and renders one destructive-text line
  per entry ("Couldn't log to {name}: {error}") alongside the existing
  `saveError`/`savedModules` inline messages, following the same idiom.

## Audit-record notes

- Task 6's sweep report (`.superpowers/sdd/task-6-report.md`) claimed "zero
  try/catch blocks in app/actions"; this is inaccurate —
  app/actions/modules.ts:13-17 (`parseOptionalJson`) has one `try { ... }
  catch { ... }` block. It contains no `redirect()` call, so the report's
  actual conclusion (no redirect-swallowed-by-catch pattern exists) still
  stands; only the "zero try blocks" phrasing was wrong.

## Phase 3 notes

- **F-04 copy alignment:** components/formula-summary.tsx:47-48 promises a
  computed value "when every input has a logged value or a configured
  default." The actual lib/formula.ts mechanism (kept as-is, ruled WONTFIX
  2026-07-06) requires at least one input to have a real numeric value that
  day to anchor the date at all — a defaulted input's default never
  conjures a date into existence on its own (the sole-anchor case). Align
  the copy to describe the anchor requirement accurately, rather than
  changing the drop-day semantics.
