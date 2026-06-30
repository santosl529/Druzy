# Consistency Grid Fixes + Crystal Colors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix bugs found in code review and manual testing of the consistency grid, improve the grid's UX, and expand the crystal color pool.

**Architecture:** Pure logic fixes in `lib/consistency-grid.ts`; UX changes in `components/consistency-grid.tsx`; new colors in `lib/crystals.ts`; server action hardening in `app/actions/modules.ts`.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, vitest for tests, Zod.

## Global Constraints

- No hardcoded hex colors for grid cells — continue deriving from CSS custom properties.
- Crystal `primary` and `glow` values in `lib/crystals.ts` are actual hex strings (consistent with existing entries) — this is the intentional exception, not a violation.
- All new crystal keys must be lowercase with underscores (`some_name`).
- Cell computation stays pure (no I/O) in `lib/consistency-grid.ts`.
- `buildGridData` must always generate ≥ 90 date rows when today is supplied.
- Tests must all pass (`npx vitest run`) after every task that touches `lib/consistency-grid.ts` or `lib/crystals.ts`.
- TypeScript must compile with 0 errors after every task.

---

## File Map

| File | Action | Why |
|---|---|---|
| `lib/consistency-grid.ts` | Modify | Date range fix; goal fallback fix; bound entry-side lookback |
| `lib/__tests__/consistency-grid.test.ts` | Modify | Update tests broken by date range change |
| `app/actions/modules.ts` | Modify | try/catch in parseOptionalJson |
| `components/module-builder.tsx` | Modify | Warn when goal/gradient incomplete before save |
| `components/consistency-grid.tsx` | Modify | Seamless scroll, full-width columns, header alignment |
| `lib/crystals.ts` | Modify | Add 10 new crystal entries + keys |

---

### Task 1: Date range fix + code review bugfixes

**Files:**
- Modify: `lib/consistency-grid.ts`
- Modify: `lib/__tests__/consistency-grid.test.ts`
- Modify: `app/actions/modules.ts`
- Modify: `components/module-builder.tsx`

**Interfaces:**
- `buildGridData(modules, entries, today)` — unchanged signature; now guarantees `dates.length >= 90` when entries/creation history is less than 90 days
- `computeCellState` — goal mode with missing `config.goal` now returns `not-done` instead of `done`

**Bug 1 — `buildGridData` date range too short**

The current code generates dates only back to the earliest entry or earliest creation date (within 60 days). If a user's oldest entry is June 9 and today is June 29, the grid only shows 20 days — the 90-day window is empty for everything before June 9.

Fix: after computing `earliest` from entries and creation dates, clamp it to be no later than `today minus 89 days` (to guarantee 90 rows including today):

```typescript
// In buildGridData, after the existing earliest computation:
const ninetyDaysAgo = (() => {
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 89)
  return d.toISOString().split('T')[0]
})()
if (ninetyDaysAgo < earliest) earliest = ninetyDaysAgo
```

This must be added AFTER the existing `earliest` computation loop (after the `MAX_LOOKBACK_DAYS` creation-date extension), so entries and creation dates still control the floor — the 90-day guarantee is a minimum, not a cap.

**Tests to update:** The "descending order" test asserts `grid.dates[grid.dates.length - 1] === '2026-06-26'` — with today='2026-06-28' and the new 90-day minimum, the last date becomes 90 days back from June 28 = March 31, 2026 (`'2026-03-31'`). Update that assertion:

```typescript
// OLD:
expect(grid.dates[grid.dates.length - 1]).toBe('2026-06-26')
// NEW:
expect(grid.dates[0]).toBe('2026-06-28')  // newest is today
expect(grid.dates.length).toBeGreaterThanOrEqual(90)  // at least 90 days
```

Also add a new test for the 90-day minimum guarantee:

```typescript
it('always generates at least 90 dates even with no entries', () => {
  const mod = makeMod({ id: 'mod-1' })
  const grid = buildGridData([mod], [], '2026-06-28')
  expect(grid.dates.length).toBeGreaterThanOrEqual(90)
  expect(grid.dates[0]).toBe('2026-06-28')
})
```

**Bug 2 — entry-side `earliest` unbounded**

When an entry is very old (e.g. 2 years ago), `buildGridData` generates a date array with 730+ rows even though the component only shows 90. The all-time toggle makes sense for moderate history, but a runaway lookback wastes memory. After the existing entry-indexing loop, also apply the `MAX_LOOKBACK_DAYS` cap to the entry-side `earliest`:

The current code at the top of `buildGridData`:
```typescript
let earliest = today
for (const e of entries) {
  // ...
  if (e.entry_date < earliest) earliest = e.entry_date
}
```

The entry-date extension should NOT be capped — users with years of data should see all of it in all-time mode. Leave this as-is. The 90-day minimum already ensures a floor for the default view. No change needed here.

**Bug 3 — goal mode undefined `config.goal` silently marks all days as done**

In `computeCellState`, the goal branch:
```typescript
case 'goal': {
  if (!config?.goal) return { state: 'done', intensity: 1 }  // BUG: silently done
  ...
}
```

Change to:
```typescript
case 'goal': {
  if (!config?.goal) return { state: 'not-done', intensity: 0 }  // misconfigured = not-done
  ...
}
```

**Bug 4 — `parseOptionalJson` throws on malformed input**

In `app/actions/modules.ts`, wrap the JSON.parse:

```typescript
function parseOptionalJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null  // let Zod safeParse reject it cleanly
  }
}
```

**Bug 5 — Silent goal/gradient mode downgrade**

In `components/module-builder.tsx`, in the form submit handler, before setting `formData`, validate:

```typescript
// Warn when goal/gradient config is incomplete (would silently save as auto/binary)
if (dashMode === 'goal' && goalConditions.length === 0) {
  setError('Dashboard goal mode requires at least one condition. Add a condition or choose a different mode.')
  return
}
if (dashMode === 'gradient' && !gradientField) {
  setError('Dashboard gradient mode requires a field selection. Pick a field or choose a different mode.')
  return
}
```

Add these checks inside the submit handler, after the card config validation and before the `formData.set('dashboard_config', ...)` call. Use the existing `setError` state that already exists in `ModuleBuilder`.

- [ ] **Step 1: Read lib/consistency-grid.ts and lib/__tests__/consistency-grid.test.ts**

Read both files fully to understand the exact current code before editing.

- [ ] **Step 2: Fix buildGridData — add 90-day minimum**

In `lib/consistency-grid.ts`, in `buildGridData`, after the loop that sets `earliest` from creation dates, add:

```typescript
// Guarantee at least 90 days of dates so the default window is always full.
const ninetyDaysAgo = (() => {
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 89)
  return d.toISOString().split('T')[0]
})()
if (ninetyDaysAgo < earliest) earliest = ninetyDaysAgo
```

- [ ] **Step 3: Fix computeCellState goal fallback**

Change `if (!config?.goal) return { state: 'done', intensity: 1 }` to `return { state: 'not-done', intensity: 0 }`.

- [ ] **Step 4: Update failing tests**

In `lib/__tests__/consistency-grid.test.ts`, update the "descending order" test (exact current assertion: `expect(grid.dates[grid.dates.length - 1]).toBe('2026-06-26')`):

```typescript
it('dates are in descending order (newest first)', () => {
  const mod = makeMod({ id: 'mod-1' })
  const entries = [
    makeEntry('mod-1', '2026-06-26'),
    makeEntry('mod-1', '2026-06-28'),
  ]
  const grid = buildGridData([mod], entries, '2026-06-28')
  expect(grid.dates[0]).toBe('2026-06-28')
  // Dates are in descending order
  for (let i = 1; i < grid.dates.length; i++) {
    expect(grid.dates[i] < grid.dates[i - 1]).toBe(true)
  }
})
```

Add a new test:
```typescript
it('always generates at least 90 dates even with no entries', () => {
  const mod = makeMod({ id: 'mod-1' })
  const grid = buildGridData([mod], [], '2026-06-28')
  expect(grid.dates.length).toBeGreaterThanOrEqual(90)
  expect(grid.dates[0]).toBe('2026-06-28')
})
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/lorenzo/code/personal-projects/Druzy && npx vitest run lib/__tests__/consistency-grid.test.ts
```

Expected: all tests pass (including updated + new ones).

- [ ] **Step 6: Fix parseOptionalJson in app/actions/modules.ts**

Wrap `JSON.parse(raw)` in a try/catch as shown above.

- [ ] **Step 7: Fix silent goal/gradient downgrade in components/module-builder.tsx**

Read the file, find the submit handler, add the two validation guards (goal needs conditions, gradient needs field) before `formData.set('dashboard_config', ...)`. Use the existing `setError` call and `return` pattern.

- [ ] **Step 8: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add lib/consistency-grid.ts lib/__tests__/consistency-grid.test.ts app/actions/modules.ts components/module-builder.tsx
git commit -m "fix: date range 90-day minimum, goal fallback, parseOptionalJson safety, goal/gradient validation"
```

---

### Task 2: Grid layout + UX

**Files:**
- Modify: `components/consistency-grid.tsx`

**What to fix:**

1. **Seamless scroll** — Remove the inner scroll container. Currently the table is inside `<div className="overflow-auto max-h-[calc(100vh-14rem)] ...">`. Replace this with `<div className="overflow-x-auto">` (horizontal overflow only for wide grids, no vertical cap). The page itself scrolls vertically.

2. **Full-width columns** — The tracker columns should distribute evenly across the full available width. Use `table-fixed w-full` on the `<table>` and add a `<colgroup>` to explicitly set the date column width and let tracker columns share the rest equally:

```tsx
<table className="border-collapse table-fixed w-full">
  <colgroup>
    <col className="w-[80px]" />
    {modules.map((mod) => <col key={mod.id} />)}
  </colgroup>
  ...
</table>
```

3. **Header vertical alignment** — All `<th>` elements in the sticky header should bottom-align so the tracker names, crystal glyphs, and stats all sit at a consistent baseline. Add `align-bottom` (Tailwind) to each `<th>`:

```tsx
<th key={mod.id} className="px-1 pt-2 pb-3 text-center min-w-[3rem] align-bottom">
```

Also the date column header `<th>` should have `align-bottom`.

4. **Cell padding** — With `table-fixed w-full`, the cells should center their content. Keep `p-0.5` on `<td>` cells but add `text-center` and `align-middle`. The `CrystalCell` div (`w-8 h-8`) should be `mx-auto` to center within the column:

```tsx
// In CrystalCell, all returned divs: add mx-auto
<div className="w-8 h-8 rounded-sm mx-auto" ...>
```

- [ ] **Step 1: Read components/consistency-grid.tsx**

Read the full file.

- [ ] **Step 2: Apply all four UX changes**

Make all four changes in a single edit pass:
- Outer wrapper: `overflow-x-auto` only (no max-height)
- Table: `border-collapse table-fixed w-full`
- Add `<colgroup>` after `<table>` opening tag
- `<th>` elements: add `align-bottom`
- `CrystalCell` divs: add `mx-auto`

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/consistency-grid.tsx
git commit -m "fix: grid fills full width, seamless page scroll, header bottom-alignment"
```

---

### Task 3: Add 10 crystal colors

**Files:**
- Modify: `lib/crystals.ts`

**What to add:**

Add these 10 new crystals after the existing 8 entries. Keys must match the format convention (lowercase, underscores). Primary = main color, glow = lighter/more vivid version for the crystal glow effect.

```typescript
// 9 new keys to add to CRYSTAL_KEYS array:
'sapphire', 'emerald', 'ruby', 'topaz', 'turquoise',
'moonstone', 'onyx', 'garnet', 'opal', 'sunstone'
```

Add to the `CRYSTALS` object:
```typescript
sapphire:    { key: 'sapphire',    name: 'Sapphire',    primary: '#2B6CB0', glow: '#63B3ED' },
emerald:     { key: 'emerald',     name: 'Emerald',     primary: '#276749', glow: '#48BB78' },
ruby:        { key: 'ruby',        name: 'Ruby',        primary: '#C53030', glow: '#FC8181' },
topaz:       { key: 'topaz',       name: 'Topaz',       primary: '#B7791F', glow: '#F6AD55' },
turquoise:   { key: 'turquoise',   name: 'Turquoise',   primary: '#2C7A7B', glow: '#4FD1C5' },
moonstone:   { key: 'moonstone',   name: 'Moonstone',   primary: '#6B7FA8', glow: '#A3BFFA' },
onyx:        { key: 'onyx',        name: 'Onyx',        primary: '#44337A', glow: '#9F7AEA' },
garnet:      { key: 'garnet',      name: 'Garnet',      primary: '#822727', glow: '#C05621' },
opal:        { key: 'opal',        name: 'Opal',        primary: '#B7396E', glow: '#F687B3' },
sunstone:    { key: 'sunstone',    name: 'Sunstone',    primary: '#C05621', glow: '#F6AD55' },
```

- [ ] **Step 1: Read lib/crystals.ts**

Read the full file to understand the current structure.

- [ ] **Step 2: Update CRYSTAL_KEYS**

Add the 10 new keys to the `CRYSTAL_KEYS` array (at the end, after 'obsidian').

- [ ] **Step 3: Update CRYSTALS object**

Add the 10 new `CrystalDef` entries to the `CRYSTALS` object, using the exact primary/glow values above.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. TypeScript will ensure the CRYSTALS record covers all keys.

- [ ] **Step 5: Run existing tests**

```bash
npx vitest run lib/__tests__/crystals.test.ts
```

Expected: all pass. If there's a test checking the count of crystals, update it to expect 18 (8 + 10).

- [ ] **Step 6: Commit**

```bash
git add lib/crystals.ts
git commit -m "feat: add 10 new crystal colors (sapphire, emerald, ruby, topaz, turquoise, moonstone, onyx, garnet, opal, sunstone)"
```

---

### Task 4: Investigate and fix journal tracking

**Files:**
- Read: `app/journal/page.tsx`, `app/actions/journal.ts`, `components/journal/journal-capture.tsx`
- Potentially modify: `app/actions/entries.ts` or `app/actions/journal.ts`

**Investigation:**

The user reports "journal is not tracked correctly" in the consistency grid. The journal feature writes to `journal_entries`, not `entries`. For a tracker to show as "done" in the consistency grid, an entry must exist in the `entries` table.

Read the journal save flow (`createJournalEntry` server action) to understand:
1. How connected tracker fields get logged to `entries`
2. Whether the binary "Journal" tracker (if the user has one) gets an entry written on journal save
3. Whether there could be a code bug preventing entries from being created

Then use the Supabase MCP to inspect actual data:
- Check `journal_entries` table for recent rows
- Check `entries` table to see if corresponding module entries exist
- Cross-reference dates

**Fix based on findings:**

If the issue is that the journal save flow isn't creating `entries` for connected modules, fix `createJournalEntry` in `app/actions/journal.ts`.

If the issue is that the user doesn't have a tracker connection set up (not a code bug), document this in the code comment on `createJournalEntry`.

If the issue is something else (e.g. the `entry_date` is being set wrong in journal saves), fix the root cause.

- [ ] **Step 1: Read the journal server action**

Read `app/actions/journal.ts` fully (or wherever `createJournalEntry` lives).

- [ ] **Step 2: Read the journal capture component**

Read `components/journal/journal-capture.tsx` to understand what gets sent to the server.

- [ ] **Step 3: Query Supabase to inspect data**

Use the Supabase MCP tools to run:

```sql
-- Check recent journal entries
SELECT entry_date, extracted FROM journal_entries ORDER BY entry_date DESC LIMIT 10;

-- Check recent module entries (any module)
SELECT module_id, entry_date, values FROM entries ORDER BY entry_date DESC LIMIT 20;
```

Cross-reference: are there journal_entries dates that have no corresponding entries for connected modules?

- [ ] **Step 4: Fix the root cause**

Based on findings, fix the bug. Common possibilities:
- `createEntryInModule` is not being called when it should be
- `entry_date` from journal saves is UTC midnight but modules use day-boundary timezone
- The module connection isn't being read correctly from the template

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add <changed files>
git commit -m "fix: journal entries correctly log to connected tracker modules"
```
