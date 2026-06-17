# Crystal & Geode Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retheme Druzy around crystals and geodes — each tracker is a geode that cracks open to reveal a user-chosen crystal as the habit is kept up, on a geological palette with light/dark support.

**Architecture:** A pure `openness` function (recent consistency × lifetime momentum, computed server-side on read) drives a shared inline-SVG `<GeodeIcon>` whose color comes from a per-module `crystal_type`. A single `crystals` source-of-truth module feeds the icon, a reusable picker, and validation. The palette lives entirely in CSS custom properties in `globals.css`, with dark mode via `prefers-color-scheme`.

**Tech Stack:** Next.js 15 (App Router), React, TypeScript (strict), Zod, Supabase (Postgres + RLS), Tailwind v4 + shadcn/ui, Vitest (added in Task 1).

## Global Constraints

- TypeScript strict mode — no `any`, no non-null assertions on possibly-undefined values.
- Supabase: use existing `lib/supabase/server.ts` `createClient()`; never trust client-supplied `user_id`; all module rows scoped by `.eq('user_id', user.id)`.
- Match existing code style; do not restructure unrelated files.
- Crystal keys must stay identical across three places: the TS union in `lib/crystals.ts`, the DB `check` constraint, and the Zod enum. A drift test guards this.
- The 8 crystal keys are exactly: `amethyst`, `rose_quartz`, `citrine`, `aquamarine`, `malachite`, `carnelian`, `labradorite`, `obsidian`.
- Colors authored in oklch in `globals.css`; crystal reference hex values are in the spec.
- Definition of done per task: `npx tsc --noEmit` clean, `npm run lint` clean, and (where tests exist) `npx vitest run` green.
- Commit after every task with a descriptive message.

---

### Task 1: Add Vitest test runner

**Files:**
- Modify: `package.json` (add devDeps + `test` script)
- Create: `vitest.config.ts`
- Create: `lib/__tests__/smoke.test.ts` (temporary, deleted in Step 6)

**Interfaces:**
- Consumes: nothing.
- Produces: `npx vitest run` command; `npm test` script. Later tasks add `*.test.ts` files under `lib/__tests__/`.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write a temporary smoke test**

Create `lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it and verify it passes**

Run: `npx vitest run`
Expected: 1 passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm lib/__tests__/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

### Task 2: Crystal source of truth (`lib/crystals.ts`)

**Files:**
- Create: `lib/crystals.ts`
- Test: `lib/__tests__/crystals.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CRYSTAL_KEYS: readonly string[]` — the 8 keys (tuple typed via `as const`).
  - `type CrystalKey = (typeof CRYSTAL_KEYS)[number]`.
  - `interface CrystalDef { key: CrystalKey; name: string; primary: string; glow: string }`.
  - `CRYSTALS: Record<CrystalKey, CrystalDef>`.
  - `getCrystal(key: string): CrystalDef` — returns the def, falling back to `amethyst` for unknown keys.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/crystals.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CRYSTAL_KEYS, CRYSTALS, getCrystal } from '../crystals'

describe('crystals', () => {
  it('has exactly the 8 expected keys', () => {
    expect([...CRYSTAL_KEYS].sort()).toEqual(
      ['amethyst', 'aquamarine', 'carnelian', 'citrine', 'labradorite', 'malachite', 'obsidian', 'rose_quartz'].sort()
    )
  })

  it('every crystal has a name, primary and glow color', () => {
    for (const key of CRYSTAL_KEYS) {
      const def = CRYSTALS[key]
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.primary).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.glow).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('getCrystal falls back to amethyst for unknown keys', () => {
    expect(getCrystal('not_a_crystal').key).toBe('amethyst')
    expect(getCrystal('citrine').key).toBe('citrine')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/crystals.test.ts`
Expected: FAIL — cannot find module `../crystals`.

- [ ] **Step 3: Write `lib/crystals.ts`**

```ts
export const CRYSTAL_KEYS = [
  'amethyst',
  'rose_quartz',
  'citrine',
  'aquamarine',
  'malachite',
  'carnelian',
  'labradorite',
  'obsidian',
] as const

export type CrystalKey = (typeof CRYSTAL_KEYS)[number]

export interface CrystalDef {
  key: CrystalKey
  name: string
  primary: string
  glow: string
}

export const CRYSTALS: Record<CrystalKey, CrystalDef> = {
  amethyst:     { key: 'amethyst',     name: 'Amethyst',     primary: '#9B6DCC', glow: '#C9A7F0' },
  rose_quartz:  { key: 'rose_quartz',  name: 'Rose Quartz',  primary: '#D4789C', glow: '#F0B8CF' },
  citrine:      { key: 'citrine',      name: 'Citrine',      primary: '#C49A2A', glow: '#F0CC6A' },
  aquamarine:   { key: 'aquamarine',   name: 'Aquamarine',   primary: '#3AADA8', glow: '#7FE0DC' },
  malachite:    { key: 'malachite',    name: 'Malachite',    primary: '#3A9B6F', glow: '#72D4A8' },
  carnelian:    { key: 'carnelian',    name: 'Carnelian',    primary: '#C45E3A', glow: '#F09070' },
  labradorite:  { key: 'labradorite',  name: 'Labradorite',  primary: '#4A7AB5', glow: '#8AB8E8' },
  obsidian:     { key: 'obsidian',     name: 'Obsidian',     primary: '#6A6580', glow: '#A8A2C0' },
}

const DEFAULT_KEY: CrystalKey = 'amethyst'

export function getCrystal(key: string): CrystalDef {
  return (CRYSTALS as Record<string, CrystalDef>)[key] ?? CRYSTALS[DEFAULT_KEY]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/crystals.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crystals.ts lib/__tests__/crystals.test.ts
git commit -m "feat: add crystal source of truth"
```

---

### Task 3: Openness computation (`lib/openness.ts`)

**Files:**
- Create: `lib/openness.ts`
- Test: `lib/__tests__/openness.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface OpennessInput { recentDays: number; totalEntries: number; daysSinceCreated: number; isFormula: boolean }`
  - `computeOpenness(input: OpennessInput): number` — returns a value in `[0, 1]`.

Semantics (from spec):
```
recent_score   = recentDays / 30                                   // recentDays = distinct entry-days in last 30
lifetime_score = min(totalEntries / max(daysSinceCreated, 1), 1)
openness       = min(recent_score * (1 + lifetime_score * 0.5), 1)
```
Formula modules (`isFormula === true`) always return `1`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/openness.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeOpenness } from '../openness'

describe('computeOpenness', () => {
  it('is 0 with no recent activity regardless of history', () => {
    expect(computeOpenness({ recentDays: 0, totalEntries: 500, daysSinceCreated: 600, isFormula: false })).toBe(0)
  })

  it('applies the momentum multiplier for established trackers', () => {
    // recent 18/30 = 0.6; lifetime min(480/600,1)=0.8; 0.6 * (1 + 0.4) = 0.84
    const v = computeOpenness({ recentDays: 18, totalEntries: 480, daysSinceCreated: 600, isFormula: false })
    expect(v).toBeCloseTo(0.84, 5)
  })

  it('caps at 1', () => {
    expect(computeOpenness({ recentDays: 30, totalEntries: 900, daysSinceCreated: 900, isFormula: false })).toBe(1)
  })

  it('guards against divide-by-zero on brand-new trackers', () => {
    // daysSinceCreated 0 -> treated as 1; lifetime min(1/1,1)=1; recent 1/30 * 1.5
    const v = computeOpenness({ recentDays: 1, totalEntries: 1, daysSinceCreated: 0, isFormula: false })
    expect(v).toBeCloseTo((1 / 30) * 1.5, 5)
  })

  it('returns 1 for formula modules', () => {
    expect(computeOpenness({ recentDays: 0, totalEntries: 0, daysSinceCreated: 0, isFormula: true })).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/openness.test.ts`
Expected: FAIL — cannot find module `../openness`.

- [ ] **Step 3: Write `lib/openness.ts`**

```ts
export interface OpennessInput {
  /** Distinct days with at least one entry in the last 30 days. */
  recentDays: number
  /** Lifetime total entry count. */
  totalEntries: number
  /** Days since the module was created. */
  daysSinceCreated: number
  /** Formula modules are always fully open. */
  isFormula: boolean
}

export function computeOpenness(input: OpennessInput): number {
  if (input.isFormula) return 1

  const recentScore = input.recentDays / 30
  const lifetimeScore = Math.min(input.totalEntries / Math.max(input.daysSinceCreated, 1), 1)
  const openness = recentScore * (1 + lifetimeScore * 0.5)
  return Math.min(Math.max(openness, 0), 1)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/openness.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/openness.ts lib/__tests__/openness.test.ts
git commit -m "feat: add openness computation"
```

---

### Task 4: Data model — `crystal_type` column, type, and validation

**Files:**
- Create: `supabase/migrations/20240106000000_module_crystal_type.sql`
- Modify: `lib/types.ts` (add `CrystalType` + `Module.crystal_type`)
- Modify: `lib/validations.ts` (add `crystal_type` to `moduleSchema` and a new `crystalTypeSchema`)
- Test: `lib/__tests__/crystal-drift.test.ts`

**Interfaces:**
- Consumes: `CRYSTAL_KEYS` from `lib/crystals.ts` (Task 2).
- Produces:
  - `lib/types.ts`: `type CrystalType = CrystalKey` re-exported; `Module.crystal_type: CrystalType`.
  - `lib/validations.ts`: `crystalTypeSchema` (Zod enum over the 8 keys); `moduleSchema` now includes `crystal_type`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20240106000000_module_crystal_type.sql`:

```sql
-- Add a user-chosen crystal type to each module (crystal/geode theme).
alter table public.modules
  add column if not exists crystal_type text not null default 'amethyst';

alter table public.modules
  drop constraint if exists modules_crystal_type_check;

alter table public.modules
  add constraint modules_crystal_type_check check (
    crystal_type in (
      'amethyst', 'rose_quartz', 'citrine', 'aquamarine',
      'malachite', 'carnelian', 'labradorite', 'obsidian'
    )
  );

-- Composite index to keep the openness aggregate cheap.
create index if not exists entries_user_module_date_idx
  on public.entries (user_id, module_id, entry_date);
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `module_crystal_type`) or the dashboard SQL editor. Confirm `modules` now has a `crystal_type` column with the check constraint.

- [ ] **Step 3: Add the type to `lib/types.ts`**

Add near the top imports / type section:

```ts
import type { CrystalKey } from './crystals'

export type CrystalType = CrystalKey
```

Then add the field to the `Module` interface (after `formula_config`):

```ts
  /** User-chosen crystal that themes this tracker's geode card. */
  crystal_type: CrystalType
```

- [ ] **Step 4: Add validation to `lib/validations.ts`**

Add the import and schema near `moduleSchema`:

```ts
import { CRYSTAL_KEYS } from './crystals'

export const crystalTypeSchema = z.enum(CRYSTAL_KEYS)
```

Update `moduleSchema` to include the crystal type:

```ts
export const moduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  fields: z.array(moduleFieldSchema).min(1, 'At least one field is required'),
  crystal_type: crystalTypeSchema,
})
```

- [ ] **Step 5: Write the drift-guard test**

Create `lib/__tests__/crystal-drift.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CRYSTAL_KEYS } from '../crystals'
import { crystalTypeSchema } from '../validations'

describe('crystal key drift', () => {
  it('Zod enum matches the crystal source of truth', () => {
    expect([...crystalTypeSchema.options].sort()).toEqual([...CRYSTAL_KEYS].sort())
  })
})
```

- [ ] **Step 6: Run the test and typecheck**

Run: `npx vitest run lib/__tests__/crystal-drift.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: errors in module-create call sites (they don't pass `crystal_type` yet) — these are fixed in Task 5. If the only errors are about `crystal_type` missing in `createModule`/`createModuleFromProposal` args, that is expected; proceed.

> Note: do not commit yet if `tsc` is red. Task 5 closes these. If you prefer a green commit here, temporarily make `crystal_type` optional in `moduleSchema` — but the cleaner path is to land Task 5 in the same logical change. Recommended: commit the migration + types now, accept that the persistence wiring (Task 5) is required before `tsc` is green.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20240106000000_module_crystal_type.sql lib/types.ts lib/validations.ts lib/__tests__/crystal-drift.test.ts
git commit -m "feat: add crystal_type column, type, and validation"
```

---

### Task 5: Crystal picker + persistence across all create/edit paths

**Files:**
- Create: `components/crystal-picker.tsx`
- Modify: `components/module-builder.tsx` (manual create/edit)
- Modify: `app/actions/modules.ts` (`createModule`, `updateModule`, `createModuleFromProposal`)
- Modify: `components/assistant/module-proposal-card.tsx` (AI standard proposal)
- Modify: `app/actions/formula.ts` (`createFormulaModule`, `createFormulaModuleFromProposal`, `updateFormulaModule`)
- Modify: `components/formula-builder.tsx` (formula create/edit)
- Modify: `components/assistant/formula-proposal-card.tsx` (AI formula proposal)

**Interfaces:**
- Consumes: `CRYSTALS`, `CRYSTAL_KEYS`, `CrystalKey` (Task 2); `CrystalType` (Task 4).
- Produces: `<CrystalPicker value={CrystalKey} onChange={(k: CrystalKey) => void} />` — a reusable row of 8 selectable gems with labels.

- [ ] **Step 1: Build the picker component**

Create `components/crystal-picker.tsx`:

```tsx
'use client'

import { CRYSTAL_KEYS, CRYSTALS, type CrystalKey } from '@/lib/crystals'
import { cn } from '@/lib/utils'

interface Props {
  value: CrystalKey
  onChange: (key: CrystalKey) => void
}

export function CrystalPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Crystal type">
      {CRYSTAL_KEYS.map((key) => {
        const c = CRYSTALS[key]
        const selected = key === value
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
              selected
                ? 'border-foreground/40 bg-muted font-medium'
                : 'border-border text-muted-foreground hover:bg-muted/50',
            )}
          >
            <span
              className="size-3 rounded-full"
              style={{ background: `radial-gradient(circle at 30% 30%, ${c.glow}, ${c.primary})` }}
            />
            {c.name}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Wire the picker into the manual builder**

In `components/module-builder.tsx`:

Add imports:
```tsx
import { CrystalPicker } from '@/components/crystal-picker'
import type { CrystalKey } from '@/lib/crystals'
```

Add state (after the `fields` state):
```tsx
const [crystalType, setCrystalType] = useState<CrystalKey>(initial?.crystal_type ?? 'amethyst')
```

Add `crystal_type` to the submitted FormData inside `handleSubmit` (after `fd.set('fields', ...)`):
```tsx
fd.set('crystal_type', crystalType)
```

Add the picker UI — insert a new section after the name `<div>` and before the first `<Separator />`:
```tsx
<div className="space-y-2">
  <Label>Crystal</Label>
  <CrystalPicker value={crystalType} onChange={setCrystalType} />
</div>
```

- [ ] **Step 3: Persist `crystal_type` in `app/actions/modules.ts`**

In `createModule`, update the `raw` object and the insert:
```ts
const raw = {
  name: formData.get('name') as string,
  fields: JSON.parse(formData.get('fields') as string) as ModuleField[],
  crystal_type: formData.get('crystal_type') as string,
}
```
```ts
.insert({ user_id: user.id, name: parsed.data.name, fields: parsed.data.fields, crystal_type: parsed.data.crystal_type })
```

In `updateModule`, mirror the same `raw` change, and update the update call:
```ts
.update({ name: parsed.data.name, fields: parsed.data.fields, crystal_type: parsed.data.crystal_type })
```

In `createModuleFromProposal`, change the signature and validation:
```ts
export async function createModuleFromProposal(
  name: string,
  fields: ModuleField[],
  crystalType: string,
): Promise<{ error: string } | { id: string }> {
```
```ts
const parsed = moduleSchema.safeParse({ name, fields, crystal_type: crystalType })
```
```ts
.insert({ user_id: user.id, name: parsed.data.name, fields: parsed.data.fields, crystal_type: parsed.data.crystal_type })
```

- [ ] **Step 4: Wire the picker into the AI standard proposal card**

In `components/assistant/module-proposal-card.tsx`:

Add imports:
```tsx
import { CrystalPicker } from '@/components/crystal-picker'
import type { CrystalKey } from '@/lib/crystals'
```
Add state (after the `fields` state):
```tsx
const [crystalType, setCrystalType] = useState<CrystalKey>('amethyst')
```
Update the confirm call:
```tsx
const result = await createModuleFromProposal(name, fields, crystalType)
```
Add the picker UI just below the tracker-name `<div>` (before the Fields block):
```tsx
<div className="space-y-1.5">
  <Label>Crystal</Label>
  <CrystalPicker value={crystalType} onChange={setCrystalType} />
</div>
```

- [ ] **Step 5: Persist `crystal_type` for formula modules in `app/actions/formula.ts`**

Formula modules also need a crystal (they render fully open, but the user still picks one). Add `crystal_type` to all three writers.

For `createFormulaModule` (FormData path), read it and pass through. Since `formulaModuleSchema` doesn't include crystal, validate it separately with `crystalTypeSchema`:

Add import:
```ts
import { crystalTypeSchema } from '@/lib/validations'
```
In `createFormulaModule`, after the existing `parsed`/`inputError` checks:
```ts
const crystal = crystalTypeSchema.safeParse(formData.get('crystal_type'))
if (!crystal.success) return { error: 'Pick a crystal for this tracker' }
```
Add to its insert:
```ts
crystal_type: crystal.data,
```

In `createFormulaModuleFromProposal`, change the signature and validate:
```ts
export async function createFormulaModuleFromProposal(
  name: string,
  config: FormulaConfig,
  crystalType: string,
): Promise<{ error: string } | { id: string }> {
```
```ts
const crystal = crystalTypeSchema.safeParse(crystalType)
if (!crystal.success) return { error: 'Pick a crystal for this tracker' }
```
Add `crystal_type: crystal.data,` to its insert.

In `updateFormulaModule`, read + validate `crystal_type` from FormData the same way and add it to the `.update({ ... })` call.

- [ ] **Step 6: Wire the picker into the formula builder and formula proposal card**

In `components/formula-builder.tsx`:
- Add the same `CrystalPicker` import and `import type { CrystalKey }`.
- Extend the `initial` prop type to include `crystal_type?: CrystalKey` (the edit page passes the module).
- Add `const [crystalType, setCrystalType] = useState<CrystalKey>(initial?.crystal_type ?? 'amethyst')`.
- In the submit handler, `formData.set('crystal_type', crystalType)` before calling the action.
- Render `<div className="space-y-2"><Label>Crystal</Label><CrystalPicker value={crystalType} onChange={setCrystalType} /></div>` near the name field.

In `components/assistant/formula-proposal-card.tsx`:
- Same import + `const [crystalType, setCrystalType] = useState<CrystalKey>('amethyst')`.
- Update the confirm call to `createFormulaModuleFromProposal(name, config, crystalType)`.
- Render the picker below the name field.

- [ ] **Step 7: Pass `crystal_type` from the formula edit page**

In `app/modules/[id]/edit/formula/page.tsx`, the `<FormulaBuilder initial={...} />` prop must include `crystal_type` from the loaded module. Add `crystal_type: (module as Module).crystal_type` to the `initial` object passed in.

- [ ] **Step 8: Verify typecheck, lint, and tests**

Run: `npx tsc --noEmit`
Expected: clean (all `crystal_type` call sites now satisfied).
Run: `npm run lint`
Expected: clean.
Run: `npx vitest run`
Expected: all green.

- [ ] **Step 9: Manual smoke check**

Run `npm run dev`. Create a tracker manually — confirm the crystal picker appears, a crystal is selectable, and the tracker saves. Repeat via the AI assistant proposal card and the formula builder.

- [ ] **Step 10: Commit**

```bash
git add components/crystal-picker.tsx components/module-builder.tsx app/actions/modules.ts components/assistant/module-proposal-card.tsx app/actions/formula.ts components/formula-builder.tsx components/assistant/formula-proposal-card.tsx "app/modules/[id]/edit/formula/page.tsx"
git commit -m "feat: crystal picker and persistence across all module create/edit paths"
```

---

### Task 6: Geological palette + dark mode (`app/globals.css`)

**Files:**
- Modify: `app/globals.css` (`:root` light tokens, `.dark` tokens, new `prefers-color-scheme` block, stone helper vars)

**Interfaces:**
- Consumes: nothing (CSS only).
- Produces: themed CSS custom properties. Adds two new app-level vars consumed by Task 7: `--stone-border` and `--stone-surface` (resolve to the themed border/card values), so the geode card can reference stone independently of crystal.

- [ ] **Step 1: Rewrite the light-mode `:root` tokens**

In `app/globals.css`, replace the existing neutral grayscale values in `:root` with the geological light palette (oklch conversions of the spec hex). Set at minimum:

```css
:root {
  --background: oklch(0.961 0.004 75);    /* #F4F1ED limestone */
  --foreground: oklch(0.224 0.013 285);   /* #1C1826 charcoal */
  --card: oklch(1 0 0);                    /* #FFFFFF */
  --card-foreground: oklch(0.224 0.013 285);
  --muted: oklch(0.93 0.004 75);
  --muted-foreground: oklch(0.61 0.008 60); /* #8C8580 */
  --border: oklch(0.87 0.006 75);          /* #DDD8D0 sandstone */
  --input: oklch(0.87 0.006 75);
  /* keep existing --primary/--radius/etc. unless they clash */
  --stone-surface: var(--card);
  --stone-border: var(--border);
}
```
Keep all other existing `:root` keys (`--primary`, `--radius`, sidebar/chart vars) intact; only adjust the surface/border/text values above and add the two `--stone-*` vars.

- [ ] **Step 2: Rewrite the `.dark` tokens**

In the existing `.dark { ... }` block, set the obsidian palette:

```css
.dark {
  --background: oklch(0.13 0.02 295);   /* #100E17 obsidian */
  --foreground: oklch(0.93 0.01 300);   /* #EDE8F5 */
  --card: oklch(0.19 0.02 295);          /* #1C1826 */
  --card-foreground: oklch(0.93 0.01 300);
  --muted: oklch(0.24 0.02 295);
  --muted-foreground: oklch(0.6 0.02 295); /* #7A7490 */
  --border: oklch(0.27 0.02 295);          /* #2E2A3B */
  --input: oklch(0.27 0.02 295);
  --stone-surface: var(--card);
  --stone-border: var(--border);
}
```
Keep other `.dark` keys intact.

- [ ] **Step 3: Make dark mode system-aware**

The `.dark` class is never applied anywhere. Add a media query so the dark tokens apply automatically based on OS preference. After the `.dark { ... }` block add:

```css
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --background: oklch(0.13 0.02 295);
    --foreground: oklch(0.93 0.01 300);
    --card: oklch(0.19 0.02 295);
    --card-foreground: oklch(0.93 0.01 300);
    --muted: oklch(0.24 0.02 295);
    --muted-foreground: oklch(0.6 0.02 295);
    --border: oklch(0.27 0.02 295);
    --input: oklch(0.27 0.02 295);
    --stone-surface: var(--card);
    --stone-border: var(--border);
  }
}
```

> This mirrors the `.dark` values onto `:root` under OS dark preference, while leaving the explicit `.dark` class working for a future manual toggle. The `:not(.light)` escape hatch lets a future toggle force light.

- [ ] **Step 4: Verify in the browser**

Run `npm run dev`. Load the app in light mode, then toggle your OS to dark (or use devtools "Emulate CSS prefers-color-scheme: dark"). Confirm the background goes obsidian, cards lift to `#1C1826`, and text stays legible. Check the nav, dashboard, and a module page.

- [ ] **Step 5: Typecheck/lint and commit**

Run: `npx tsc --noEmit` and `npm run lint` — both clean (CSS-only change, should be unaffected).

```bash
git add app/globals.css
git commit -m "feat: geological palette with system-aware dark mode"
```

---

### Task 7: Watercolor-styled staged `<GeodeIcon>` component

> Art direction reference: `docs/references/tracker-opening/frame_001.jpg … frame_010.jpg` — a
> 10-frame opening (whole stone → glowing cracks → split into ~4 chunks → crystal bloom with rays).
> We render the **static** state for a card's computed openness; the frames define the look per stage.

**Files:**
- Create: `components/geode-icon.tsx`
- Test: `lib/__tests__/geode-style.test.ts` (pure helper only — see Step 1)
- Create: `lib/geode-style.ts` (pure helper that builds the CSS variable object, so it's unit-testable without a DOM)

**Interfaces:**
- Consumes: `getCrystal` (Task 2).
- Produces:
  - `lib/geode-style.ts`: `geodeVars(crystalType: string, openness: number): React.CSSProperties` — returns `{ '--openness', '--crystal-primary', '--crystal-glow' }` (clamped openness, resolved colors).
  - `components/geode-icon.tsx`: `<GeodeIcon crystalType={string} openness={number} className?={string} />` — inline SVG using those vars.

- [ ] **Step 1: Write the failing test for the style helper**

Create `lib/__tests__/geode-style.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { geodeVars } from '../geode-style'

describe('geodeVars', () => {
  it('resolves crystal colors and clamps openness', () => {
    const v = geodeVars('citrine', 1.4) as Record<string, string | number>
    expect(v['--crystal-primary']).toBe('#C49A2A')
    expect(v['--crystal-glow']).toBe('#F0CC6A')
    expect(v['--openness']).toBe(1)
  })

  it('floors openness at 0 and falls back for unknown crystals', () => {
    const v = geodeVars('nope', -0.5) as Record<string, string | number>
    expect(v['--openness']).toBe(0)
    expect(v['--crystal-primary']).toBe('#9B6DCC') // amethyst fallback
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/geode-style.test.ts`
Expected: FAIL — cannot find module `../geode-style`.

- [ ] **Step 3: Write `lib/geode-style.ts`**

```ts
import type { CSSProperties } from 'react'
import { getCrystal } from './crystals'

export function geodeVars(crystalType: string, openness: number): CSSProperties {
  const c = getCrystal(crystalType)
  const clamped = Math.min(Math.max(openness, 0), 1)
  return {
    '--openness': clamped,
    '--crystal-primary': c.primary,
    '--crystal-glow': c.glow,
  } as CSSProperties
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/geode-style.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `components/geode-icon.tsx`** — watercolor-styled, staged

**Art direction is set by `docs/references/tracker-opening/frame_001.jpg … frame_010.jpg`.** Open
those images and match the look: ink outlines, layered watercolor-ish fills, a soft colored halo
behind the stone, paper-grain/roughened edges, and the staged opening below. The crystal color is
the CSS var `--crystal-primary`/`--crystal-glow` (the reference is red; ours recolors per type).

**Stage → openness map (from the spec):**

| Openness | Stage (frames) | Drawn |
|---|---|---|
| 0.0–0.2 | Sealed (1–2) | Whole grey faceted stone, faint seam, halo |
| 0.2–0.4 | Cracking (3–4) | Crack network spreads; first warm glow in seams |
| 0.4–0.55 | Charging (5) | Crack network glows bright; stone still closed |
| 0.55–0.75 | Splitting (6–7) | Stone parts into ~4 chunks; glow pours out; crystal tips emerge |
| 0.75–1.0 | Blooming (8–10) | Chunks at corners; full crystal cluster; rays + splatter + sparkles |

**Structure the SVG as stacked layers, each driven by openness via inline `calc()` on `style`** so
the whole thing renders statically at the given value (no JS animation). Build it as a skeleton
with the layer structure below, then **iterate the actual `d`/`points` paths against the reference
frames** until each stage reads right. The exact path data is expected to be hand-refined — the
skeleton encodes the *mechanics*, not final art.

```tsx
import { geodeVars } from '@/lib/geode-style'

interface Props {
  crystalType: string
  openness: number
  className?: string
}

// Per-instance gradient/filter ids must be unique when many cards render at once.
let GEODE_SEQ = 0

export function GeodeIcon({ crystalType, openness, className }: Props) {
  const uid = `geode-${(GEODE_SEQ = (GEODE_SEQ + 1) % 1e6)}`
  const crystalGrad = `${uid}-crystal`
  const roughen = `${uid}-roughen`
  const halo = `${uid}-halo`

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={geodeVars(crystalType, openness)}
      role="img"
      aria-label="Geode tracker"
    >
      <defs>
        {/* Crystal fill: glow -> primary */}
        <linearGradient id={crystalGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--crystal-glow)" />
          <stop offset="100%" stopColor="var(--crystal-primary)" />
        </linearGradient>
        {/* Roughen edges for a hand-painted, non-vector feel */}
        <filter id={roughen}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" />
        </filter>
        {/* Soft colored halo behind the stone (pink-ish in the ref; themed here) */}
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--crystal-glow)" stopOpacity="0.35" />
          <stop offset="70%" stopColor="var(--crystal-glow)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--crystal-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Halo — always present, intensifies slightly with openness */}
      <rect x="0" y="0" width="64" height="64" fill={`url(#${halo})`}
        style={{ opacity: 'calc(0.5 + var(--openness) * 0.5)' }} />

      {/* Burst rays + sparkles — bloom only (gated past ~0.8) */}
      <g stroke="var(--crystal-primary)" strokeWidth="1" strokeLinecap="round"
         style={{ opacity: 'calc(max(var(--openness) - 0.8, 0) * 5)' }}>
        <line x1="32" y1="2" x2="32" y2="10" />
        <line x1="62" y1="32" x2="54" y2="32" />
        <line x1="32" y1="62" x2="32" y2="54" />
        <line x1="2" y1="32" x2="10" y2="32" />
        <line x1="10" y1="10" x2="16" y2="16" />
        <line x1="54" y1="10" x2="48" y2="16" />
        <line x1="10" y1="54" x2="16" y2="48" />
        <line x1="54" y1="54" x2="48" y2="48" />
      </g>

      {/* Crack-glow network — lights up during charging, fades once split */}
      <g stroke="var(--crystal-glow)" strokeWidth="2" strokeLinecap="round" fill="none"
         filter={`url(#${roughen})`}
         style={{ opacity: 'calc(min(max(var(--openness) - 0.2, 0) * 4, 1) * (1 - max(var(--openness) - 0.75, 0) * 4))' }}>
        <path d="M32 12 L31 30 L33 40 L32 52" />
        <path d="M32 30 L18 33" />
        <path d="M33 34 L48 31" />
      </g>

      {/* Crystal cluster — grows out of the gap; scale + opacity rise with openness */}
      <g
        fill={`url(#${crystalGrad})`}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="0.6"
        style={{
          opacity: 'calc(max(var(--openness) - 0.5, 0) * 2)',
          transform: 'scale(calc(0.6 + var(--openness) * 0.4))',
          transformOrigin: 'center',
        }}
      >
        <polygon points="32,14 38,30 32,50 26,30" />
        <polygon points="22,22 29,34 23,48 17,33" opacity="0.9" />
        <polygon points="42,22 47,33 41,48 35,34" opacity="0.9" />
        {/* facet highlights */}
        <polygon points="32,14 35,30 32,42 30,30" fill="var(--crystal-glow)" opacity="0.55" stroke="none" />
      </g>

      {/* Stone shell — 4 chunks. Flush below split threshold; fly to corners past it. */}
      <g fill="#9a98a0" stroke="rgba(0,0,0,0.7)" strokeWidth="0.8" filter={`url(#${roughen})`}>
        <path style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -34px), calc(max(var(--openness) - 0.55, 0) * -34px))' }}
          d="M32 4 L33 30 L32 32 L6 32 L6 4 Z" />
        <path style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 34px), calc(max(var(--openness) - 0.55, 0) * -34px))' }}
          d="M32 4 L58 4 L58 32 L33 32 L32 30 Z" />
        <path style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * -34px), calc(max(var(--openness) - 0.55, 0) * 34px))' }}
          d="M6 32 L32 32 L33 34 L32 60 L6 60 Z" />
        <path style={{ transform: 'translate(calc(max(var(--openness) - 0.55, 0) * 34px), calc(max(var(--openness) - 0.55, 0) * 34px))' }}
          d="M33 32 L58 32 L58 60 L32 60 L32 34 Z" />
      </g>
    </svg>
  )
}
```

Notes for the implementer:
- The `calc(max(var(--openness) - 0.55, 0) * …)` pattern is how each stage "switches on" at its
  threshold using pure CSS (`max()` + `calc()` are stable in evergreen browsers). Keep that mechanic;
  refine the constants and paths visually.
- `feTurbulence`/`feDisplacementMap` give the painted, roughened edge. If it reads too noisy at
  card size, lower `scale` or drop the filter on the crystal layer.
- Unique `uid` per instance prevents gradient/filter id collisions when the grid renders many cards.

- [ ] **Step 6: Visual check against the reference frames**

Render `<GeodeIcon>` at openness `0.1, 0.3, 0.5, 0.65, 0.85, 1.0` for at least two crystal types
(e.g. `amethyst`, `carnelian`) on a scratch render. Compare each against the matching reference
stage in `docs/references/tracker-opening/`:
- 0.1 → frame 2 (sealed stone), 0.3 → frames 3–4 (cracking), 0.5 → frame 5 (glowing cracks),
  0.65 → frames 6–7 (splitting), 0.85 → frame 8, 1.0 → frame 10 (full bloom + rays).
Iterate the paths/constants until each stage reads recognizably like its frame, in **both light and
dark mode**. Remove the scratch render before committing.

- [ ] **Step 7: Typecheck, lint, test, commit**

Run: `npx tsc --noEmit`, `npm run lint`, `npx vitest run` — all clean/green.

```bash
git add components/geode-icon.tsx lib/geode-style.ts lib/__tests__/geode-style.test.ts
git commit -m "feat: watercolor-styled staged geode icon"
```

---

### Task 8: Integrate geode + status pill into the tracker card and dashboard

**Files:**
- Modify: `components/tracker-card.tsx` (geode visual, glow, status pill; remove red/green border)
- Modify: `components/tracker-grid.tsx` (thread an `openness` value per module to the card)
- Modify: `app/page.tsx` (aggregate entries query + compute openness per module)

**Interfaces:**
- Consumes: `GeodeIcon` (Task 7), `geodeVars` (Task 7), `computeOpenness` (Task 3), `getCrystal` (Task 2), `Module.crystal_type` (Task 4).
- Produces: `TrackerCard` accepts a new `openness: number` prop; `TrackerGrid` accepts `opennessByModule: Record<string, number>`.

- [ ] **Step 1: Compute openness in `app/page.tsx`**

Replace the today-only entry fetch with one that also gathers the openness inputs. After loading `typedModules` and `today`, add a 30-day window and an aggregate fetch:

```ts
import { computeOpenness } from '@/lib/openness'
import { daysAgoInTimezone } from '@/lib/date'
```

```ts
const since = daysAgoInTimezone(29, savedTimezone || 'UTC') // inclusive 30-day window

// One query: every entry (module_id, entry_date) for this user. At this scale
// (tens of users, a handful of trackers) this is a cheap indexed read.
const { data: allEntries } = moduleIds.length > 0
  ? await supabase
      .from('entries')
      .select('module_id, entry_date')
      .eq('user_id', user.id)
      .in('module_id', moduleIds)
  : { data: [] }

const nowMs = Date.parse(today + 'T00:00:00Z')
const recentDaysByModule = new Map<string, Set<string>>()
const totalByModule = new Map<string, number>()
for (const e of allEntries ?? []) {
  totalByModule.set(e.module_id, (totalByModule.get(e.module_id) ?? 0) + 1)
  if (e.entry_date >= since) {
    const set = recentDaysByModule.get(e.module_id) ?? new Set<string>()
    set.add(e.entry_date)
    recentDaysByModule.set(e.module_id, set)
  }
}

const opennessByModule: Record<string, number> = {}
for (const m of typedModules) {
  const createdMs = Date.parse(m.created_at)
  const daysSinceCreated = Math.max(0, Math.round((nowMs - createdMs) / 86400000))
  opennessByModule[m.id] = computeOpenness({
    recentDays: recentDaysByModule.get(m.id)?.size ?? 0,
    totalEntries: totalByModule.get(m.id) ?? 0,
    daysSinceCreated,
    isFormula: m.kind === 'formula',
  })
}
```

Keep the existing `doneToday` logic, deriving it from `allEntries` filtered to `entry_date === today` (so you don't need a second query):

```ts
const doneToday = new Set(
  (allEntries ?? []).filter((e) => e.entry_date === today).map((e) => e.module_id),
)
```

Pass the new map to the grid:
```tsx
<TrackerGrid
  modules={typedModules}
  initialDoneToday={[...doneToday]}
  serverDate={today}
  savedTimezone={savedTimezone}
  opennessByModule={opennessByModule}
/>
```

- [ ] **Step 2: Thread openness through `components/tracker-grid.tsx`**

Add to `TrackerGridProps`:
```ts
opennessByModule: Record<string, number>
```
Destructure it and pass per card:
```tsx
<TrackerCard
  key={mod.id}
  mod={mod}
  hasEntryToday={doneToday.has(mod.id)}
  today={today}
  openness={opennessByModule[mod.id] ?? 0}
  onMarkDone={handleMarkDone}
/>
```

- [ ] **Step 3: Rebuild `components/tracker-card.tsx`**

Replace the red/green border logic with the geode visual + a corner status pill. The card keeps its `Link` wrapper and `Mark done` button.

```tsx
'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GeodeIcon } from '@/components/geode-icon'
import { geodeVars } from '@/lib/geode-style'
import { markGreenForToday } from '@/app/actions/entries'
import { cn } from '@/lib/utils'
import type { Module } from '@/lib/types'

interface TrackerCardProps {
  mod: Module
  hasEntryToday: boolean
  today: string
  openness: number
  onMarkDone?: (moduleId: string) => void
}

export function TrackerCard({ mod, hasEntryToday, today, openness, onMarkDone }: TrackerCardProps) {
  const [isPending, startTransition] = useTransition()
  const isFormula = mod.kind === 'formula'

  function handleMarkGreen(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      const result = await markGreenForToday(mod.id, today)
      if (!result?.error) onMarkDone?.(mod.id)
    })
  }

  return (
    <div className="relative group">
      <Link href={`/modules/${mod.id}`} className="block">
        <Card
          className="h-full transition-shadow group-hover:shadow-md"
          style={{
            ...geodeVars(mod.crystal_type, openness),
            borderColor:
              'color-mix(in oklch, var(--stone-border), var(--crystal-primary) calc(var(--openness) * 100%))',
            boxShadow:
              '0 0 24px color-mix(in srgb, var(--crystal-glow) calc(var(--openness) * 45%), transparent)',
          }}
        >
          <CardHeader className="flex flex-row items-start gap-3">
            <GeodeIcon crystalType={mod.crystal_type} openness={openness} className="size-10 shrink-0" />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="truncate">{mod.name}</span>
                {isFormula && (
                  <span className="text-[10px] font-medium uppercase tracking-wide rounded-full bg-muted px-2 py-0.5 text-muted-foreground shrink-0">
                    Formula
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                {isFormula
                  ? 'Computed from other trackers'
                  : `${mod.fields.length} ${mod.fields.length === 1 ? 'field' : 'fields'}`}
              </CardDescription>
            </div>

            {/* Today status pill — only for loggable (non-formula) trackers */}
            {!isFormula && (
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  hasEntryToday
                    ? 'text-background'
                    : 'border border-border text-muted-foreground',
                )}
                style={
                  hasEntryToday
                    ? { backgroundColor: 'var(--crystal-primary)' }
                    : undefined
                }
              >
                {hasEntryToday ? <Check className="size-3" /> : null}
                {hasEntryToday ? 'Logged' : 'Today'}
              </span>
            )}
          </CardHeader>
        </Card>
      </Link>

      {!isFormula && !hasEntryToday && (
        <div className="absolute bottom-3 right-3 z-10">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={handleMarkGreen}
            disabled={isPending}
          >
            <Check className="w-3 h-3 mr-1" />
            {isPending ? 'Saving…' : 'Mark done'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck, lint, test**

Run: `npx tsc --noEmit` — clean.
Run: `npm run lint` — clean.
Run: `npx vitest run` — green.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. On the trackers page confirm:
- Each card shows its geode at a state matching its recent activity (new/idle trackers sealed; consistent ones open and glowing in their crystal color).
- The status pill reads "Logged" (filled, crystal color) when today has an entry, "Today" (hollow) otherwise.
- "Mark done" appears on hover (desktop) / always (mobile), and logging flips the pill to "Logged".
- Formula trackers show a fully-open geode and no pill.
- Check both light and dark mode.

- [ ] **Step 6: Commit**

```bash
git add components/tracker-card.tsx components/tracker-grid.tsx app/page.tsx
git commit -m "feat: geode tracker cards with openness and status pill"
```

---

### Task 9: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Full test run**

Run: `npx vitest run`
Expected: all suites green (crystals, openness, crystal-drift, geode-style).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds with no type or build errors.

- [ ] **Step 5: End-to-end manual walkthrough**

With `npm run dev`: create a standard tracker (pick a crystal), log entries across several days, confirm the geode opens; create a formula tracker (pick a crystal), confirm it renders fully open; create a tracker via the AI assistant and confirm the crystal picker is present. Verify light and dark mode throughout, and the mobile layout from the earlier responsive work still holds.

- [ ] **Step 6: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "chore: crystal/geode theme verification fixes"
```

---

## Self-Review

**Spec coverage:**
- Palette (light/dark) → Task 6. ✓
- 8 crystal types source of truth → Task 2. ✓
- Openness formula + momentum + formula=1 + divide-by-zero guard → Task 3. ✓
- `crystal_type` column + check constraint + composite index → Task 4. ✓
- Crystal picker in all create/edit paths (manual, AI, formula, formula-AI, edits) → Task 5. ✓
- SVG geode (shared geometry, color per type, parametric on openness) → Task 7. ✓
- Card: geode visual + glow + status pill replacing red/green → Task 8. ✓
- Aggregate `GROUP BY`-style read (single query) + index → Tasks 4 & 8. ✓
- Compute-on-read, no caching → Task 8 (no stored openness). ✓
- Dark mode system-aware via `prefers-color-scheme`, no new dep → Task 6. ✓
- Unit tests for openness + crystal drift → Tasks 3 & 4; runner → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code; commands have expected output. ✓

**Type consistency:** `crystal_type`/`CrystalType`/`CrystalKey` consistent across Tasks 2/4/5/7/8; `geodeVars`, `computeOpenness`, `OpennessInput`, `CrystalPicker` props match their definitions and consumers. `createModuleFromProposal` and `createFormulaModuleFromProposal` signature changes are reflected at their call sites (Tasks 5.4, 5.6). ✓
