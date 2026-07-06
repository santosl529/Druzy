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

## [F-06] `evaluateGoal` treated a missing/non-numeric field as a contributed 0, letting zero-satisfied conditions "phantom-pass" on days with no real data for that field
- **Status:** FIXED (commit pending — see report)
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
- **Status:** DECIDE
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

## [F-08] Same-day category-mode tiebreak was nondeterministic, driven by unspecified DB query row order
- **Status:** FIXED (commit pending — see report)
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

## [F-09] An invalid (not merely unmapped) crystalOverride falls back to a hardcoded default crystal instead of the module's own crystal
- **Status:** DECIDE
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

## [F-10] Out-of-range rating values import silently — the `warning` from `coerceImportValue` is generated but never read anywhere in the pipeline
- **Status:** DECIDE
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

## [F-11] Partial chunk-insert failure during bulk import is swallowed by the wizard when at least one earlier chunk succeeded
- **Status:** DECIDE
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

## [F-12] `FoodLog`'s save/delete/update handlers derived next state from a stale closure over `entries`, racing concurrent row operations
- **Status:** FIXED (commit pending — see report)
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

## [F-14] `EntryList`'s delete button has no in-flight guard — the shared transition's pending flag is discarded — and `deleteEntry` swallows write errors with no client-visible feedback
- **Status:** DECIDE
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

## [F-15] Food-log's "Back to today" control and `PhotoUploader`'s file-input trigger are not gated on their own in-flight state
- **Status:** DECIDE
- **Severity:** low
- **Area:** optimistic-ui
- **What happens:** In `components/food/food-log.tsx`, the two chevron date-nav
  buttons correctly disable on `loadingDate` (lines 113, 132), but the
  "Back to today" text control (a raw `<button>`, lines 120-125) does not —
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
- **Where:** components/food/food-log.tsx:120-125 (`Back to today` button,
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
