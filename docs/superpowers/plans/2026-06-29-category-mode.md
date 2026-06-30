# Category Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `category` dashboard mode that colors each consistency-grid cell by the value of a `select` field, using a per-option crystal assignment.

**Architecture:** Four additive layers — types → logic → renderer → UI — each built on top of the previous. No existing mode is changed; `category` is a new branch in every switch/discriminated union. Missed days (no entry) stay `not-done`; every logged category counts as `done`.

**Tech Stack:** TypeScript / Next.js App Router, Zod, Vitest, Tailwind, shadcn/ui

## Global Constraints

- TypeScript strict mode — no `any`, no `!` non-null assertions unless matching existing patterns
- Run `npx tsc --noEmit` and `npx vitest run` to verify each task before committing
- Match existing code style exactly — no reformatting unrelated lines
- Never read `.env.local` or any `.env.*` file
- Commit after every task

---

### Task 1: Extend types and Zod validation schema

**Files:**
- Modify: `lib/types.ts` (DashboardMode union, DashboardConfig interface)
- Modify: `lib/validations.ts` (dashboardConfigSchema discriminated union)

**Interfaces:**
- Produces: `DashboardMode` now includes `'category'`; `DashboardConfig` has `categoryField?: string` and `categoryColors?: Record<string, CrystalKey>`; `dashboardConfigSchema` validates the new branch

- [ ] **Step 1: Write a failing type-level smoke test**

Add this test to `lib/__tests__/consistency-grid.test.ts` (after the last `describe` block):

```ts
// ── category mode types (compile-time smoke) ─────────────────────

describe('category mode config shape', () => {
  it('DashboardConfig accepts category mode shape', () => {
    const cfg: import('../types').DashboardConfig = {
      mode: 'category',
      categoryField: 'session_type',
      categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
    }
    expect(cfg.mode).toBe('category')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails (type error or runtime)**

```bash
npx vitest run lib/__tests__/consistency-grid.test.ts 2>&1 | tail -20
```

Expected: compile/type error about `'category'` not being assignable to `DashboardMode`.

- [ ] **Step 3: Extend `lib/types.ts`**

Change line ~176:
```ts
export type DashboardMode = 'binary' | 'goal' | 'gradient' | 'category'
```

Add to `DashboardConfig` interface (after the `gradientRange` line):
```ts
  /** Required when mode = 'category' */
  categoryField?: string
  /**
   * Maps each select-option value to a crystal. Options not listed here
   * fall back to the module's own crystal at render time.
   */
  categoryColors?: Record<string, CrystalKey>
```

The full `DashboardConfig` interface becomes:
```ts
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
  /** Required when mode = 'category' */
  categoryField?: string
  /**
   * Maps each select-option value to a crystal. Options not listed here
   * fall back to the module's own crystal at render time.
   */
  categoryColors?: Record<string, CrystalKey>
}
```

`CrystalKey` is already imported at the top of `lib/types.ts` via the `CrystalType` import — check that `CrystalKey` is also exported from `lib/crystals.ts` (it is). Add the import if missing:
```ts
import type { CrystalKey } from './crystals'
```

- [ ] **Step 4: Extend `lib/validations.ts`**

In the `dashboardConfigSchema` discriminated union (currently ends after the `gradient` branch), add a fourth branch:

```ts
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
  z.object({
    mode: z.literal('category'),
    categoryField: z.string().min(1, 'Pick a select field'),
    categoryColors: z.record(z.string(), crystalTypeSchema).optional(),
  }),
])
```

- [ ] **Step 5: Run typecheck and tests**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run lib/__tests__/consistency-grid.test.ts 2>&1 | tail -20
```

Expected: no errors, all tests pass (including the new smoke test).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/validations.ts lib/__tests__/consistency-grid.test.ts
git commit -m "feat: add category mode to DashboardMode and validation schema"
```

---

### Task 2: Cell computation for category mode

**Files:**
- Modify: `lib/consistency-grid.ts`
- Modify: `lib/__tests__/consistency-grid.test.ts`

**Interfaces:**
- Consumes: `DashboardMode` includes `'category'`; `DashboardConfig.categoryField` and `DashboardConfig.categoryColors` from Task 1
- Produces: `GridCell` has two new optional fields: `crystalOverride?: CrystalKey` and `categoryLabel?: string`. `computeCellState` handles `case 'category'`.

- [ ] **Step 1: Write failing tests**

Add these tests to the `computeCellState` describe block in `lib/__tests__/consistency-grid.test.ts`:

```ts
  it('category mode, no entry → not-done', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    const cell = computeCellState(mod, [], '2026-06-28', null)
    expect(cell.state).toBe('not-done')
    expect(cell.intensity).toBe(0)
  })

  it('category mode, entry with mapped category → done with crystalOverride and label', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    const cell = computeCellState(mod, [{ session_type: 'Rest' }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.intensity).toBe(1)
    expect(cell.crystalOverride).toBe('obsidian')
    expect(cell.categoryLabel).toBe('Rest')
  })

  it('category mode, entry with unmapped category → done, no crystalOverride', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst' },
      },
    })
    // 'Rest' has no mapping → crystalOverride undefined
    const cell = computeCellState(mod, [{ session_type: 'Rest' }], '2026-06-28', null)
    expect(cell.state).toBe('done')
    expect(cell.crystalOverride).toBeUndefined()
    expect(cell.categoryLabel).toBe('Rest')
  })

  it('category mode, multiple entries → last entry wins for category', () => {
    const mod = makeMod({
      fields: [{ key: 'session_type', label: 'Session type', type: 'select', required: false, options: ['Lift', 'Rest'] }],
      dashboard_config: {
        mode: 'category',
        categoryField: 'session_type',
        categoryColors: { Lift: 'amethyst', Rest: 'obsidian' },
      },
    })
    // dayEntries order: first entry is Lift, second (last) is Rest
    const cell = computeCellState(
      mod,
      [{ session_type: 'Lift' }, { session_type: 'Rest' }],
      '2026-06-28',
      null,
    )
    expect(cell.crystalOverride).toBe('obsidian')
    expect(cell.categoryLabel).toBe('Rest')
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run lib/__tests__/consistency-grid.test.ts 2>&1 | tail -30
```

Expected: FAIL — `crystalOverride` property does not exist on `GridCell`.

- [ ] **Step 3: Extend `GridCell` in `lib/consistency-grid.ts`**

Replace the existing `GridCell` interface (lines ~10–16):

```ts
export interface GridCell {
  state: CellState
  /** 0–1: always 1 for binary done, 0 for not-done; varies for gradient. */
  intensity: number
  /** The day's summed field value (gradient mode only, for hover display). */
  rawValue?: number
  /** Category mode: crystal to use instead of the module's own crystal. */
  crystalOverride?: CrystalKey
  /** Category mode: the raw option value logged that day, for hover/aria. */
  categoryLabel?: string
}
```

Add the import for `CrystalKey` at the top of `lib/consistency-grid.ts`:
```ts
import type { CrystalKey } from './crystals'
```

- [ ] **Step 4: Add `case 'category'` to `computeCellState`**

In the `switch (mode)` block (after `case 'gradient'`), add:

```ts
    case 'category': {
      if (dayEntries.length === 0) return { state: 'not-done', intensity: 0 }
      const fieldKey = config?.categoryField ?? ''
      const lastEntry = dayEntries[dayEntries.length - 1]
      const label = fieldKey ? String(lastEntry[fieldKey] ?? '') : ''
      const crystalOverride = label && config?.categoryColors
        ? (config.categoryColors[label] as CrystalKey | undefined)
        : undefined
      return { state: 'done', intensity: 1, categoryLabel: label || undefined, crystalOverride }
    }
```

- [ ] **Step 5: Run tests and typecheck**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run lib/__tests__/consistency-grid.test.ts 2>&1 | tail -20
```

Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/consistency-grid.ts lib/__tests__/consistency-grid.test.ts
git commit -m "feat: implement category mode cell computation"
```

---

### Task 3: Update the grid renderer to use crystalOverride

**Files:**
- Modify: `components/consistency-grid.tsx`

**Interfaces:**
- Consumes: `GridCell.crystalOverride?: CrystalKey` and `GridCell.categoryLabel?: string` from Task 2
- Produces: `CrystalCell` renders the overridden crystal color when set; `aria-label` includes the category label

- [ ] **Step 1: Update `CrystalCell` to accept and use `crystalOverride`**

The current `CrystalCell` (lines ~41–88) uses `crystalType` (the module's crystal) for both color and glow. Change it to prefer `cell.crystalOverride` when present.

Replace the entire `CrystalCell` component with:

```tsx
function CrystalCell({ cell, crystalType }: CrystalCellProps) {
  const crystal = getCrystal(cell.crystalOverride ?? crystalType)

  if (cell.state === 'inactive') {
    return <div className="w-8 h-8 rounded-sm mx-auto" aria-label="inactive" />
  }

  if (cell.state === 'not-done') {
    return (
      <div
        className="w-8 h-8 rounded-sm flex items-center justify-center bg-[var(--grid-notdone)] mx-auto"
        aria-label="not done"
      />
    )
  }

  // done — crystal glyph, size scales with intensity
  const size = Math.round(6 + cell.intensity * 8) // 6–14 px
  const glow = cell.intensity > 0.4 ? `0 0 ${Math.round(cell.intensity * 8)}px ${crystal.glow}` : undefined

  const ariaLabel = cell.categoryLabel
    ? `done (${cell.categoryLabel})`
    : cell.rawValue !== undefined
    ? `done (${Math.round(cell.rawValue)})`
    : 'done'

  return (
    <div
      className={cn(
        'w-8 h-8 rounded-sm flex items-center justify-center',
        'bg-[var(--grid-done)]',
        // Light mode: add a subtle ring so done cells pop against the card background
        'ring-1 ring-border/60 dark:ring-0',
        'mx-auto',
      )}
      aria-label={ariaLabel}
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
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/consistency-grid.tsx
git commit -m "feat: render crystalOverride color in category mode cells"
```

---

### Task 4: Config UI for category mode in module builder

**Files:**
- Modify: `components/module-builder.tsx`

**Interfaces:**
- Consumes: `DashboardConfig.categoryField`, `DashboardConfig.categoryColors` from Task 1; `CrystalPicker` (already imported); `ModuleField.options` from existing types
- Produces: Module builder lets the user select category mode, pick a select field, and assign a crystal to each option

- [ ] **Step 1: Add category state variables**

After the existing `gradientMax` state (around line 85), add:

```ts
  const [categoryField, setCategoryField] = useState(
    initial?.dashboard_config?.mode === 'category'
      ? (initial.dashboard_config.categoryField ?? '')
      : ''
  )
  const [categoryColors, setCategoryColors] = useState<Record<string, CrystalKey>>(
    initial?.dashboard_config?.mode === 'category'
      ? (initial.dashboard_config.categoryColors ?? {})
      : {}
  )
```

- [ ] **Step 2: Update the `dashMode` state type to include `'category'`**

Change the `dashMode` useState declaration:

```ts
  const [dashMode, setDashMode] = useState<'auto' | 'binary' | 'goal' | 'gradient' | 'category'>(
    initial?.dashboard_config?.mode ?? 'auto'
  )
```

- [ ] **Step 3: Wire category into form serialization**

In the form submit handler, after the `gradient` branch (around line 145), add:

```ts
    } else if (dashMode === 'category' && categoryField) {
      dashConfig = { mode: 'category', categoryField, categoryColors }
    }
```

Also add a validation warning after the existing gradient warning:

```ts
    if (dashMode === 'category' && !categoryField) {
      setError('Category mode requires a select field. Pick one or choose a different mode.')
      return
    }
```

- [ ] **Step 4: Add 'Category' option to the mode `<Select>`**

After the `<SelectItem value="gradient">` line:

```tsx
              <SelectItem value="category">Category (color by select field)</SelectItem>
```

- [ ] **Step 5: Add the category config UI panel**

After the closing `}` of the gradient mode block (`{dashMode === 'gradient' && ( ... )}`), add:

```tsx
        {/* Category mode: select field picker + per-option crystal assignment */}
        {dashMode === 'category' && (() => {
          const selectFields = fields.filter((f) => f.type === 'select' && f.key)
          const activeField = selectFields.find((f) => f.key === categoryField)
          const options = activeField?.options ?? []
          return (
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Category field</Label>
                <Select value={categoryField} onValueChange={(v) => {
                  setCategoryField(v ?? '')
                  setCategoryColors({})
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Pick a select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectFields.map((f) => (
                      <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectFields.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Add a select field above to use category mode.</p>
                )}
              </div>
              {options.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs block">Crystal per option</Label>
                  {options.map((opt) => (
                    <div key={opt} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{opt}</p>
                      <CrystalPicker
                        value={categoryColors[opt] ?? crystalType}
                        onChange={(key) => setCategoryColors((prev) => ({ ...prev, [opt]: key }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
```

- [ ] **Step 6: Run typecheck and full test suite**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -20
```

Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/module-builder.tsx
git commit -m "feat: add category mode config UI to module builder"
```

---

## Self-Review

**Spec coverage:**
- ✅ New `category` DashboardMode — Task 1
- ✅ `categoryField` + `categoryColors` on `DashboardConfig` — Task 1
- ✅ Zod validation branch — Task 1
- ✅ `crystalOverride` + `categoryLabel` on `GridCell` — Task 2
- ✅ `case 'category'` in `computeCellState`, no entry → not-done — Task 2
- ✅ Most-recent-entry wins for multiple entries in one day — Task 2
- ✅ Unmapped option → no crystalOverride (falls back to module crystal at render) — Task 2
- ✅ Renderer picks up `crystalOverride` — Task 3
- ✅ `aria-label` shows category label — Task 3
- ✅ Mode select, field picker, per-option crystal picker UI — Task 4
- ✅ No select fields → hint message — Task 4
- ✅ Streak/completion unchanged (all category cells are `state: 'done'`) — no task needed, existing `computeColumnStats` already handles this correctly

**Placeholder scan:** None found.

**Type consistency:**
- `CrystalKey` used in `GridCell.crystalOverride` (Task 2), `categoryColors` (Task 1), and `CrystalPicker.onChange` (Task 4) — all consistent.
- `categoryColors: Record<string, CrystalKey>` in types, state, and serialization — consistent.
- `config?.categoryColors[label] as CrystalKey | undefined` — safe cast since `categoryColors` values are validated as `CrystalKey` at save time.
