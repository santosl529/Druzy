# Consistency Grid Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/dashboard` (all-charts grid) with a consistency grid — a habit-tracking matrix showing every tracker as a column, every day as a row, with crystal glyphs marking completion.

**Architecture:** Server component fetches all modules + all entries in two batched queries; pure `lib/consistency-grid.ts` functions build the grid data (cell states, intensities); a client component handles the 90-day/all-time window toggle and renders the sticky-header table. No new AI logic. Dashboard config (mode/goal/gradient) is a declarative JSON column on `modules`, validated by Zod, editable in the module builder UI.

**Tech Stack:** Next.js App Router (server + client components), Supabase Postgres, Zod, Tailwind CSS, shadcn/ui, vitest for unit tests.

## Global Constraints

- No hardcoded hex color values — all cell colors derive from existing CSS custom properties (`--background`, `--card`, `--foreground`, `--muted`, `--border`) or `color-mix()` of them.
- All grid data loads in two batched queries (modules + entries) — no per-cell or per-tracker N+1 queries.
- Reuse `withFormulaEntries` from `lib/formula.ts` for formula module computed entries — don't duplicate the formula evaluation logic.
- Cell computation (streak, completion %, cell state) is pure TypeScript in `lib/consistency-grid.ts` — importable in both server and client components.
- `dashboardConfig` is a declarative object (mode/goal/gradient) — no JS expressions, no SQL in the config. An AI tool could set it later by writing to the column.
- Formula modules: default mode is `gradient`, field key is `'value'` (from `FORMULA_VALUE_FIELD` in `lib/formula.ts`).
- Keep cells lightweight — a rotated `<div>` (CSS diamond shape) for the crystal glyph, not a full SVG component. Aim for 800-cell renders (90 days × ~9 trackers) to be instant.
- Streak computation follows the same consecutive-date logic as `computeStreak` in `lib/analytics.ts` — don't diverge.
- The all-charts dashboard (previously at `/dashboard`) is fully removed. Per-chart deep-dives stay on each tracker's `/modules/[id]` page.

---

## File Map

| File | Create / Modify | Responsibility |
|---|---|---|
| `supabase/migrations/20240108000000_module_dashboard_config.sql` | **Create** | Adds `dashboard_config jsonb` column to `modules` |
| `lib/types.ts` | **Modify** | Add `DashboardMode`, `GoalOp`, `GoalCondition`, `GoalConfig`, `DashboardConfig`; add `dashboard_config` field to `Module` |
| `lib/validations.ts` | **Modify** | Add `dashboardConfigSchema`; extend `moduleSchema` to accept `dashboard_config` |
| `app/globals.css` | **Modify** | Add `--grid-done` and `--grid-notdone` CSS vars for cell backgrounds |
| `lib/consistency-grid.ts` | **Create** | Pure functions: `evaluateCondition`, `evaluateGoal`, `computeCellState`, `buildGridData`, `computeColumnStats` |
| `lib/__tests__/consistency-grid.test.ts` | **Create** | Unit tests for the above |
| `app/actions/modules.ts` | **Modify** | Accept and persist `dashboard_config` in `createModule` and `updateModule` |
| `app/dashboard/page.tsx` | **Modify** | Replace all-charts data-load with consistency grid data-load; render `<ConsistencyGrid>` |
| `components/consistency-grid.tsx` | **Create** | Client component: sticky-header table, date rows, window toggle, inline stats |
| `components/module-builder.tsx` | **Modify** | Add "Dashboard mode" section (mode select + goal conditions builder + gradient field/range) |
| `docs/prd.md` | **Modify** | Update §5.2a, §7, §9, §10; note removal of all-charts view |

---

### Task 1: DB migration + TypeScript types + Zod schema + CSS vars

**Files:**
- Create: `supabase/migrations/20240108000000_module_dashboard_config.sql`
- Modify: `lib/types.ts`
- Modify: `lib/validations.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `DashboardMode`, `GoalOp`, `GoalCondition`, `GoalConfig`, `DashboardConfig` types; `dashboardConfigSchema` Zod schema; `Module.dashboard_config` field; `--grid-done` / `--grid-notdone` CSS vars.
- Consumed by: Tasks 2, 3, 5, 6.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240108000000_module_dashboard_config.sql

-- Consistency grid config: how each tracker appears in the /dashboard grid.
-- mode 'binary'   → cell = did an entry exist? (or boolean field = true)
-- mode 'goal'     → cell = all conditions met?
-- mode 'gradient' → crystal scales in size/glow with the day's value
-- Null = auto-default: binary for standard modules, gradient for formula modules.
alter table public.modules
  add column if not exists dashboard_config jsonb;

comment on column public.modules.dashboard_config is
  'Consistency grid config: { mode, goal?, gradientField?, gradientRange? }. Null = auto-default.';
```

- [ ] **Step 2: Apply the migration**

Run in Supabase dashboard SQL editor (copy-paste) **or** via CLI:
```bash
supabase db push
```
Verify: the `modules` table now has a `dashboard_config` column of type `jsonb`.

- [ ] **Step 3: Add TypeScript types to `lib/types.ts`**

Add after the `CardConfig` block (before "Domain objects"):

```typescript
// ----------------------------------------------------------------
// Consistency grid dashboard config
// ----------------------------------------------------------------

export type DashboardMode = 'binary' | 'goal' | 'gradient'

export type GoalOp = 'gte' | 'lte' | 'eq' | 'between'

/**
 * One condition in a goal rule. op 'between' uses min+max; all others use value.
 * A future AI tool can populate this declaratively by writing to modules.dashboard_config.
 */
export interface GoalCondition {
  field: string
  op: GoalOp
  /** Used for op ∈ gte | lte | eq */
  value?: number
  /** Used for op = between (inclusive) */
  min?: number
  max?: number
}

export interface GoalConfig {
  conditions: GoalCondition[]
  combine: 'all'  // AND logic; reserved for future 'any' (OR)
}

/**
 * Declarative consistency grid config per module. Stored in modules.dashboard_config.
 * Null = auto-derived default (binary for standard modules, gradient for formula).
 * An AI tool can write this shape directly to configure a tracker's grid behavior.
 */
export interface DashboardConfig {
  mode: DashboardMode
  /** Required when mode = 'goal' */
  goal?: GoalConfig
  /** Field key whose value drives gradient intensity. Required when mode = 'gradient'. */
  gradientField?: string
  /**
   * Fixed normalization range for gradient mode.
   * Omit for auto-fit (min/max across the visible window).
   */
  gradientRange?: { min: number; max: number }
}
```

Update the `Module` interface — add after `card_config`:

```typescript
  /** Consistency grid config. Null = auto-derived default. */
  dashboard_config: DashboardConfig | null
```

- [ ] **Step 4: Add Zod schema to `lib/validations.ts`**

Add after the `cardConfigSchema` block:

```typescript
// ----------------------------------------------------------------
// Dashboard config schema (matches DashboardConfig in lib/types.ts)
// ----------------------------------------------------------------

const goalConditionSchema = z.union([
  z.object({
    field: z.string().min(1),
    op: z.enum(['gte', 'lte', 'eq']),
    value: z.number(),
  }),
  z.object({
    field: z.string().min(1),
    op: z.literal('between'),
    min: z.number(),
    max: z.number(),
  }),
])

const goalConfigSchema = z.object({
  conditions: z.array(goalConditionSchema).min(1, 'Add at least one condition').max(10),
  combine: z.literal('all'),
})

export const dashboardConfigSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('binary') }),
  z.object({ mode: z.literal('goal'), goal: goalConfigSchema }),
  z.object({
    mode: z.literal('gradient'),
    gradientField: z.string().min(1, 'Pick a field for gradient intensity'),
    gradientRange: z
      .object({ min: z.number(), max: z.number() })
      .refine((r) => r.max > r.min, 'Max must be greater than min')
      .optional(),
  }),
])
```

Then update `moduleSchema` — inside the `.object({...})` call, add after `card_config`:

```typescript
    dashboard_config: dashboardConfigSchema.nullable().optional(),
```

- [ ] **Step 5: Add CSS custom properties to `app/globals.css`**

Inside `:root { ... }`, add after `--stone-border: var(--border);`:

```css
  /* Consistency grid cell backgrounds */
  --grid-done: var(--card);       /* light mode: white card for done cells */
  --grid-notdone: var(--muted);   /* light mode: light gray for not-done cells */
```

Inside `.dark { ... }`, add after `--stone-border: var(--border);`:

```css
  /* Consistency grid cell backgrounds */
  --grid-done: color-mix(in oklch, var(--foreground) 85%, var(--background) 15%);  /* ~L0.81 light neutral */
  --grid-notdone: var(--muted);   /* dark gray, one step above background */
```

Also add inside the `@media (prefers-color-scheme: dark) { :root:not(.light) { ... } }` block:

```css
    --grid-done: color-mix(in oklch, var(--foreground) 85%, var(--background) 15%);
    --grid-notdone: var(--muted);
```

- [ ] **Step 6: Typecheck**

```bash
cd /Users/lorenzo/code/personal-projects/Druzy && npx tsc --noEmit
```

Expected: 0 errors. If the `Module` interface change breaks callers that spread or type-assert modules, update them — typically just casting `as Module` where Supabase returns untyped data.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20240108000000_module_dashboard_config.sql lib/types.ts lib/validations.ts app/globals.css
git commit -m "feat: add dashboard_config type, schema, migration, and CSS vars for consistency grid"
```

---

### Task 2: Consistency Grid Pure Logic

**Files:**
- Create: `lib/consistency-grid.ts`
- Create: `lib/__tests__/consistency-grid.test.ts`

**Interfaces:**
- Consumes: `DashboardConfig`, `DashboardMode`, `GoalCondition`, `GoalConfig`, `Module`, `Entry` from `lib/types.ts`; `getBinaryField` from `lib/card.ts`; `withFormulaEntries` from `lib/formula.ts`.
- Produces:
  - `CellState: 'done' | 'not-done' | 'inactive'`
  - `GridCell: { state: CellState; intensity: number; rawValue?: number }`
  - `GridData: { modules: Module[]; dates: string[]; cells: GridCell[][] }`
  - `ColumnStats: { currentStreak: number; longestStreak: number; completionPct: number }`
  - `evaluateCondition(condition: GoalCondition, value: number): boolean`
  - `evaluateGoal(goal: GoalConfig, dayEntries: Record<string, unknown>[]): boolean`
  - `computeCellState(mod: Module, dayEntries: Record<string, unknown>[], date: string, gradientRange: { min: number; max: number } | null): GridCell`
  - `buildGridData(modules: Module[], entries: Entry[], today: string): GridData`
  - `computeColumnStats(cells: GridCell[], dates: string[], today: string): ColumnStats`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/consistency-grid.test.ts
import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  evaluateGoal,
  computeCellState,
  buildGridData,
  computeColumnStats,
} from '../consistency-grid'
import type { Module, Entry } from '../types'

// ── evaluateCondition ───────────────────────────────────────────

describe('evaluateCondition', () => {
  it('gte: value equals threshold → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'gte', value: 150 }, 150)).toBe(true)
  })
  it('gte: value below threshold → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'gte', value: 150 }, 149)).toBe(false)
  })
  it('lte: value equals threshold → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'lte', value: 3000 }, 3000)).toBe(true)
  })
  it('lte: value above threshold → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'lte', value: 3000 }, 3001)).toBe(false)
  })
  it('eq: exact match → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'eq', value: 5 }, 5)).toBe(true)
  })
  it('eq: no match → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'eq', value: 5 }, 6)).toBe(false)
  })
  it('between: value in range → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 150)).toBe(true)
  })
  it('between: value below range → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 50)).toBe(false)
  })
  it('between: value above range → false', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 201)).toBe(false)
  })
  it('between: inclusive lower bound → true', () => {
    expect(evaluateCondition({ field: 'x', op: 'between', min: 100, max: 200 }, 100)).toBe(true)
  })
})

// ── evaluateGoal ────────────────────────────────────────────────

describe('evaluateGoal', () => {
  it('single gte condition: sum meets threshold → true', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 150 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ cal: 160 }])).toBe(true)
  })
  it('single gte condition: sum misses threshold → false', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 150 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [{ cal: 100 }])).toBe(false)
  })
  it('multiple entries: sums field values across entries', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 2800 }], combine: 'all' as const }
    // Two meals: 1500 + 1400 = 2900 ≥ 2800
    expect(evaluateGoal(goal, [{ cal: 1500 }, { cal: 1400 }])).toBe(true)
  })
  it('multiple conditions: all pass → true', () => {
    const goal = {
      conditions: [
        { field: 'cal', op: 'between' as const, min: 2800, max: 3000 },
        { field: 'protein', op: 'gte' as const, value: 150 },
      ],
      combine: 'all' as const,
    }
    expect(evaluateGoal(goal, [{ cal: 2900, protein: 160 }])).toBe(true)
  })
  it('multiple conditions: one fails → false', () => {
    const goal = {
      conditions: [
        { field: 'cal', op: 'between' as const, min: 2800, max: 3000 },
        { field: 'protein', op: 'gte' as const, value: 150 },
      ],
      combine: 'all' as const,
    }
    // cal OK but protein too low
    expect(evaluateGoal(goal, [{ cal: 2900, protein: 100 }])).toBe(false)
  })
  it('no entries → false', () => {
    const goal = { conditions: [{ field: 'cal', op: 'gte' as const, value: 100 }], combine: 'all' as const }
    expect(evaluateGoal(goal, [])).toBe(false)
  })
})

// ── computeCellState ─────────────────────────────────────────────

// Minimal module factory
function makeMod(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    user_id: 'u-1',
    name: 'Test',
    fields: [{ key: 'done', label: 'Done', type: 'boolean', required: false }],
    kind: 'standard',
    formula_config: null,
    crystal_type: 'amethyst',
    card_config: null,
    dashboard_config: null,
    is_builtin: false,
    shared: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeCellState', () => {
  it('date before module creation → inactive', () => {
    const mod = makeMod({ created_at: '2026-06-01T00:00:00Z' })
    const cell = computeCellState(mod, [], '2026-05-31', null)
    expect(cell.state).toBe('inactive')
  })

  it('binary mode, single boolean true → done', () => {
    const mod = makeMod() // single boolean field
    const cell = computeCellState(mod, [{ done: true }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.intensity).toBe(1)
  })

  it('binary mode, single boolean false → not-done', () => {
    const mod = makeMod()
    const cell = computeCellState(mod, [{ done: false }], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
  })

  it('binary mode, multi-field module, has entry → done', () => {
    const mod = makeMod({
      fields: [
        { key: 'calories', label: 'Calories', type: 'number', required: false },
        { key: 'protein', label: 'Protein', type: 'number', required: false },
      ],
    })
    const cell = computeCellState(mod, [{ calories: 2000, protein: 150 }], '2026-06-28', null)
    expect(cell.state).toBe('done')
  })

  it('binary mode, no entry → not-done', () => {
    const mod = makeMod()
    const cell = computeCellState(mod, [], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
  })

  it('goal mode, conditions met → done', () => {
    const mod = makeMod({
      fields: [{ key: 'cal', label: 'Cal', type: 'number', required: false }],
      dashboard_config: {
        mode: 'goal',
        goal: { conditions: [{ field: 'cal', op: 'gte', value: 150 }], combine: 'all' },
      },
    })
    const cell = computeCellState(mod, [{ cal: 200 }], '2026-06-28', null)
    expect(cell.state).toBe('done')
  })

  it('goal mode, conditions not met → not-done', () => {
    const mod = makeMod({
      fields: [{ key: 'cal', label: 'Cal', type: 'number', required: false }],
      dashboard_config: {
        mode: 'goal',
        goal: { conditions: [{ field: 'cal', op: 'gte', value: 150 }], combine: 'all' },
      },
    })
    const cell = computeCellState(mod, [{ cal: 100 }], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
  })

  it('gradient mode, returns intensity proportional to value', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 75 }], '2026-06-28', { min: 0, max: 100 })
    expect(cell.state).toBe('done')
    expect(cell.intensity).toBeCloseTo(0.75)
    expect(cell.rawValue).toBe(75)
  })

  it('gradient mode, value at max → intensity 1', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 100 }], '2026-06-28', { min: 0, max: 100 })
    expect(cell.intensity).toBe(1)
  })

  it('gradient mode, value exceeds max → intensity clamped to 1', () => {
    const mod = makeMod({
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const cell = computeCellState(mod, [{ score: 150 }], '2026-06-28', { min: 0, max: 100 })
    expect(cell.intensity).toBe(1)
  })
})

// ── computeColumnStats ──────────────────────────────────────────

describe('computeColumnStats', () => {
  it('no cells → 0 streak, 0%', () => {
    const stats = computeColumnStats([], [], '2026-06-28')
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(0)
    expect(stats.completionPct).toBe(0)
  })

  it('today done → currentStreak = 1', () => {
    const cells = [{ state: 'done' as const, intensity: 1 }]
    const dates = ['2026-06-28']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(1)
  })

  it('today done, yesterday done → currentStreak = 2', () => {
    const cells = [
      { state: 'done' as const, intensity: 1 },  // 2026-06-28 (today)
      { state: 'done' as const, intensity: 1 },  // 2026-06-27
    ]
    const dates = ['2026-06-28', '2026-06-27']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(2)
  })

  it('gap yesterday breaks current streak', () => {
    const cells = [
      { state: 'done' as const, intensity: 1 },      // today
      { state: 'not-done' as const, intensity: 0 },   // yesterday - gap
      { state: 'done' as const, intensity: 1 },      // 2 days ago
    ]
    const dates = ['2026-06-28', '2026-06-27', '2026-06-26']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(1)
    expect(stats.longestStreak).toBe(2) // days ago: ... wait, longest is 1 segment of 1 + 1 segment of 1. Actually longest = 1 since no 2 consecutive.
  })

  it('3 consecutive days in the past → longestStreak 3, currentStreak 0 if not recent', () => {
    // Data from 7 days ago: 3 consecutive, then a gap
    const cells = [
      { state: 'not-done' as const, intensity: 0 }, // today
      { state: 'not-done' as const, intensity: 0 }, // yesterday
      { state: 'not-done' as const, intensity: 0 },
      { state: 'done' as const, intensity: 1 },
      { state: 'done' as const, intensity: 1 },
      { state: 'done' as const, intensity: 1 },
      { state: 'not-done' as const, intensity: 0 },
    ]
    const dates = [
      '2026-06-28', '2026-06-27', '2026-06-26',
      '2026-06-25', '2026-06-24', '2026-06-23',
      '2026-06-22',
    ]
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(3)
  })

  it('completionPct: 3 done out of 4 active (1 inactive)', () => {
    const cells = [
      { state: 'done' as const, intensity: 1 },
      { state: 'done' as const, intensity: 1 },
      { state: 'not-done' as const, intensity: 0 },
      { state: 'done' as const, intensity: 1 },
      { state: 'inactive' as const, intensity: 0 }, // inactive: doesn't count
    ]
    const dates = ['2026-06-28', '2026-06-27', '2026-06-26', '2026-06-25', '2026-06-24']
    const stats = computeColumnStats(cells, dates, '2026-06-28')
    expect(stats.completionPct).toBe(75) // 3/4 = 75%
  })
})

// ── buildGridData ────────────────────────────────────────────────

describe('buildGridData', () => {
  function makeEntry(moduleId: string, date: string, values: Record<string, unknown> = {}): Entry {
    return {
      id: `e-${moduleId}-${date}`,
      module_id: moduleId,
      user_id: 'u-1',
      values,
      entry_date: date,
      created_at: `${date}T10:00:00Z`,
    }
  }

  it('entry exists on a date → done cell for that column+row', () => {
    const mod = makeMod({ id: 'mod-1' })
    const entries = [makeEntry('mod-1', '2026-06-28', { done: true })]
    const grid = buildGridData([mod], entries, '2026-06-28')
    expect(grid.dates[0]).toBe('2026-06-28')
    expect(grid.cells[0][0].state).toBe('done')
  })

  it('date before module creation → inactive cell', () => {
    const mod = makeMod({ id: 'mod-1', created_at: '2026-06-15T00:00:00Z' })
    const entries = [makeEntry('mod-1', '2026-06-28')]
    const grid = buildGridData([mod], entries, '2026-06-28')
    // find the index for 2026-06-14 (before creation)
    const idx = grid.dates.indexOf('2026-06-14')
    expect(idx).toBeGreaterThan(-1)
    expect(grid.cells[0][idx].state).toBe('inactive')
  })

  it('dates are in descending order (newest first)', () => {
    const mod = makeMod({ id: 'mod-1' })
    const entries = [
      makeEntry('mod-1', '2026-06-26'),
      makeEntry('mod-1', '2026-06-28'),
    ]
    const grid = buildGridData([mod], entries, '2026-06-28')
    expect(grid.dates[0]).toBe('2026-06-28')
    expect(grid.dates[grid.dates.length - 1]).toBe('2026-06-26')
  })

  it('gradient mode auto-fits range to window data', () => {
    const mod = makeMod({
      id: 'mod-1',
      fields: [{ key: 'score', label: 'Score', type: 'number', required: false }],
      dashboard_config: { mode: 'gradient', gradientField: 'score' },
    })
    const entries = [
      makeEntry('mod-1', '2026-06-28', { score: 10 }),
      makeEntry('mod-1', '2026-06-27', { score: 20 }),
    ]
    const grid = buildGridData([mod], entries, '2026-06-28')
    const cell28 = grid.cells[0][0]
    const cell27 = grid.cells[0][1]
    // 10 is min, 20 is max. 10→intensity 0, 20→intensity 1
    expect(cell28.intensity).toBeCloseTo(0)
    expect(cell27.intensity).toBeCloseTo(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/lorenzo/code/personal-projects/Druzy && npx vitest run lib/__tests__/consistency-grid.test.ts
```

Expected: FAIL with "Cannot find module '../consistency-grid'"

- [ ] **Step 3: Implement `lib/consistency-grid.ts`**

```typescript
import type { DashboardConfig, DashboardMode, GoalCondition, GoalConfig, Module, Entry } from './types'
import { getBinaryField } from './card'

// ----------------------------------------------------------------
// Output types
// ----------------------------------------------------------------

export type CellState = 'done' | 'not-done' | 'inactive'

export interface GridCell {
  state: CellState
  /** 0–1: always 1 for binary done, 0 for not-done; varies for gradient. */
  intensity: number
  /** The day's summed field value (gradient mode only, for hover display). */
  rawValue?: number
}

export interface GridData {
  modules: Module[]
  /** All dates in descending order (newest first, oldest last). */
  dates: string[]
  /**
   * cells[moduleIndex][dateIndex] — parallel to `modules` and `dates`.
   * dateIndex 0 = today, dateIndex 1 = yesterday, etc.
   */
  cells: GridCell[][]
}

export interface ColumnStats {
  currentStreak: number
  longestStreak: number
  /** Percentage of active (non-inactive) days that are done. 0–100, integer. */
  completionPct: number
}

// ----------------------------------------------------------------
// Goal evaluation
// ----------------------------------------------------------------

export function evaluateCondition(condition: GoalCondition, value: number): boolean {
  switch (condition.op) {
    case 'gte': return value >= condition.value!
    case 'lte': return value <= condition.value!
    case 'eq': return value === condition.value!
    case 'between': return value >= condition.min! && value <= condition.max!
  }
}

/**
 * Evaluates a goal against all entries for a single day.
 * Multi-entry fields are summed (e.g. calories across multiple meals).
 * Returns false when no entries exist.
 */
export function evaluateGoal(
  goal: GoalConfig,
  dayEntries: Record<string, unknown>[],
): boolean {
  if (dayEntries.length === 0) return false
  return goal.conditions.every((cond) => {
    const total = dayEntries.reduce((sum, entry) => {
      const v = Number(entry[cond.field])
      return isNaN(v) ? sum : sum + v
    }, 0)
    return evaluateCondition(cond, total)
  })
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function getEffectiveMode(mod: Module, config: DashboardConfig | null): DashboardMode {
  if (config?.mode) return config.mode
  // Formula modules default to gradient (they always produce a numeric value).
  if (mod.kind === 'formula') return 'gradient'
  return 'binary'
}

function getFirstNumericFieldKey(mod: Module): string | null {
  // Formula modules expose their computed output as the 'value' field.
  if (mod.kind === 'formula') return 'value'
  const f = mod.fields.find((f) => f.type === 'number' || f.type === 'rating')
  return f?.key ?? null
}

// ----------------------------------------------------------------
// Cell state
// ----------------------------------------------------------------

/**
 * Compute the grid cell state for one module on one day.
 *
 * @param mod           - The module (includes dashboard_config and fields).
 * @param dayEntries    - entries.values[] for entries logged on this day for this module.
 * @param date          - The day (YYYY-MM-DD).
 * @param gradientRange - Normalization range for gradient mode.
 *                        Pass null to produce intensity=0 (caller handles auto-fit).
 */
export function computeCellState(
  mod: Module,
  dayEntries: Record<string, unknown>[],
  date: string,
  gradientRange: { min: number; max: number } | null,
): GridCell {
  // Days before the module existed are inactive (not failures).
  const createdDate = mod.created_at.split('T')[0]
  if (date < createdDate) return { state: 'inactive', intensity: 0 }

  const config = mod.dashboard_config
  const mode = getEffectiveMode(mod, config)

  if (dayEntries.length === 0) {
    return { state: 'not-done', intensity: 0 }
  }

  switch (mode) {
    case 'binary': {
      const binaryField = getBinaryField(mod)
      if (binaryField) {
        // Single-boolean module: check the boolean value in any entry.
        const done = dayEntries.some((e) => e[binaryField.key] === true)
        return { state: done ? 'done' : 'not-done', intensity: done ? 1 : 0 }
      }
      // Multi-field module: any logged entry = done.
      return { state: 'done', intensity: 1 }
    }

    case 'goal': {
      if (!config?.goal) return { state: 'done', intensity: 1 }
      const done = evaluateGoal(config.goal, dayEntries)
      return { state: done ? 'done' : 'not-done', intensity: done ? 1 : 0 }
    }

    case 'gradient': {
      const fieldKey = config?.gradientField ?? getFirstNumericFieldKey(mod)
      if (!fieldKey) return { state: 'done', intensity: 1 }
      const rawValue = dayEntries.reduce((sum, e) => {
        const v = Number(e[fieldKey])
        return isNaN(v) ? sum : sum + v
      }, 0)
      if (!gradientRange || gradientRange.max <= gradientRange.min) {
        return { state: 'done', intensity: 0.5, rawValue }
      }
      const intensity = Math.min(
        1,
        Math.max(0, (rawValue - gradientRange.min) / (gradientRange.max - gradientRange.min)),
      )
      return { state: 'done', intensity, rawValue }
    }
  }
}

// ----------------------------------------------------------------
// Grid data builder
// ----------------------------------------------------------------

/**
 * Build the full grid data from modules and entries.
 * All computation runs in O(entries + modules × dates) — no nested loops over entries.
 *
 * @param modules - All user modules (standard + formula; formula entries must already
 *                  be computed via withFormulaEntries before calling this).
 * @param entries - All entries in the display window (pre-computed formula entries included).
 * @param today   - The current date (YYYY-MM-DD, day-boundary timezone resolved server-side).
 */
export function buildGridData(modules: Module[], entries: Entry[], today: string): GridData {
  if (modules.length === 0) return { modules: [], dates: [today], cells: [] }

  // 1. Build index: moduleId → date → values[]
  const index = new Map<string, Map<string, Record<string, unknown>[]>>()
  let earliest = today
  for (const e of entries) {
    let byDate = index.get(e.module_id)
    if (!byDate) { byDate = new Map(); index.set(e.module_id, byDate) }
    const day = byDate.get(e.entry_date) ?? []
    day.push(e.values as Record<string, unknown>)
    byDate.set(e.entry_date, day)
    if (e.entry_date < earliest) earliest = e.entry_date
  }

  // Also consider module creation dates to extend the date range.
  for (const mod of modules) {
    const created = mod.created_at.split('T')[0]
    if (created < earliest) earliest = created
  }

  // 2. Generate descending date list from today back to earliest
  const dates: string[] = []
  const cursor = new Date(today + 'T00:00:00Z')
  const end = new Date(earliest + 'T00:00:00Z')
  while (cursor >= end) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  // 3. Compute gradient ranges (auto-fit per module, using configured range if set)
  const gradientRanges = new Map<string, { min: number; max: number }>()
  for (const mod of modules) {
    const config = mod.dashboard_config
    if (config?.gradientRange) {
      gradientRanges.set(mod.id, config.gradientRange)
      continue
    }
    const mode = getEffectiveMode(mod, config)
    if (mode !== 'gradient') continue
    const fieldKey = config?.gradientField ?? getFirstNumericFieldKey(mod)
    if (!fieldKey) continue
    const byDate = index.get(mod.id)
    if (!byDate) continue
    let min = Infinity, max = -Infinity
    for (const dayEntries of byDate.values()) {
      const total = dayEntries.reduce((sum, e) => {
        const v = Number(e[fieldKey]); return isNaN(v) ? sum : sum + v
      }, 0)
      if (dayEntries.length > 0) { min = Math.min(min, total); max = Math.max(max, total) }
    }
    if (min <= max && isFinite(min) && isFinite(max)) gradientRanges.set(mod.id, { min, max })
  }

  // 4. Build cells[moduleIdx][dateIdx]
  const cells: GridCell[][] = modules.map((mod) => {
    const byDate = index.get(mod.id)
    const range = gradientRanges.get(mod.id) ?? null
    return dates.map((date) => {
      const dayEntries = byDate?.get(date) ?? []
      return computeCellState(mod, dayEntries, date, range)
    })
  })

  return { modules, dates, cells }
}

// ----------------------------------------------------------------
// Column statistics
// ----------------------------------------------------------------

/**
 * Compute streak and completion stats for one module column.
 * Operates over the passed cells/dates slice (caller controls the window).
 * Note: current/longest streak may be shorter than reality if the window
 * is narrower than the actual streak — acceptable for a personal tool.
 */
export function computeColumnStats(
  cells: GridCell[],
  dates: string[],  // same order as cells (descending)
  today: string,
): ColumnStats {
  if (cells.length === 0) return { currentStreak: 0, longestStreak: 0, completionPct: 0 }

  // Completion %: done / (done + not-done), excluding inactive.
  const activeCells = cells.filter((c) => c.state !== 'inactive')
  const doneCells = cells.filter((c) => c.state === 'done')
  const completionPct =
    activeCells.length > 0 ? Math.round((doneCells.length / activeCells.length) * 100) : 0

  // Build a Set of done dates for streak computation.
  const doneDateSet = new Set(dates.filter((_, i) => cells[i].state === 'done'))

  // Current streak: count backwards from today.
  const yesterday = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().split('T')[0]
  })()

  let currentStreak = 0
  if (doneDateSet.has(today) || doneDateSet.has(yesterday)) {
    const start = doneDateSet.has(today) ? today : yesterday
    const cur = new Date(start + 'T00:00:00Z')
    while (doneDateSet.has(cur.toISOString().split('T')[0])) {
      currentStreak++
      cur.setUTCDate(cur.getUTCDate() - 1)
    }
  }

  // Longest streak: scan ascending done dates.
  const ascDoneDates = [...doneDateSet].sort()
  let longestStreak = ascDoneDates.length > 0 ? 1 : 0
  let runLen = ascDoneDates.length > 0 ? 1 : 0
  for (let i = 1; i < ascDoneDates.length; i++) {
    const prev = new Date(ascDoneDates[i - 1] + 'T00:00:00Z')
    const curr = new Date(ascDoneDates[i] + 'T00:00:00Z')
    const diff = (curr.getTime() - prev.getTime()) / 86_400_000
    if (diff === 1) {
      runLen++
      longestStreak = Math.max(longestStreak, runLen)
    } else {
      runLen = 1
    }
  }

  return { currentStreak, longestStreak, completionPct }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/lorenzo/code/personal-projects/Druzy && npx vitest run lib/__tests__/consistency-grid.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/consistency-grid.ts lib/__tests__/consistency-grid.test.ts
git commit -m "feat: add consistency grid pure logic (cell state, grid builder, column stats)"
```

---

### Task 3: Server Action Update

**Files:**
- Modify: `app/actions/modules.ts`

**Interfaces:**
- Consumes: `dashboardConfigSchema` from `lib/validations.ts`.
- Produces: `modules.dashboard_config` persisted in Supabase; `updateModule` and `createModule` round-trip the field.

- [ ] **Step 1: Update `parseCardConfig` to handle `dashboard_config` too**

In `app/actions/modules.ts`, the existing `parseCardConfig` function already parses optional JSON. Rename it to `parseOptionalJson` to make it generic, then use it for both `card_config` and `dashboard_config`:

Find:
```typescript
function parseCardConfig(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw === '') return null
  return JSON.parse(raw)
}
```

Replace with:
```typescript
function parseOptionalJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw === '') return null
  return JSON.parse(raw)
}
```

- [ ] **Step 2: Update `createModule` to read and persist `dashboard_config`**

Inside `createModule`, find the `raw` object literal:
```typescript
  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
    crystal_type: formData.get('crystal_type') as string,
    card_config: parseCardConfig(formData.get('card_config')),
  }
```

Replace with:
```typescript
  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
    crystal_type: formData.get('crystal_type') as string,
    card_config: parseOptionalJson(formData.get('card_config')),
    dashboard_config: parseOptionalJson(formData.get('dashboard_config')),
  }
```

Inside the `supabase.from('modules').insert(...)` call, add `dashboard_config`:
```typescript
      dashboard_config: parsed.data.dashboard_config ?? null,
```

- [ ] **Step 3: Update `updateModule` identically**

Same two edits in `updateModule`: add `dashboard_config` to `raw`, add it to the `.update({...})` call.

Find in `updateModule`:
```typescript
  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
    crystal_type: formData.get('crystal_type') as string,
    card_config: parseCardConfig(formData.get('card_config')),
  }
```

Replace with:
```typescript
  const raw = {
    name: formData.get('name') as string,
    fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
    crystal_type: formData.get('crystal_type') as string,
    card_config: parseOptionalJson(formData.get('card_config')),
    dashboard_config: parseOptionalJson(formData.get('dashboard_config')),
  }
```

Add to the `.update({...})` call in `updateModule`:
```typescript
      dashboard_config: parsed.data.dashboard_config ?? null,
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/actions/modules.ts
git commit -m "feat: persist dashboard_config in createModule and updateModule server actions"
```

---

### Task 4: Dashboard Page

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `buildGridData` from `lib/consistency-grid.ts`; `withFormulaEntries` from `lib/formula.ts`; `todayInTimezone` from `lib/date.ts`; `<ConsistencyGrid>` from `components/consistency-grid.tsx` (created in Task 5).
- Produces: A page at `/dashboard` that loads all modules + all entries in 2 batched queries and renders the grid.

- [ ] **Step 1: Replace `app/dashboard/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { ConsistencyGrid } from '@/components/consistency-grid'
import { buildGridData } from '@/lib/consistency-grid'
import { withFormulaEntries } from '@/lib/formula'
import { todayInTimezone } from '@/lib/date'
import type { Module, Entry } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: modules }, { data: profile }] = await Promise.all([
    supabase.from('modules').select('*').eq('user_id', user.id).order('name'),
    supabase.from('profiles').select('day_boundary_tz').eq('id', user.id).single(),
  ])

  const typedModules = (modules ?? []) as Module[]
  const savedTimezone = (profile?.day_boundary_tz as string | null) || null
  const today = todayInTimezone(savedTimezone ?? 'UTC')

  const moduleIds = typedModules.map((m) => m.id)

  const { data: entries } =
    moduleIds.length > 0
      ? await supabase
          .from('entries')
          .select('module_id, entry_date, values, created_at')
          .eq('user_id', user.id)
          .in('module_id', moduleIds)
      : { data: [] }

  // Include computed entries for formula modules so they appear in the grid.
  const rawEntries = (entries ?? []) as Entry[]
  const allEntries = withFormulaEntries(typedModules, rawEntries)

  const gridData = buildGridData(typedModules, allEntries, today)

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-6xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
        <p className="text-muted-foreground mb-8">
          Consistency across all trackers over time.
        </p>

        {typedModules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            No trackers yet. Create one to see your consistency grid.
          </div>
        ) : (
          <ConsistencyGrid gridData={gridData} today={today} />
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: error that `ConsistencyGrid` doesn't exist yet — acceptable; will be fixed in Task 5. If there are other errors, fix them.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: replace all-charts dashboard page with consistency grid data load"
```

---

### Task 5: ConsistencyGrid Component

**Files:**
- Create: `components/consistency-grid.tsx`

**Interfaces:**
- Consumes: `GridData`, `GridCell`, `ColumnStats`, `CellState`, `computeColumnStats` from `lib/consistency-grid.ts`; `getCrystal` from `lib/crystals.ts`; `Module` from `lib/types.ts`; shadcn `Button` from `@/components/ui/button`.
- Produces: `<ConsistencyGrid gridData={GridData} today={string} />` — client component.

- [ ] **Step 1: Create `components/consistency-grid.tsx`**

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { computeColumnStats } from '@/lib/consistency-grid'
import { getCrystal } from '@/lib/crystals'
import { cn } from '@/lib/utils'
import type { GridData, GridCell, ColumnStats } from '@/lib/consistency-grid'
import type { CrystalKey } from '@/lib/crystals'

interface ConsistencyGridProps {
  gridData: GridData
  today: string
}

type WindowMode = '90' | 'all'

/** Format a YYYY-MM-DD date as "Jun 28" (UTC, no timezone shift). */
function formatDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

interface CrystalCellProps {
  cell: GridCell
  crystalType: CrystalKey
}

function CrystalCell({ cell, crystalType }: CrystalCellProps) {
  const crystal = getCrystal(crystalType)

  if (cell.state === 'inactive') {
    return <div className="w-8 h-8 rounded-sm" aria-label="inactive" />
  }

  if (cell.state === 'not-done') {
    return (
      <div
        className="w-8 h-8 rounded-sm flex items-center justify-center bg-[var(--grid-notdone)]"
        aria-label="not done"
      />
    )
  }

  // done — crystal glyph, size scales with intensity
  const size = Math.round(6 + cell.intensity * 8) // 6–14 px
  const glow = cell.intensity > 0.4 ? `0 0 ${Math.round(cell.intensity * 8)}px ${crystal.glow}` : undefined

  return (
    <div
      className={cn(
        'w-8 h-8 rounded-sm flex items-center justify-center',
        'bg-[var(--grid-done)]',
        // Light mode: add a subtle ring so done cells pop against the card background
        'ring-1 ring-border/60 dark:ring-0',
      )}
      aria-label={cell.rawValue !== undefined ? `done (${Math.round(cell.rawValue)})` : 'done'}
    >
      <div
        className="rotate-45 rounded-[2px] transition-all duration-200"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: crystal.primary,
          boxShadow: glow,
        }}
      />
    </div>
  )
}

export function ConsistencyGrid({ gridData, today }: ConsistencyGridProps) {
  const [windowMode, setWindowMode] = useState<WindowMode>('90')

  const { modules, dates, cells } = gridData

  // Slice dates based on the window toggle.
  const visibleCount = windowMode === '90' ? Math.min(90, dates.length) : dates.length
  const visibleDates = useMemo(() => dates.slice(0, visibleCount), [dates, visibleCount])

  // Per-column stats recomputed when window changes.
  const columnStats: ColumnStats[] = useMemo(
    () =>
      modules.map((_, mi) =>
        computeColumnStats(cells[mi].slice(0, visibleCount), visibleDates, today),
      ),
    [modules, cells, visibleDates, visibleCount, today],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Window toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {visibleDates.length} {visibleDates.length === 1 ? 'day' : 'days'}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={windowMode === '90' ? 'default' : 'outline'}
            onClick={() => setWindowMode('90')}
          >
            Last 90 days
          </Button>
          <Button
            size="sm"
            variant={windowMode === 'all' ? 'default' : 'outline'}
            onClick={() => setWindowMode('all')}
          >
            All time
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto max-h-[calc(100vh-14rem)] rounded-lg border border-border">
        <table className="border-collapse w-auto">
          {/* Sticky header row */}
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              {/* Date column header */}
              <th className="text-left py-3 pr-3 pl-3 min-w-[80px]" aria-label="Date" />

              {modules.map((mod, mi) => {
                const stats = columnStats[mi]
                const crystal = getCrystal(mod.crystal_type)
                return (
                  <th
                    key={mod.id}
                    className="px-1 pt-2 pb-3 text-center min-w-[3rem]"
                  >
                    <Link
                      href={`/modules/${mod.id}`}
                      className="flex flex-col items-center gap-1 group cursor-pointer"
                      title={mod.name}
                    >
                      {/* Tiny crystal glyph to identify the tracker */}
                      <div
                        className="w-4 h-4 rotate-45 rounded-[2px] shrink-0"
                        style={{ backgroundColor: crystal.primary }}
                      />
                      {/* Tracker name — truncated, underlines on hover */}
                      <span
                        className="text-[11px] font-medium leading-tight group-hover:underline text-foreground"
                        style={{
                          maxWidth: '56px',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {mod.name}
                      </span>
                      {/* Stats */}
                      <div className="text-[10px] text-muted-foreground leading-snug text-center">
                        {stats.currentStreak > 0 && (
                          <div>{stats.currentStreak}d streak</div>
                        )}
                        <div>{stats.completionPct}%</div>
                        {stats.longestStreak > 0 && (
                          <div className="text-muted-foreground/60">{stats.longestStreak} best</div>
                        )}
                      </div>
                    </Link>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Day rows */}
          <tbody>
            {visibleDates.map((date, di) => {
              const rowCells = modules.map((_, mi) => cells[mi][di])
              const doneCount = rowCells.filter((c) => c.state === 'done').length
              const activeCount = rowCells.filter((c) => c.state !== 'inactive').length

              return (
                <tr
                  key={date}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  {/* Date label */}
                  <td className="py-0.5 pl-3 pr-3 text-left align-middle">
                    <div className="text-xs text-muted-foreground whitespace-nowrap leading-tight">
                      {formatDate(date)}
                    </div>
                    {activeCount > 0 && (
                      <div className="text-[10px] text-muted-foreground/50 leading-none mt-0.5">
                        {doneCount}/{activeCount}
                      </div>
                    )}
                  </td>

                  {/* Cells */}
                  {modules.map((mod, mi) => (
                    <td key={mod.id} className="p-0.5 align-middle">
                      <CrystalCell cell={cells[mi][di]} crystalType={mod.crystal_type} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Verify the page loads**

Start the dev server:
```bash
npm run dev
```

Navigate to `/dashboard`. Verify:
- The grid renders with sticky headers
- Tracker names appear in headers with link cursor on hover
- Clicking a tracker header navigates to `/modules/[id]`
- Crystal glyphs appear in done cells
- Not-done cells show as flat gray
- The 90-day / all-time toggle works
- Date labels and X/N counts are visible
- In dark mode: done cells are clearly lighter than not-done cells
- In light mode: done cells (white with ring) visually distinguish from not-done (gray)

- [ ] **Step 4: Commit**

```bash
git add components/consistency-grid.tsx
git commit -m "feat: add ConsistencyGrid client component with sticky headers, crystal cells, and window toggle"
```

---

### Task 6: Module Builder Dashboard Config UI

**Files:**
- Modify: `components/module-builder.tsx`

**Interfaces:**
- Consumes: `DashboardMode`, `GoalCondition` from `lib/types.ts`; existing form submit logic in `ModuleBuilder`.
- Produces: "Dashboard mode" section in the module edit form; `dashboard_config` field submitted with the form.

- [ ] **Step 1: Add state for dashboard config to `ModuleBuilder`**

In `components/module-builder.tsx`, after the `cardItems` state, add:

```typescript
  // Dashboard config state
  type GoalOp = 'gte' | 'lte' | 'eq' | 'between'
  const [dashMode, setDashMode] = useState<'auto' | 'binary' | 'goal' | 'gradient'>(
    initial?.dashboard_config?.mode ?? 'auto'
  )
  const [goalConditions, setGoalConditions] = useState<GoalCondition[]>(
    initial?.dashboard_config?.goal?.conditions ?? []
  )
  const [gradientField, setGradientField] = useState(
    initial?.dashboard_config?.gradientField ?? ''
  )
  const [gradientMin, setGradientMin] = useState(
    initial?.dashboard_config?.gradientRange?.min?.toString() ?? ''
  )
  const [gradientMax, setGradientMax] = useState(
    initial?.dashboard_config?.gradientRange?.max?.toString() ?? ''
  )
```

- [ ] **Step 2: Update the form submit logic to include `dashboard_config`**

Find the block in `ModuleBuilder` where `formData.set(...)` calls are made (around the submit handler). After the `card_config` line, add:

```typescript
    // Build dashboard_config
    let dashConfig: unknown = null
    if (dashMode === 'binary') {
      dashConfig = { mode: 'binary' }
    } else if (dashMode === 'goal' && goalConditions.length > 0) {
      dashConfig = { mode: 'goal', goal: { conditions: goalConditions, combine: 'all' } }
    } else if (dashMode === 'gradient' && gradientField) {
      const range =
        gradientMin !== '' && gradientMax !== ''
          ? { min: Number(gradientMin), max: Number(gradientMax) }
          : undefined
      dashConfig = { mode: 'gradient', gradientField, gradientRange: range }
    }
    formData.set('dashboard_config', dashConfig ? JSON.stringify(dashConfig) : '')
```

- [ ] **Step 3: Add the Dashboard mode UI section**

In the JSX of `ModuleBuilder`, add after the "Card summary" `<Separator>` + section:

```tsx
<Separator />
<div>
  <h2 className="text-base font-semibold mb-1">Dashboard mode</h2>
  <p className="text-sm text-muted-foreground mb-3">
    How this tracker appears in the consistency grid.
  </p>

  <div className="mb-3">
    <Label className="text-xs mb-1 block">Mode</Label>
    <Select value={dashMode} onValueChange={(v) => setDashMode(v as typeof dashMode)}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto (sensible default)</SelectItem>
        <SelectItem value="binary">Binary (logged / not logged)</SelectItem>
        <SelectItem value="goal">Goal (conditions must be met)</SelectItem>
        <SelectItem value="gradient">Gradient (intensity by value)</SelectItem>
      </SelectContent>
    </Select>
  </div>

  {/* Goal mode: condition builder */}
  {dashMode === 'goal' && (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">All conditions must be met for the cell to show as done.</p>
      {goalConditions.map((cond, i) => (
        <div key={i} className="flex gap-2 items-center flex-wrap">
          {/* Field */}
          <Select
            value={cond.field}
            onValueChange={(v) => {
              const next = [...goalConditions]; next[i] = { ...next[i], field: v }; setGoalConditions(next)
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Field" />
            </SelectTrigger>
            <SelectContent>
              {fields.filter((f) => f.type === 'number' || f.type === 'rating').map((f) => (
                <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Op */}
          <Select
            value={cond.op}
            onValueChange={(v) => {
              const next = [...goalConditions]; next[i] = { ...next[i], op: v as GoalOp }; setGoalConditions(next)
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gte">≥ (at least)</SelectItem>
              <SelectItem value="lte">≤ (at most)</SelectItem>
              <SelectItem value="eq">= (exactly)</SelectItem>
              <SelectItem value="between">between</SelectItem>
            </SelectContent>
          </Select>
          {/* Value(s) */}
          {cond.op === 'between' ? (
            <>
              <Input
                type="number"
                placeholder="min"
                className="w-20"
                value={cond.min ?? ''}
                onChange={(e) => {
                  const next = [...goalConditions]; next[i] = { ...next[i], min: Number(e.target.value) }; setGoalConditions(next)
                }}
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="max"
                className="w-20"
                value={cond.max ?? ''}
                onChange={(e) => {
                  const next = [...goalConditions]; next[i] = { ...next[i], max: Number(e.target.value) }; setGoalConditions(next)
                }}
              />
            </>
          ) : (
            <Input
              type="number"
              placeholder="value"
              className="w-24"
              value={cond.value ?? ''}
              onChange={(e) => {
                const next = [...goalConditions]; next[i] = { ...next[i], value: Number(e.target.value) }; setGoalConditions(next)
              }}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setGoalConditions(goalConditions.filter((_, j) => j !== i))}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setGoalConditions([...goalConditions, { field: fields.find((f) => f.type === 'number')?.key ?? '', op: 'gte', value: 0 }])}
        disabled={fields.filter((f) => f.type === 'number' || f.type === 'rating').length === 0}
      >
        <PlusIcon className="size-4 mr-1" /> Add condition
      </Button>
      {fields.filter((f) => f.type === 'number' || f.type === 'rating').length === 0 && (
        <p className="text-xs text-muted-foreground">Add a number or rating field to use goal mode.</p>
      )}
    </div>
  )}

  {/* Gradient mode: field + optional range */}
  {dashMode === 'gradient' && (
    <div className="space-y-3">
      <div>
        <Label className="text-xs mb-1 block">Value field</Label>
        <Select value={gradientField} onValueChange={setGradientField}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Pick a field" />
          </SelectTrigger>
          <SelectContent>
            {fields.filter((f) => f.type === 'number' || f.type === 'rating').map((f) => (
              <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs mb-1 block">Fixed range (optional — leave blank for auto)</Label>
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            placeholder="Min"
            className="w-24"
            value={gradientMin}
            onChange={(e) => setGradientMin(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="Max"
            className="w-24"
            value={gradientMax}
            onChange={(e) => setGradientMax(e.target.value)}
          />
        </div>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Add `GoalCondition` to the imports**

At the top of `module-builder.tsx`, update the import from `@/lib/types`:

```typescript
import type { Module, ModuleField, CardSummaryMode, CardTimeWindow, CardSummaryItem, GoalCondition } from '@/lib/types'
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Fix any import issues.

- [ ] **Step 6: Manual smoke test**

1. Open a tracker's edit page (`/modules/[id]/edit`).
2. Set mode to "Goal", add a condition (e.g. protein ≥ 150). Save.
3. Verify the `/dashboard` grid now shows "done" only on days where protein ≥ 150.
4. Set mode to "Gradient" on a numeric tracker. Save.
5. Verify crystals in that column scale in size across days.

- [ ] **Step 7: Commit**

```bash
git add components/module-builder.tsx
git commit -m "feat: add dashboard mode config UI to module builder (binary/goal/gradient)"
```

---

### Task 7: PRD Update

**Files:**
- Modify: `docs/prd.md`

- [ ] **Step 1: Replace §5.2a**

Find the section `### 5.2a Dashboard \`/dashboard\`` and replace its content with:

```markdown
### 5.2a Dashboard `/dashboard` — **Consistency Grid**
- **Purpose:** At-a-glance habit tracking: how consistent am I across all trackers over time?
- **Layout:** Trackers = columns, days = rows (newest day at top). Sticky column headers stay visible while scrolling down. Default window: last 90 days; a control expands to all-time.
- **Header per column:** Tracker name (links to `/modules/[id]` with clear hover affordance), current streak, completion % over the visible window, longest streak. Uses the same consecutive-date streak logic as `lib/analytics.ts computeStreak`.
- **Row per day:** Date label + "X of N done" count for at-a-glance daily reads.
- **Cell modes (per tracker, configured in `modules.dashboard_config`):**
  - `binary` — cell = did an entry exist? For single-boolean trackers, checks the boolean value; for others, checks entry existence. Default for unconfigured standard modules.
  - `goal` — cell = all conditions met? Config: `{ conditions: [{ field, op, value }], combine: 'all' }` where `op ∈ gte | lte | eq | between` (`between` uses `min`/`max`). Multiple conditions are ANDed.
  - `gradient` — crystal scales in size/glow with the day's value (auto-fit to window min/max, or fixed range). Default for formula modules. Config: `{ gradientField, gradientRange? }`.
- **Cell states (three, visually distinct):**
  - Done — `bg-[var(--grid-done)]`: light neutral (dark: ~L0.81 from `color-mix(foreground 85%, background 15%)`; light: `--card` white) + crystal glyph in tracker color + `ring-1 ring-border/60` in light mode.
  - Not done — `bg-[var(--grid-notdone)]` = `--muted` in both modes. No crystal.
  - Inactive (before module existed) — transparent. No crystal.
- **Crystal glyph:** A small rotated `<div>` (CSS diamond, 6–14 px) in the tracker's `crystal_type` primary color. In gradient mode the size scales with intensity; a glow appears above 40% intensity.
- **Performance:** 90 days × ~9 trackers ≈ 810 cells; all-time can be thousands. Data loads in 2 batched queries (modules + entries). Cell computation is a pure in-memory pass (O(entries + modules × dates)). No per-cell async work.
- **Per-chart deep-dives** remain on each tracker's `/modules/[id]` page — not duplicated here.
- **Note:** The previous all-charts grid dashboard was removed when the consistency grid was added (build step 13 below).
```

- [ ] **Step 2: Add `dashboard_config` to §7 (Data Model)**

In the `modules` table spec, after `card_config`, add:

```markdown
- `dashboard_config` jsonb nullable — declarative consistency grid config: `{ mode: 'binary'|'goal'|'gradient', goal?: GoalConfig, gradientField?: string, gradientRange?: { min, max } }`. Null = auto-default (binary for standard, gradient for formula). An AI tool can populate this declaratively. Added in migration `20240108000000_module_dashboard_config.sql`.
```

- [ ] **Step 3: Add `dashboardConfig` shape to §9 (Taxonomies)**

After the `card_config` block in §9, add:

```markdown
**Dashboard grid config** (`modules.dashboard_config` jsonb) — declarative; all cell evaluation runs in `lib/consistency-grid.ts`:

| `DashboardConfig` field | Type | Notes |
|---|---|---|
| `mode` | `'binary'\|'goal'\|'gradient'` | required |
| `goal` | `GoalConfig?` | required when mode = 'goal' |
| `gradientField` | `string?` | field key; required when mode = 'gradient' |
| `gradientRange` | `{ min, max }?` | optional fixed normalization range for gradient |

**`GoalConfig`:** `{ conditions: GoalCondition[], combine: 'all' }`. Each `GoalCondition`: `{ field, op, value? (gte/lte/eq), min?/max? (between) }`. `op ∈ gte | lte | eq | between`. `combine: 'all'` = AND logic (reserved: future `'any'` for OR). Multi-entry days sum field values before checking conditions (e.g. total daily calories).
```

- [ ] **Step 4: Update §12 (Build Order) to add step 13**

After step 12 (or wherever the last step is), add:

```markdown
13. **Consistency Grid Dashboard** — **Done.** Replaced `/dashboard` all-charts grid with a habit-tracking consistency matrix (trackers × days). `dashboard_config` column on `modules` stores mode/goal/gradient config (Zod-validated, editable in module builder). `lib/consistency-grid.ts` handles all cell evaluation. Per-chart deep-dives remain on tracker pages.
```

And update the step 3 note for Charts to flag that the all-charts dashboard was removed:

Find `### 5.2a Dashboard` in §10 (Out of Scope) if it's mentioned and update accordingly. Also update §10 to note the all-charts dashboard is removed (not out of scope, just replaced):

Append to "Curated/saved custom dashboards":
```markdown
  The all-charts grid that previously lived at `/dashboard` was **removed** in step 13 and replaced by the consistency grid. Per-tracker chart deep-dives remain on `/modules/[id]`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/prd.md
git commit -m "docs: update PRD to reflect consistency grid replacing all-charts dashboard"
```

---

## Self-Review

### Spec coverage check:

| Requirement | Task |
|---|---|
| Columns = trackers, rows = days, newest at top | Task 5 (ConsistencyGrid table structure) |
| Sticky column headers | Task 5 (`thead className="sticky top-0"`) |
| Clicking header navigates to tracker page | Task 5 (`<Link href="/modules/[id]">`) |
| Default 90 days, expand to all-time | Task 5 (windowMode state + Button toggle) |
| `binary` mode | Task 2 (`computeCellState` binary branch) |
| `goal` mode with multi-condition AND | Task 2 (`evaluateGoal`), Task 2 (tests) |
| `gradient` mode with auto-fit range | Task 2 (`buildGridData` gradient range), Task 2 (tests) |
| `dashboardConfig` declarative object on module | Task 1 (types), Task 3 (server action), Task 6 (UI) |
| Zod validation of config | Task 1 (`dashboardConfigSchema`) |
| Done / Not-done / Inactive cell states | Task 2 (`computeCellState`), Task 5 (`CrystalCell`) |
| Brightness = whether, hue = which | Task 5 (cell bg from CSS vars; crystal color from `crystal.primary`) |
| Dark mode: done pops light | Task 1 (`--grid-done` = color-mix(foreground 85%, background 15%)) |
| Light mode: done pops on gray not-done | Task 1 (`--grid-done` = card white + ring), Task 5 (`ring-1 ring-border/60`) |
| Crystal glyph lightweight (not SVG) | Task 5 (`<div className="rotate-45 rounded-[2px]">`) |
| Gradient crystal scales size/glow | Task 5 (`size = 6 + intensity * 8`, `boxShadow = glow`) |
| Per-column streak + completion % | Task 2 (`computeColumnStats`), Task 5 (header stats) |
| Per-day X/N count | Task 5 (date cell with doneCount/activeCount) |
| Batched queries, no N+1 | Task 4 (2 queries: modules + entries) |
| Formula modules included | Task 4 (`withFormulaEntries`) |
| `inactive` = before module created | Task 2 (`date < createdDate` check) |
| Goal conditions editable in UI | Task 6 (condition builder in ModuleBuilder) |
| PRD updated | Task 7 |
| All-charts dashboard removed | Task 4 (page replaced), Task 7 (PRD updated) |

### Placeholder scan: None found.

### Type consistency check:
- `GridCell.state: CellState` used consistently in Task 2, 5.
- `GridData.cells[moduleIndex][dateIndex]` — `moduleIndex` used consistently in Task 4 and 5.
- `computeColumnStats(cells, dates, today)` signature matches usage in Task 5.
- `GoalCondition` imported in Task 6 from `lib/types.ts` where it's defined in Task 1.
- `dashboardConfigSchema` in `moduleSchema` (Task 1) matches `dashboard_config` in `updateModule` raw object (Task 3).
- `Module.dashboard_config` typed as `DashboardConfig | null` (Task 1); `buildGridData` reads `mod.dashboard_config` as `DashboardConfig | null` (Task 2).
