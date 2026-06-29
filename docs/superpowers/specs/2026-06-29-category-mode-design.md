---
title: Category mode for the consistency grid
date: 2026-06-29
status: approved
---

## Problem

The consistency grid currently has three modes: binary, goal, and gradient. None of them can distinguish between *kinds* of done days. A lifting tracker, for example, has three semantically different outcomes:

- Lift day (logged, category = Lift)
- Intentional rest day (logged, category = Rest)
- Missed workout (no entry)

Both "lift" and "rest" should count as done for streak purposes, but they should render as different colors so the user can see the pattern at a glance.

## Solution

Add a new `category` dashboard mode. Each day's color is determined by the value of a `select` field on the module. Each select option maps to a crystal from the existing palette. Missed days (no entry) remain `not-done`.

## Data model

Extend `DashboardConfig` in `lib/types.ts`:

```ts
export type DashboardMode = 'binary' | 'goal' | 'gradient' | 'category'

export interface DashboardConfig {
  mode: DashboardMode
  // ... existing fields ...
  /** Required when mode = 'category' */
  categoryField?: string
  /** option value → crystal key; unmapped options fall back to the module's crystal */
  categoryColors?: Record<string, CrystalKey>
}
```

Add a `category` branch to `dashboardConfigSchema` in `lib/validations.ts`:

```ts
z.object({
  mode: z.literal('category'),
  categoryField: z.string().min(1, 'Pick a select field'),
  categoryColors: z.record(z.string(), crystalTypeSchema).optional(),
})
```

Add a `superRefine` check that `categoryField` exists on the module and is type `select`.

## Cell computation

In `lib/consistency-grid.ts`:

- Extend `CellState` to add no new states — `done` / `not-done` / `inactive` remains the full set.
- Extend `GridCell` with two optional fields:
  ```ts
  crystalOverride?: CrystalKey   // set in category mode when the option has a mapped crystal
  categoryLabel?: string          // the raw option value, for hover/aria
  ```
- Add `case 'category'` to `computeCellState`:
  - No entries → `{ state: 'not-done', intensity: 0 }`
  - Entries exist → `state: 'done'`, `intensity: 1`. Read the `categoryField` value from the **most recent** entry (highest index in `dayEntries`). Look up its crystal in `categoryColors`; if unmapped, `crystalOverride` is undefined (falls back to module crystal in the renderer). Set `categoryLabel` to the raw option value.

## Rendering

In `components/consistency-grid.tsx`:

- `CrystalCell` receives the cell plus the module crystal (already the case). When `cell.crystalOverride` is set, use `getCrystal(cell.crystalOverride)` instead of the module crystal for the diamond color and glow.
- `aria-label` shows the `categoryLabel` when present (e.g. `"done (Rest)"`).

## Config UI

In `components/module-builder.tsx`:

- Add `"Category (color by select field)"` to the Mode `<Select>`.
- Add state: `categoryField: string`, `categoryColors: Record<string, CrystalKey>`.
- When `category` mode is selected, show:
  1. A `<Select>` listing the module's `select`-type fields. If none exist, show a hint ("Add a select field above to use category mode").
  2. Once a field is chosen, for each option of that field, show a row: `[option label] → [crystal picker]`. Crystal picker is a `<Select>` over `CRYSTAL_KEYS`. Default = module crystal.
- Serialize as `categoryField` + `categoryColors` (include all options, even those using the module's own crystal, so the stored config is self-contained).

## Streak / completion behavior

No change to `computeColumnStats`. Category-done cells have `state: 'done'` and are counted normally. Only missed days (`state: 'not-done'`) break streaks and lower completion %.

## Out of scope

- A per-day legend in the grid (hover shows the label instead)
- Per-option "neutral" / "broken" semantic overrides (all logged options count as done)
- Multi-entry tiebreak configuration (most-recent-entry wins, not configurable)
