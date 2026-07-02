# Phase 2: Bug & Edge-Case Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically audit the seven risk areas from the Phase 2 spec, fix obvious logic bugs with regression tests, and produce a findings report of judgment-call issues for the user to decide.

**Architecture:** Seven audit tasks (one per risk area, ordered by risk), each with a concrete probe checklist. Probes on pure `lib/` code are executable Vitest cases: a probe that passes becomes a characterization test (pinning correct behavior); a probe that fails reveals a bug. UI/server-action areas get code-reading checklists with named anti-patterns. Task 8 consolidates the findings report.

**Tech Stack:** Vitest, TypeScript strict, Next.js 16 App Router, Supabase.

## Global Constraints

- **Branch:** all work on `refactor/phase-2-bugs`, branched from `refactor/phase-1-cleanup` at `cb649e9`. Create in Task 1 Step 1 if absent.
- **Bug workflow (from spec, user-approved):** *obvious logic bug* → fix immediately + regression test in `lib/__tests__/`; *behavior/UX judgment call* → findings-report entry, NO code change. When unsure which, it's a judgment call — report, don't fix. The controller (Fable 5) adjudicates contested classifications.
- **No schema/data-model changes.** A data bug needing a migration is always a findings entry.
- **No new dependencies.**
- **Findings report:** `docs/superpowers/reviews/2026-07-02-phase2-findings.md`. Every task appends entries in the exact format defined in Task 1 Step 2. Fixed bugs ALSO get a one-line entry (marked FIXED) so the report is the complete audit record.
- **Definition of done per task:** `npx tsc --noEmit` clean, `npm test` passes, `npm run lint` clean (zero warnings).
- **Probe-test adaptation rule:** probe code below states the required ASSERTIONS; adapt fixture construction (Module/Entry literals) to the patterns already used in the named existing test file. Do not weaken an assertion to make a probe pass — a probe that fails against current behavior is a finding.
- **Characterization tests stay:** passing probes are committed as tests (they pin the edge behavior for Phase 3).

---

### Task 1: Date/timezone audit

**Files:**
- Audit: `lib/date.ts`, `lib/analytics.ts` (`computeStreak`), `lib/chart-data.ts` (weekly bucketing, `getCalendarData`), `app/actions/entries.ts:26,74` (UTC fallback), `app/(app)/page.tsx` (`nowMs`/`daysSinceCreated` rounding), `app/(app)/dashboard/page.tsx` (same pattern)
- Test: `lib/__tests__/date-edges.test.ts` (new), extend `lib/__tests__/date.test.ts` if more natural
- Append: `docs/superpowers/reviews/2026-07-02-phase2-findings.md`

**Interfaces:**
- Consumes: `todayInTimezone`, `clientEffectiveTimezone`, `daysAgoInTimezone`, `addDaysISO` from `lib/date.ts`; `computeStreak(entries, timezone)` from `lib/analytics.ts`; `getTimeSeries(entries, config, timezone)` from `lib/chart-data.ts`.
- Produces: the findings-report file with its header + entry format (all later tasks append to it).

- [ ] **Step 1: Create the branch**

```bash
git checkout refactor/phase-1-cleanup && git checkout -b refactor/phase-2-bugs
```

- [ ] **Step 2: Create the findings report skeleton**

Write `docs/superpowers/reviews/2026-07-02-phase2-findings.md`:

```markdown
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
```

- [ ] **Step 3: Run the probe checklist (write as Vitest cases in `lib/__tests__/date-edges.test.ts`)**

```ts
import { describe, expect, it } from 'vitest'
import { todayInTimezone, clientEffectiveTimezone, daysAgoInTimezone, addDaysISO } from '../date'
import { computeStreak } from '../analytics'

describe('timezone fallbacks', () => {
  it('todayInTimezone falls back to UTC for garbage tz', () => {
    expect(todayInTimezone('Not/AZone')).toBe(todayInTimezone('UTC'))
  })
  it('clientEffectiveTimezone returns a usable tz for null/undefined/empty', () => {
    for (const v of [null, undefined, '']) {
      expect(() => todayInTimezone(clientEffectiveTimezone(v))).not.toThrow()
    }
  })
  it('daysAgoInTimezone(0, tz) equals todayInTimezone(tz)', () => {
    expect(daysAgoInTimezone(0, 'America/New_York')).toBe(todayInTimezone('America/New_York'))
  })
})

describe('computeStreak edges', () => {
  // Build Entry fixtures per the patterns in lib/__tests__/consistency-grid.test.ts.
  it('unsorted entries still yield the correct streak', () => { /* entries [today-1, today] passed in reverse order → streak 2 */ })
  it('duplicate entries on one day count once', () => { /* [today, today, today-1] → streak 2 */ })
  it('future-dated entry does not break the streak computation', () => { /* [today+1, today] → no crash, streak ≥ 1 */ })
  it('gap yesterday but entry today → streak 1', () => { /* [today, today-2] → 1 */ })
  it('no entry today but entry yesterday → streak still counts from yesterday', () => {
    // Whatever current behavior is, PIN IT and note which semantic the code implements
    // ("streak alive until a full day is missed" vs "streak broken at midnight").
    // If the implemented semantic contradicts the UI copy anywhere, that's a DECIDE finding.
  })
})
```

Additional executable probes (same file): weekly bucketing in `getTimeSeries` with `bucketBy: 'week'` across a year boundary (Dec 29 – Jan 4) — the Monday calculation at `lib/chart-data.ts:60-67` uses UTC day-of-week; assert the two dates land in the same week bucket and the bucket label is a valid date.

- [ ] **Step 4: Code-reading checks (non-executable surface)**

1. `app/actions/entries.ts:26,74` — the `entry_date` fallback is UTC-today. For a user in UTC-8 logging at 20:00 local, a hypothetical missing form value attributes the entry to *tomorrow*. The form always sends the value today, so decide severity honestly: this is defense-in-depth, likely a low-severity DECIDE entry (proposed fix: fall back to the user's saved timezone via `getUserTimezone` + `todayInTimezone`).
2. `app/(app)/page.tsx` (`nowMs`, `daysSinceCreated` via `Math.round((nowMs - createdMs)/86400000)`) — probe on paper: module created at 23:00 UTC yesterday, user tz UTC: is `daysSinceCreated` 0 or 1, and does `computeOpenness` behave sanely at both? If off-by-one materially changes openness for young modules, DECIDE entry.
3. Grep `savedTimezone || 'UTC'` and `?? 'UTC'` across `app/` — list every site; confirm each is server-side (UTC fallback correct per lib/date.ts's documented convention) vs client-side (browser-tz fallback correct). Any client component defaulting to UTC instead of `clientEffectiveTimezone` is a bug → fix if obvious.

- [ ] **Step 5: Fix obvious bugs found (TDD per bug)**

For each: write the failing regression test in the same test file → run it (`npm test -- lib/__tests__/date-edges.test.ts`, expect FAIL) → minimal fix → PASS → keep both. Add a FIXED findings entry.

- [ ] **Step 6: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add lib/ app/ docs/superpowers/reviews/
git commit -m "audit(date-tz): probe tests, fixes, findings for date/timezone edges"
```

---

### Task 2: Formula evaluation audit

**Files:**
- Audit: `lib/formula.ts` (all of it — parser, `validateExpression`, `computeFormulaSeries`, `withFormulaEntries`), `components/formula-builder.tsx` + `app/actions/formula.ts` (input-selection rules only)
- Test: `lib/__tests__/formula.test.ts` (new — this file has NO existing tests; that alone is a gap for 356 lines of parser/eval code)
- Append: findings report

**Interfaces:**
- Consumes: `validateExpression(expression, aliases): string | null`, `computeFormulaSeries(...)`, `withFormulaEntries(modules, entries): Entry[]`, `FORMULA_VALUE_FIELD` from `lib/formula.ts`.
- Produces: nothing new — tests + findings entries.

- [ ] **Step 1: Probe `validateExpression`**

```ts
import { describe, expect, it } from 'vitest'
import { validateExpression, computeFormulaSeries, withFormulaEntries } from '../formula'

describe('validateExpression', () => {
  it('accepts a valid expression', () => {
    expect(validateExpression('a + b * 2', ['a', 'b'])).toBeNull()
  })
  it('rejects unknown alias', () => {
    expect(validateExpression('a + c', ['a', 'b'])).not.toBeNull()
  })
  it('rejects unbalanced parens', () => {
    expect(validateExpression('(a + b', ['a', 'b'])).not.toBeNull()
  })
  it('rejects empty expression', () => {
    expect(validateExpression('', ['a'])).not.toBeNull()
  })
  it('rejects bare operators / trailing operator', () => {
    expect(validateExpression('a +', ['a'])).not.toBeNull()
    expect(validateExpression('* a', ['a'])).not.toBeNull()
  })
  it('handles alias that is a prefix of another (a vs ab)', () => {
    expect(validateExpression('ab + a', ['a', 'ab'])).toBeNull()
  })
})
```

- [ ] **Step 2: Probe `computeFormulaSeries` numeric edges**

Assertions (adapt fixtures to `Module`/`Entry` shapes; read `lib/formula.ts` first to learn the exact call signature at line 236):
1. Division by zero on one day → that day's output must NOT be `Infinity`/`NaN` leaking into the series. If it is, that's a bug (charts render Infinity as broken scales): decide obvious-vs-judgment by whether downstream guards exist — if `getTimeSeries` filters non-finite, pin it; if Infinity reaches Recharts, FIX (skip non-finite points) or DECIDE if skipping changes chart semantics.
2. Input module has no entry for a day the other input has one → is the day skipped, zero-filled, or NaN? Pin the actual behavior; flag as DECIDE only if it contradicts what `components/formula-summary.tsx` tells the user.
3. Empty entries entirely → returns `[]`, no throw.
4. Non-numeric value in an input field (string in `values`) → no NaN propagation.

- [ ] **Step 3: Probe `withFormulaEntries` composition rules**

1. Formula module whose input references another formula module: can this state exist? Check the builder/action guards (`components/formula-builder.tsx`, `app/actions/formula.ts` — grep `kind === 'formula'` filters on input selection). If a formula-on-formula can be created but `withFormulaEntries` evaluates in one pass, the dependent formula silently sees no data → findings entry (likely FIX in the action guard if a filter is plainly missing, DECIDE if support might be intended).
2. Formula whose input module was deleted (dangling `module_id` in config): assert no throw, and the formula yields empty rather than crashing the trackers page.

- [ ] **Step 4: Fix obvious / report judgment (same TDD cycle as Task 1 Step 5)**

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add lib/ components/ app/ docs/superpowers/reviews/
git commit -m "audit(formula): first test coverage for parser/eval, fixes, findings"
```

---

### Task 3: Consistency-grid audit (category mode is newest)

**Files:**
- Audit: `lib/consistency-grid.ts` (focus: `buildGridData` date logic, `computeCellState` category mode, `evaluateGoal` coercion), `components/consistency-grid.tsx` (window modes, `visibleCount`)
- Test: extend `lib/__tests__/consistency-grid.test.ts` (442 lines of existing patterns to reuse)
- Append: findings report

**Interfaces:**
- Consumes: `evaluateCondition`, `evaluateGoal`, `computeCellState`, `buildGridData(modules, entries, today)`, `computeColumnStats` from `lib/consistency-grid.ts`.
- Produces: tests + findings entries.

- [ ] **Step 1: Probe goal/value coercion**

```ts
describe('evaluateGoal value coercion', () => {
  it('string numeric values coerce ("150" counts as 150) OR are ignored — pin whichever', () => { /* values: { cal: '150' } vs gte 150 */ })
  it('null/undefined/boolean values do not throw and do not satisfy numeric conditions', () => { /* values: { cal: null }, { cal: true } */ })
  it('missing field key across ALL entries → goal false, no NaN comparison true-leak', () => { /* NaN >= x is false, but NaN "between" bounds must also be false */ })
})
```

- [ ] **Step 2: Probe category mode (recent feature, commits c7c567a..f0d9c63)**

Assertions against `computeCellState` and `buildGridData` with a category-mode module (see `docs/superpowers/specs/2026-06-29-category-mode-design.md` for intended behavior — read it first):
1. Entry whose `categoryField` value is NOT in `categoryColors` → cell must not crash; pin what renders (spec says which fallback).
2. Entry with categoryField value `''` or missing → same.
3. Two entries same day with different category values → which wins? Pin it; DECIDE if the spec is silent and the answer is order-dependent (nondeterminism from query order = bug).
4. `crystalOverride` present but not a valid crystal key → renderer fallback, no crash (check `components/consistency-grid.tsx` cell render).

- [ ] **Step 3: Probe grid date-window edges**

1. Module created today with an entry today → today's cell `done`, no `inactive` bleed.
2. Backdated entry BEFORE module creation (regression for a68a89a) → day renders done, not inactive.
3. `buildGridData` with `today` at a month boundary + 90-day window → first/last dates correct (`lib/consistency-grid.ts:210-235` lookback logic).
4. Duplicate same-day entries → one done cell, streak counts once (`:322-335`).

- [ ] **Step 4: Fix obvious / report judgment (TDD cycle)**

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add lib/ components/ docs/superpowers/reviews/
git commit -m "audit(grid): category-mode + window edge probes, fixes, findings"
```

---

### Task 4: Import pipeline audit

**Files:**
- Audit: `lib/import.ts` (all), `components/import/import-wizard.tsx` (mapping UI state), `app/actions/import.ts` (batch insert + partial-failure semantics)
- Test: `lib/__tests__/import.test.ts` (new — no existing coverage for 249 lines)
- Append: findings report

**Interfaces:**
- Consumes: `parseImportDate(raw, format): string | null`, `coerceImportValue(...)`, `validateImportRows(...)`, `rowsToImport(results): ImportRowPayload[]`, `MAX_IMPORT_ROWS` from `lib/import.ts`.
- Produces: tests + findings entries.

- [ ] **Step 1: Probe `parseImportDate`**

```ts
describe('parseImportDate', () => {
  it('parses ISO unambiguously in all three modes', () => {
    for (const f of ['auto', 'mdy', 'dmy'] as const) expect(parseImportDate('2026-07-02', f)).toBe('2026-07-02')
  })
  it('mdy vs dmy disambiguate 01/02/2026 correctly', () => {
    expect(parseImportDate('01/02/2026', 'mdy')).toBe('2026-01-02')
    expect(parseImportDate('01/02/2026', 'dmy')).toBe('2026-02-01')
  })
  it('rejects impossible dates (Feb 30, month 13) with null — not a rolled-over date', () => {
    expect(parseImportDate('02/30/2026', 'mdy')).toBeNull()   // JS Date would roll to Mar 2 — that's the trap
    expect(parseImportDate('13/01/2026', 'mdy')).toBeNull()
  })
  it('auto mode on an ambiguous date: pin the documented choice', () => { /* whatever it does, assert + comment it */ })
  it('trims whitespace; rejects empty/garbage with null', () => {
    expect(parseImportDate('  2026-07-02  ', 'auto')).toBe('2026-07-02')
    expect(parseImportDate('not a date', 'auto')).toBeNull()
  })
  it('two-digit years: pin behavior (accept with century rule, or reject)', () => { /* '01/02/26' */ })
})
```

- [ ] **Step 2: Probe `coerceImportValue` + `validateImportRows`**

1. boolean coercion table: `'yes'/'no'/'true'/'FALSE'/'1'/'0'/''` — pin each.
2. number: `'1,500'`, `'  42 '`, `'42abc'`, `''` — assert no silent `NaN` reaches an `ok` row.
3. rating outside its field's min/max → row `error` (or pin + DECIDE if unbounded ratings import silently).
4. `validateImportRows` at exactly `MAX_IMPORT_ROWS` and `MAX_IMPORT_ROWS + 1`.
5. duplicate semantics: same `entry_date` as an existing entry vs duplicate within the file — assert both mark `duplicate`, and `rowsToImport` excludes `error` AND `duplicate`, includes only `ok`.

- [ ] **Step 3: Code-reading checks**

1. `app/actions/import.ts` (~line 60 on): if the insert of N rows fails at row k — is it one bulk insert (atomic-ish, all-or-nothing per batch) or chunked loop (partial import possible with no user feedback)? Partial-with-silent-success is a finding (likely DECIDE: needs UX for "imported 250 of 400").
2. Does the action re-validate server-side (`importRowSchema`) or trust client rows? Client-only validation on a server action = FIX (add the existing Zod parse) if the schema is already there, DECIDE if semantics unclear.
3. `components/import/import-wizard.tsx`: remapping a column after preview — does stale preview state persist (mapping changed but results not recomputed)? Read the state flow; note findings.

- [ ] **Step 4: Fix obvious / report judgment (TDD cycle)**

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add lib/ components/ app/ docs/superpowers/reviews/
git commit -m "audit(import): parser/coercion/validation probes, fixes, findings"
```

---

### Task 5: Optimistic UI & concurrency audit

**Files:**
- Audit: `components/tracker-grid.tsx`, `components/quick-log-dialog.tsx`, `components/entry-form.tsx`, `components/entry-list.tsx`, `components/food/photo-uploader.tsx`, `components/food/manual-entry.tsx`, `components/food/entry-row.tsx`, `components/food/food-log.tsx`
- Test: component-level pure helpers only (if a fix extracts pure logic, test it in `lib/__tests__/`); otherwise this is a reading audit
- Append: findings report

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: findings entries + targeted fixes.

- [ ] **Step 1: Audit each component against this anti-pattern checklist**

For EACH file listed, answer in the findings notes (only failures become entries):
1. **Double-submit:** is the submit control disabled while the action is pending (`useTransition`/`pending` wired to `disabled`)? A user double-clicking "Log" must not create two entries.
2. **Optimistic update without rollback:** state updated before the server action resolves — if the action returns `{error}`, is the optimistic state reverted? (Known surface: `tracker-grid.tsx` `doneToday`/`entries` sets; food-log `onSaved` totals.)
3. **Error swallowing:** does the component render the action's `{error}` return, or drop it?
4. **Stale closure:** callbacks capturing `entries`/`totals` from an old render then writing them back (`setX(stale)` instead of `setX(prev => ...)`).
5. **`today` drift:** `tracker-grid.tsx:31-40` holds `today` in state — confirm the effect that refreshes it fires on visibility/interval; a tab left open past midnight showing yesterday's "done" state is a finding (severity by spec intent).

- [ ] **Step 2: Fix obvious (mechanical: missing `disabled={pending}`, missing functional updater), report judgment**

An obvious fix here = one that cannot change intended behavior (adding `disabled` during in-flight submit, converting `setX(value)` to `setX(prev => ...)` where the value derives from prev). Anything touching WHAT is shown on error → DECIDE.

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add components/ lib/ docs/superpowers/reviews/
git commit -m "audit(optimistic-ui): double-submit/rollback/staleness fixes and findings"
```

---

### Task 6: Server-action error-handling audit

**Files:**
- Audit: every file in `app/actions/` (`auth.ts`, `charts.ts`, `entries.ts`, `food.ts`, `formula.ts`, `import.ts`, `journal.ts`, `modules.ts`, `profile.ts`) + `app/api/chat/route.ts` tool-execute blocks
- Test: none expected (server actions aren't unit-tested here); fixes verified by tsc/lint/build
- Append: findings report

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: findings entries + targeted fixes.

- [ ] **Step 1: Mechanical greps, then read each hit in context**

```bash
# Writes whose error result is discarded (destructure without `error` or no destructure):
grep -n "await supabase.from(.*)\.\(insert\|update\|delete\|upsert\)" app/actions/*.ts
# For each: is `error` captured AND returned/thrown? Silent failure = FIX (return { error: error.message } to match file conventions).

# Writes not followed by revalidatePath for every route that renders that data:
grep -n "revalidatePath" app/actions/*.ts
# Map each write → the pages that display the data → confirm each is revalidated. Missing = FIX.

# redirect() inside try/catch (Next.js: redirect throws NEXT_REDIRECT; a catch block swallows it):
grep -n -B2 -A8 "try {" app/actions/*.ts | grep -n "redirect"
# Any redirect reachable inside a try whose catch doesn't rethrow = FIX.

# .single() results used without null guard:
grep -n "\.single()" app/actions/*.ts
```

- [ ] **Step 2: Ownership spot-check**

Every mutation filters by `user_id` (RLS is the backstop, but app-level filters are the convention — Task 3 of Phase 1 preserved them). Grep each `.update(`/`.delete(` for a chained `.eq('user_id', user.id)`; missing one is a FIX (add the filter) — note RLS makes it defense-in-depth, severity medium.

- [ ] **Step 3: Fix obvious / report judgment**

Error-message WORDING changes or new user-facing error states = DECIDE. Adding a missing `revalidatePath`, capturing a discarded `error`, moving `redirect` out of `try` = FIX.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/ docs/superpowers/reviews/
git commit -m "audit(actions): error propagation, revalidation, ownership fixes and findings"
```

(`npm run build` included because redirect/revalidate changes surface at build/prerender.)

---

### Task 7: Journal ↔ binary-tracker linkage audit

**Files:**
- Audit: `app/actions/journal.ts` (all five actions), `components/journal/journal-capture.tsx`, `components/journal/journal-template-builder.tsx`, `lib/ollama.ts` (error paths only)
- Test: pure logic extracted to lib gets tests; action-level flows are reading audit
- Append: findings report

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: findings entries + targeted fixes; closes out the audit sequence.

- [ ] **Step 1: Regression re-verification of the two recent fixes**

Read `git show a45101f` and `git show a51b1db` (the connect-journal-to-binary and duplicate-guard fixes), then verify in the CURRENT code:
1. Saving a journal entry twice on the same day → exactly one binary entry (find the guard in `app/actions/journal.ts`; confirm it keys on user+module+date, not just template).
2. `saveJournalTemplate` clearing `binary_module_id` — confirm the explicit-clear path can't be triggered by an unrelated template edit (the a51b1db regression class).

- [ ] **Step 2: Orphan and failure-path checks**

1. Template's `binary_module_id` points at a module that was deleted → does journal capture crash, silently skip, or error? Pin/flag (module deletion should either null the link or capture should guard).
2. Ollama transcription fails mid-capture (`lib/ollama.ts` error paths) → per PRD §6.5 a manual fallback is always shown; confirm the error state doesn't lose the photo or already-entered field values (`journal-capture.tsx` state flow).
3. Journal entry saved but binary-entry insert fails (second write) → what does the user see, and is the journal entry still saved? Partial success with no feedback = finding (likely DECIDE on desired UX).
4. Timezone: journal `entry_date` attribution uses which "today"? Must match the tracker convention (`clientToday(savedTimezone)`); a mismatch double-logs across midnight = FIX.

- [ ] **Step 3: Fix obvious / report judgment (TDD where pure logic allows)**

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add app/ components/ lib/ docs/superpowers/reviews/
git commit -m "audit(journal): linkage regression checks, failure-path fixes and findings"
```

---

### Task 8: Consolidate findings + phase verification

**Files:**
- Modify: `docs/superpowers/reviews/2026-07-02-phase2-findings.md` (dedupe, order by severity, add summary header)
- No code changes in this task.

**Interfaces:**
- Consumes: the findings entries from Tasks 1–7.
- Produces: the decision list for the user.

- [ ] **Step 1: Consolidate**

Sort entries: DECIDE items first (by severity desc), then FIXED items (as the audit record). Add a summary table at top: `| ID | Sev | Area | Title | Status |`. Cross-reference duplicates found by multiple tasks (merge, keep both file:line refs).

- [ ] **Step 2: Full verification suite**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git log --oneline refactor/phase-1-cleanup..HEAD
```

All clean; every commit message follows the `audit(<area>):` convention.

- [ ] **Step 3: Hand to controller**

The controller (Fable 5) reviews the consolidated report, then presents the DECIDE list to the user for fix/defer/reject decisions. Approved fixes become a follow-up execution wave on this branch.

---

## Scope notes

- **Model policy (user requirement):** audit implementers need judgment — use a standard model (Sonnet) minimum; per-task review and final verification on Fable 5; the controller (Fable 5) adjudicates every obvious-vs-judgment classification dispute and presents DECIDE items to the user.
- **Phase 1 leftovers folded in:** the Phase 2 backlog from the Phase 1 final review — longhand `addDaysISO` blocks in `lib/analytics.ts`/`lib/consistency-grid.ts`/`lib/card-summary.ts`, `daysAgoInTimezone` reusing `addDaysISO`, per-helper Supabase clients in `app/actions/charts.ts`/`formula.ts` — are CLEANUPS, not bugs. They ride along only if a task is already editing that exact function for a fix; otherwise they wait (Phase 3 touches most of these files).
- **UI-visual issues** discovered during audits (spacing, color, copy) are out of scope — note them in the findings report under a "Phase 3 notes" section, don't fix.
