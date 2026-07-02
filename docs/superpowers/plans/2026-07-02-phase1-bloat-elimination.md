# Phase 1: Bloat Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplication, dead code, and bundle waste across the Druzy codebase with zero behavior change.

**Architecture:** Seven mechanical, independently verifiable tasks: delete dead exports, consolidate date helpers into `lib/date.ts`, extract shared auth/timezone helpers in `lib/supabase/`, move the repeated `<Nav>` scaffold into a `(app)` route-group layout, dynamic-import Recharts, and split the 930-line `food-log.tsx` along its existing component boundaries.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Supabase SSR client, Vitest, Tailwind v4.

## Global Constraints

- **No new dependencies** (spec non-goal). `next/font` and `next/dynamic` are built-in.
- **Behavior-preserving:** same rendered output, same data written. Any observed behavior change is a bug in the task.
- **No schema/data-model changes.**
- **Definition of done per task:** `npx tsc --noEmit` clean, `npm test` passes, `npm run lint` clean.
- **Branch:** all work on `refactor/phase-1-cleanup`, branched from `main`. Create it in Task 1 Step 1 if it doesn't exist: `git checkout -b refactor/phase-1-cleanup`.
- **Model policy (user requirement):** task implementation may run on any model, but per-task code review and the final phase verification MUST run on Fable 5 (`model: "fable"` when dispatching those subagents).
- Server actions/API routes keep their exact current unauthorized behavior (redirect vs 401) — the helpers support both; never swap one for the other.

## Scope notes (decisions against the spec, made 2026-07-02)

- **`chart-builder.tsx` (622) and `module-builder.tsx` (599) are NOT split in Phase 1.** Unlike `food-log.tsx`, each is one monolithic component with heavily shared state — there are no clean extraction boundaries, so a split would be a rewrite, violating behavior preservation. Both files get restructured anyway in Phase 3 (builders page pass). Only `food-log.tsx` qualifies for mechanical extraction (Task 7).
- **Client→server component audit result:** 30 client components; the interactive ones (tracker grid, consistency grid, builders) are legitimately client and `consistency-grid.tsx` already memoizes its expensive computations. The one real bundle problem is Recharts (Task 6). No further conversions in Phase 1.
- **Redundant Supabase round trips** are addressed by `cache()`-wrapping `getAuthContext` (Task 3), which dedupes the layout+page auth calls that Task 5 would otherwise double. Data-query consolidation beyond that is Phase 2 territory (it changes query shapes → behavior risk).

---

### Task 1: Delete dead exports and demote internal-only exports

**Files:**
- Modify: `lib/chart-data.ts`, `lib/formula.ts`, `lib/ollama.ts`, `lib/types.ts`, `lib/validations.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — removals only. Later tasks do not depend on this task.

Audit result (2026-07-02, verified by grep over `app/ components/ lib/` including `lib/__tests__/`):

**(a) Truly dead — delete the whole declaration** (no references anywhere outside their own definition):
- `daysAgo` in `lib/chart-data.ts`
- `evaluateExpression` in `lib/formula.ts`

**(b) Used only within their own file — remove the `export` keyword, keep the code:**
- `lib/chart-data.ts`: `getFilteredEntries`
- `lib/formula.ts`: `parseExpression`, `extractVariables`, `buildFormulaEntries`
- `lib/ollama.ts`: `getOllamaConfig`, `buildExtractionSchema`
- `lib/types.ts`: `MODULE_KINDS`
- `lib/validations.ts`: `cardSummaryItemSchema`, `cardConfigSchema`, `dashboardConfigSchema`, `moduleFieldSchema`, `formulaInputSchema`, `chartSchema`, `importFieldMappingSchema`, `importMappingSchema`, `importRowSchema`, `journalFieldSchema`

**(c) Exported but referenced only by unit tests — KEEP AS IS** (tests are legitimate consumers): `resolveCardItems`, `isBinaryModule`, `evaluateCondition`, `evaluateGoal`, `computeCellState`, `STAGES`, `getStageIndex`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b refactor/phase-1-cleanup
```

- [ ] **Step 2: Re-verify each item before touching it**

For every name in lists (a) and (b), confirm the audit still holds (the codebase may have moved since the audit):

```bash
grep -rn "\bdaysAgo\b" app components lib --include="*.ts" --include="*.tsx"
```

Expected for list (a): only the definition line. Expected for list (b): definition + same-file references only. **If any name has references in another file, skip it and note it in the commit message — do not force the change.**

- [ ] **Step 3: Apply the deletions and export demotions**

For list (a), delete the entire function including its doc comment. For list (b), change `export function x` → `function x` (and `export const x` → `const x`).

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit && npm test && npm run lint
```

Expected: all clean. `tsc` is the safety net — if anything actually imported a demoted name, it fails here.

- [ ] **Step 5: Commit**

```bash
git add lib/
git commit -m "refactor: delete dead exports, demote internal-only exports in lib/"
```

---

### Task 2: Consolidate date helpers into lib/date.ts

**Files:**
- Modify: `lib/date.ts`
- Modify: `components/food/food-log.tsx`, `components/consistency-grid.tsx`, `components/journal/journal-history.tsx`
- Modify (inline `toISOString().split('T')[0]` swaps): `lib/card-summary.ts`, `lib/analytics.ts`, `lib/consistency-grid.ts`, `lib/chart-data.ts`, `lib/stages.ts`, `components/charts/calendar-heatmap.tsx`
- Test: `lib/__tests__/date.test.ts` (new)

**Interfaces:**
- Produces (used by Task 7 and all listed files):
  - `isoDate(d: Date): string` — UTC YYYY-MM-DD of a Date.
  - `addDaysISO(dateStr: string, days: number): string` — YYYY-MM-DD arithmetic, no timezone drift.
  - `formatDisplayDate(dateStr: string, options: Intl.DateTimeFormatOptions): string` — display formatting of a YYYY-MM-DD string with local-calendar semantics.

Context: three components each define a private `formatDate` differing only in `Intl.DateTimeFormatOptions`; `food-log.tsx` has an `offsetDate`; ~15 call sites hand-roll `d.toISOString().split('T')[0]`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/date.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/date.test.ts`
Expected: FAIL — `date.ts` has no export named `isoDate`.

- [ ] **Step 3: Implement in `lib/date.ts`**

Append:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/date.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the private component helpers**

1. `components/food/food-log.tsx` — delete local `formatDate` (lines ~30–34) and `offsetDate` (lines ~36–43); import `{ addDaysISO, formatDisplayDate }` from `@/lib/date`; call sites become `formatDisplayDate(date, { weekday: 'long', month: 'long', day: 'numeric' })` and `addDaysISO(date, n)`.
2. `components/journal/journal-history.tsx` — delete local `formatDate`; call sites become `formatDisplayDate(dateStr, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })`.
3. `components/consistency-grid.tsx` — delete local `formatDate`; call sites become `formatDisplayDate(date, { month: 'short', day: 'numeric' })`. (The old version parsed as UTC and formatted with `timeZone: 'UTC'` — for a pure date string this renders the identical calendar date as local-parse/local-format, so output is unchanged.)

- [ ] **Step 6: Replace the inline `toISOString().split('T')[0]` sites in lib/**

In `lib/card-summary.ts`, `lib/analytics.ts`, `lib/consistency-grid.ts`, `lib/chart-data.ts`, `lib/stages.ts`, `components/charts/calendar-heatmap.tsx`: wherever a `Date` object is converted with `.toISOString().split('T')[0]`, import and call `isoDate(d)` instead. Find them with:

```bash
grep -rn "toISOString().split" lib components --include="*.ts" --include="*.tsx"
```

Do NOT change `app/actions/entries.ts` (its two sites are inline fallbacks reviewed in Phase 2) or `lib/date.ts` itself (it now owns the pattern). Test files may keep the inline pattern.

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit && npm test && npm run lint
```

Expected: all clean, including the untouched existing suites (`consistency-grid`, `card-summary`, `stages` tests pin behavior of the files edited in Step 6).

- [ ] **Step 8: Commit**

```bash
git add lib/ components/
git commit -m "refactor: consolidate date helpers into lib/date.ts"
```

---

### Task 3: Shared auth helpers (requireUser / getAuthContext)

**Files:**
- Create: `lib/supabase/auth.ts`
- Modify: every file listed in Step 3 (20 pages/actions + 3 API routes + chat route)

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts`.
- Produces (used by Tasks 4 and 5):
  - `getAuthContext(): Promise<{ supabase: SupabaseClient; user: User | null }>` — for API routes that return 401.
  - `requireUser(): Promise<{ supabase: SupabaseClient; user: User }>` — for pages/actions; redirects to `/login` when signed out. Wrapped in React `cache()` so layout + page share one auth round trip per request.

Context: 52 call sites repeat `createClient()` → `auth.getUser()` → `if (!user) redirect('/login')` (pages/actions) or `→ 401` (API routes).

- [ ] **Step 1: Create `lib/supabase/auth.ts`**

```ts
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from './server'

/**
 * Auth context without a redirect — for API routes that answer 401 themselves.
 * React-cached so a layout and its page share one Supabase auth round trip.
 */
export const getAuthContext = cache(
  async (): Promise<{ supabase: SupabaseClient; user: User | null }> => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return { supabase, user }
  },
)

/** Auth for pages and server actions: redirects to /login when signed out. */
export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const { supabase, user } = await getAuthContext()
  if (!user) redirect('/login')
  return { supabase, user }
}
```

- [ ] **Step 2: Typecheck the new module**

Run: `npx tsc --noEmit`
Expected: clean. (If `SupabaseClient` generics mismatch the typed client from `createClient`, use `Awaited<ReturnType<typeof createClient>>` as the client type instead — do not weaken to `any`.)

- [ ] **Step 3: Migrate call sites**

The repeated block

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')
```

becomes `const { supabase, user } = await requireUser()` in **pages and server actions**; API routes that currently return 401 use `const { supabase, user } = await getAuthContext()` and keep their existing `if (!user) return ...401...` line verbatim.

Full site list (from the 2026-07-02 grep audit — re-grep `auth.getUser()` to confirm):
- Pages: `app/page.tsx`, `app/dashboard/page.tsx`, `app/assistant/page.tsx`, `app/food/page.tsx`, `app/journal/page.tsx`, `app/journal/template/page.tsx`, `app/settings/page.tsx`, `app/modules/new/page.tsx`, `app/modules/new/formula/page.tsx`, `app/modules/[id]/page.tsx`, `app/modules/[id]/edit/page.tsx`, `app/modules/[id]/edit/formula/page.tsx`, `app/modules/[id]/import/page.tsx`, `app/modules/[id]/charts/new/page.tsx`, `app/modules/[id]/charts/[chartId]/edit/page.tsx`
- Actions: `app/actions/entries.ts`, `app/actions/modules.ts`, `app/actions/charts.ts`, `app/actions/formula.ts`, `app/actions/food.ts`, `app/actions/journal.ts`, `app/actions/profile.ts`, `app/actions/import.ts`
- API routes (401 style — use `getAuthContext`): `app/api/chat/route.ts`, `app/api/food/analyze/route.ts`, `app/api/food/entries/route.ts`

Per file: replace the block, remove now-unused `createClient` / `redirect` imports (keep `redirect` where the file still uses it elsewhere). **Read each site before editing** — a few pages destructure differently or run the profile fetch in the same `Promise.all`.

- [ ] **Step 4: Confirm no stragglers**

```bash
grep -rn "auth.getUser()" app lib components --include="*.ts" --include="*.tsx"
```

Expected: only `lib/supabase/auth.ts` (and `proxy.ts` if it has its own session handling — leave `proxy.ts` alone; it runs outside React and cannot use `cache()`).

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Expected: all clean. `npm run build` is included because misplaced `redirect()` usage surfaces at build/prerender, not typecheck.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/auth.ts app/
git commit -m "refactor: extract requireUser/getAuthContext, adopt across all pages, actions, API routes"
```

---

### Task 4: Shared getUserTimezone helper

**Files:**
- Modify: `lib/supabase/auth.ts` (add helper)
- Modify: `app/page.tsx`, `app/dashboard/page.tsx`, `app/food/page.tsx`, `app/journal/page.tsx`, `app/modules/[id]/page.tsx`, `app/api/chat/route.ts`, `app/settings/page.tsx`

**Interfaces:**
- Consumes: the typed client produced by `requireUser()`/`getAuthContext()` (Task 3).
- Produces: `getUserTimezone(supabase, userId): Promise<string | null>` — the saved `profiles.day_boundary_tz` or `null` when unset/empty.

Context: 7 files repeat `supabase.from('profiles').select('day_boundary_tz').eq('id', user.id).single()` + `(profile?.day_boundary_tz as string | null) || null` (the chat route uses `|| 'UTC'`).

- [ ] **Step 1: Add to `lib/supabase/auth.ts`**

```ts
/** The user's saved day-boundary timezone (profiles.day_boundary_tz), or null when unset. */
export async function getUserTimezone(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('day_boundary_tz')
    .eq('id', userId)
    .single()
  return (profile?.day_boundary_tz as string | null) || null
}
```

(Match the client type chosen in Task 3 Step 2.)

- [ ] **Step 2: Migrate the 7 call sites**

Each site: replace the `.from('profiles')...single()` + cast dance with `const savedTimezone = await getUserTimezone(supabase, user.id)`. Preserve site-specific details exactly:
- `app/dashboard/page.tsx`, `app/journal/page.tsx`, `app/modules/[id]/page.tsx`, `app/api/chat/route.ts` run the profile fetch inside a `Promise.all` — keep it parallel: put `getUserTimezone(supabase, user.id)` in the same `Promise.all`.
- `app/api/chat/route.ts` keeps its `?? 'UTC'` fallback: `const userTz = (await ...) || 'UTC'` → `const userTz = tz ?? 'UTC'` where `tz` comes from the helper.
- `app/settings/page.tsx` passes the raw value into `<SettingsTimezone savedTimezone={...}>` — pass the helper result.

- [ ] **Step 3: Confirm no stragglers**

```bash
grep -rn "select('day_boundary_tz')" app lib --include="*.ts" --include="*.tsx"
```

Expected: only `lib/supabase/auth.ts` (and `app/actions/profile.ts`, which *updates* the column — leave it).

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit && npm test && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/auth.ts app/
git commit -m "refactor: extract getUserTimezone, adopt across pages and chat route"
```

---

### Task 5: (app) route group with shared Nav layout

**Files:**
- Create: `app/(app)/layout.tsx`
- Move: every protected page directory into `app/(app)/` — `page.tsx`, `dashboard/`, `assistant/`, `food/`, `journal/`, `settings/`, `modules/` (NOT `login/`, `api/`, `actions/`, `layout.tsx`, `globals.css`, `favicon.ico`)
- Modify: all 15 moved pages (remove `<Nav>` and the outer wrapper div)

**Interfaces:**
- Consumes: `requireUser()` from Task 3; `Nav` from `components/nav.tsx`.
- Produces: layout-owned Nav; pages start at their `<main>` element.

Context: all 15 protected pages render `<Nav email={user.email ?? ''} />` inside `<div className="flex flex-col min-h-screen">`. Route groups change file locations, not URLs.

- [ ] **Step 1: Move the protected routes**

```bash
cd /Users/lorenzo/coding/personal-projects/Druzy
mkdir "app/(app)"
git mv app/page.tsx "app/(app)/page.tsx"
git mv app/dashboard "app/(app)/dashboard"
git mv app/assistant "app/(app)/assistant"
git mv app/food "app/(app)/food"
git mv app/journal "app/(app)/journal"
git mv app/settings "app/(app)/settings"
git mv app/modules "app/(app)/modules"
```

(`app/actions/`, `app/api/`, `app/login/`, root `layout.tsx`, `globals.css`, `favicon.ico` stay put.)

- [ ] **Step 2: Create `app/(app)/layout.tsx`**

```tsx
import { Nav } from '@/components/nav'
import { requireUser } from '@/lib/supabase/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser()
  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Strip the per-page scaffold**

In each of the 15 moved pages: remove the `<Nav ... />` element, the surrounding `<div className="flex flex-col min-h-screen">` wrapper (the page's root becomes its `<main>`), and the now-unused `Nav` import. Pages keep their own `requireUser()` call for data (deduped by `cache()` — one auth round trip per request, layout included).

- [ ] **Step 4: Confirm no page-level Nav remains**

```bash
grep -rn "components/nav" app --include="*.tsx"
```

Expected: only `app/(app)/layout.tsx`.

- [ ] **Step 5: Verify build and routes**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Expected: build output lists the same route paths as before the move (`/`, `/dashboard`, `/assistant`, `/food`, `/journal`, `/journal/template`, `/settings`, `/modules/...` — route groups are invisible in URLs), plus `/login`.

- [ ] **Step 6: Smoke-test navigation**

Run `npm run dev`, sign in, click through every nav link and one deep module page (`/modules/[id]/edit`). Expected: Nav renders once per page, identical to before; no double Nav, no missing Nav; sign-out still works.

- [ ] **Step 7: Commit**

```bash
git add -A app/
git commit -m "refactor: move protected pages into (app) route group with shared Nav layout"
```

---

### Task 6: Dynamic-import Recharts

**Files:**
- Modify: `components/module-chart.tsx`, `components/assistant/chart-proposal-card.tsx`, `components/charts/sortable-charts.tsx` (the three importers of `components/charts/recharts-charts.tsx`)
- Create: `components/charts/chart-loading.tsx`

**Interfaces:**
- Consumes: existing exports of `components/charts/recharts-charts.tsx` (inspect the file for exact export names before writing the dynamic wrappers).
- Produces: same component APIs as today — consumers of the three files see no change.

Context: `recharts-charts.tsx` is the only file importing `recharts`, but it is statically imported by three client components, so Recharts lands in the first-load bundle of every page that can show a chart. `next/dynamic` defers it to a lazy chunk.

- [ ] **Step 1: Record the baseline**

```bash
npm run build 2>&1 | tee /tmp/build-before.txt
```

Note the First Load JS of `/modules/[id]`, `/assistant`, and `/dashboard`.

- [ ] **Step 2: Create the loading placeholder**

`components/charts/chart-loading.tsx`:

```tsx
export function ChartLoading() {
  return <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" aria-hidden />
}
```

- [ ] **Step 3: Swap static imports for `next/dynamic`**

In each of the three importers, replace the static named import with a dynamic one per component actually used. Pattern (adjust names to the file's real imports):

```tsx
import dynamic from 'next/dynamic'
import { ChartLoading } from '@/components/charts/chart-loading'

const TimeSeriesChart = dynamic(
  () => import('@/components/charts/recharts-charts').then((m) => m.TimeSeriesChart),
  { ssr: false, loading: () => <ChartLoading /> },
)
```

Type-only imports (`import type { ... } from '.../recharts-charts'`) stay static — types are free. If a file imports several chart components, create one `dynamic()` wrapper per component.

- [ ] **Step 4: Verify bundle improvement**

```bash
npm run build 2>&1 | tee /tmp/build-after.txt
```

Expected: build clean; First Load JS for the three noted routes drops (Recharts is ~100 kB min+gz — the drop should be obvious). If a route did not drop, something still imports `recharts-charts` statically — re-grep and fix.

- [ ] **Step 5: Smoke-test charts**

`npm run dev` → open a module detail page with a chart and the assistant chart proposal flow. Expected: brief pulse placeholder, then the chart renders exactly as before.

- [ ] **Step 6: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add components/
git commit -m "perf: lazy-load Recharts via next/dynamic, keep it out of first-load bundles"
```

---

### Task 7: Split food-log.tsx along its existing component boundaries

**Files:**
- Modify: `components/food/food-log.tsx` (930 lines → the `FoodLog` shell only)
- Create: `components/food/shared.ts` (shared types + `autoMatchField`)
- Create: `components/food/macro-fields.tsx`, `components/food/tracker-log-section.tsx`, `components/food/daily-totals-bar.tsx`, `components/food/photo-uploader.tsx`, `components/food/manual-entry.tsx`, `components/food/entry-row.tsx`

**Interfaces:**
- Consumes: `addDaysISO`/`formatDisplayDate` from Task 2 (already adopted inside this file).
- Produces: named exports matching today's internal components — `MacroFields`, `TrackerLogSection`, `DailyTotalsBar`, `PhotoUploader`, `ManualEntry`, `EntryRow` — with their existing prop types moved beside them; shared types (`MacroValues`, `TrackerSelection`, `DailyTotals`, etc.) and `autoMatchField` in `shared.ts`. `FoodLog`'s public props DO NOT change (its importer, `app/(app)/food/page.tsx`, is untouched).

Context: the file already contains six self-contained inner components (verified at lines 89, 132, 247, 278, 557, 642) plus `autoMatchField` (line 49). This is a mechanical move — code relocates verbatim; only imports/exports are added.

- [ ] **Step 1: Move shared types and helpers**

Create `components/food/shared.ts`. Move (verbatim) the module-level types used by more than one inner component (`MacroValues`, `TrackerSelection`, `DailyTotals`, `MacroEstimate`, and any others the compiler demands) and the `autoMatchField` function. Export everything moved. Add `'use client'` only if it ends up importing client-only code (plain types + a pure function should not need it).

- [ ] **Step 2: Move each component to its own file**

One file per component, in this order (leaf-most first): `macro-fields.tsx`, `daily-totals-bar.tsx`, `tracker-log-section.tsx`, `entry-row.tsx`, `manual-entry.tsx`, `photo-uploader.tsx`. Each file: `'use client'` directive, the component's props interface, the component moved verbatim, `export` added, imports pulled from `shared.ts` / `@/lib/date` / existing modules. Run `npx tsc --noEmit` after each move — the compiler tells you exactly which imports the new file needs.

- [ ] **Step 3: Reduce `food-log.tsx` to the `FoodLog` shell**

`food-log.tsx` keeps only: `'use client'`, the `FoodLog` component, its own props/state types, and imports of the six extracted components. Expected size: roughly 180 lines.

- [ ] **Step 4: Verify no behavior change**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Then `npm run dev` → `/food`: photo-upload flow (select image → analyze → save), manual entry, edit and delete an entry row, date navigation arrows, tracker-log section. Expected: identical behavior throughout.

- [ ] **Step 5: Commit**

```bash
git add components/food/
git commit -m "refactor: split food-log.tsx into per-component files (mechanical move)"
```

---

## Final phase verification (run on Fable 5)

- [ ] `npx tsc --noEmit && npm test && npm run lint && npm run build` — all clean.
- [ ] `git diff main --stat` — review the full phase diff for accidental behavior changes (this is the "final check" the user pinned to Fable 5).
- [ ] Confirm bundle numbers: compare `/tmp/build-before.txt` vs final build for the chart routes.
- [ ] Report: files touched, lines removed vs added, bundle deltas, any list-(a)/(b) items skipped in Task 1, anything deferred to Phase 2.
