# Full Refactor: Cleanup → Bug Hunt → Crystal Redesign — Design

**Date:** 2026-07-02
**Status:** Approved (pending written-spec review)

## Summary

A three-phase refactor of the whole codebase (~16k lines of TS/TSX):

1. **Phase 1 — Bloat elimination.** Dedupe repeated code, split oversized components,
   cut loading-time waste. No intended behavior change.
2. **Phase 2 — Bug & edge-case hunt.** Systematic audit by risk area. Obvious logic
   bugs are fixed immediately with regression tests; behavior judgment calls are
   reported for the user to decide.
3. **Phase 3 — Bold crystal/geode redesign.** Extend the existing crystal/geode
   identity (see `2026-06-17-crystal-geode-theme-design.md`) from the tracker cards
   to the entire app: typography, gem-tone accent system, per-page passes.

Sequencing rationale: cleanup and bugs first so the redesign never restyles code
that's about to be deleted, and each phase lands as its own reviewable diff.

## Decisions (made during brainstorming)

- **Sequencing:** cleanup → bugs → redesign.
- **Bug workflow:** fix obvious immediately, report ambiguous/judgment calls.
- **Design direction:** lean hard into crystal/geode — amplify the existing identity,
  not a new one and not theme-agnostic polish.
- **Phase 3 scope:** full per-page pass (all pages), not the trimmed version.
- **PRD:** updated alongside this spec — the "shadcn defaults only / no custom design
  system" MVP rule is retired; §2, §10, §11 amended.

## Non-Goals

- No new runtime dependencies without asking (fonts via `next/font` are fine).
- No schema/data-model changes (any found data bug that needs a migration is a
  "report first" item).
- No feature additions; awkward-interaction fixes change behavior only as far as
  removing the awkwardness.
- No rewrite of the geode card artwork — it's the theme's signature and already built.

---

## Phase 1 — Bloat elimination

**Goal:** leaner code and faster loads with zero behavior change.

### Targets

1. **Server boilerplate dedupe.** Pages and server actions repeat the same
   auth-check → redirect → profile/timezone-fetch dance. Extract shared helpers
   (e.g. `requireUser()`, `getUserTimezone()`) in `lib/supabase/` and adopt them
   everywhere.
2. **Oversized component extraction.** `components/food/food-log.tsx` (930 lines),
   `components/chart-builder.tsx` (622), `components/module-builder.tsx` (599),
   and similar get split into focused subcomponents/hooks where boundaries are
   clean. Extraction, not rewrite: JSX and logic move, they don't change.
3. **Loading-time pass.**
   - Client components that could be server components (or have a smaller client leaf).
   - Recharts in initial bundles → dynamic-import chart views.
   - Redundant Supabase round trips per page.
   - Unnecessary re-renders in the tracker grid / dashboard.
4. **Dead code and duplicate helpers** across `lib/` (date, parsing, validation overlap).

### Verification

`npx tsc --noEmit`, `npm run lint`, and the existing test suite after each chunk.
Behavior-preserving means: same rendered output, same data written.

---

## Phase 2 — Bug & edge-case hunt

**Goal:** find and eliminate logic bugs, awkward interactions, and unhandled edge cases.

### Audit order (by risk)

1. **Date/timezone logic** — day boundaries, DST, the `savedTimezone || 'UTC'`
   fallbacks scattered across pages, `lib/date.ts` edge cases.
2. **Formula evaluation** (`lib/formula.ts`) — division by zero, missing fields,
   empty datasets.
3. **Consistency-grid computation** (`lib/consistency-grid.ts`) — category mode is
   newest and least battle-tested.
4. **Import wizard** (`lib/import.ts`, `components/import/`) — malformed CSV, dupes,
   date parsing.
5. **Optimistic UI / concurrency** — quick-log, entry edits, stale server state.
6. **Server-action error handling** — unhandled rejections, silent failures,
   missing revalidation.
7. **Journal ↔ binary-tracker linkage** — recent fix history (`a45101f`, `a51b1db`)
   suggests fragility.

### Workflow

- **Obvious logic bug** → fix immediately + regression test in `lib/__tests__/`.
- **Behavior/UX judgment call** → goes on a findings report with severity and a
  proposed fix; user picks what gets fixed.

---

## Phase 3 — Bold crystal/geode redesign

**Goal:** the crystal/geode identity currently concentrated in the tracker cards
becomes the whole app's identity. Builds on the palette, crystal map, and geode
artwork from the 2026-06-17 theme spec — extends, never contradicts.

### Design language

- **Typography:** a distinctive display font for headings via `next/font`
  (no new deps), paired with Geist for body. Exact face chosen during
  implementation with user sign-off on a comparison.
- **Color & light:** gem-tone accent system — amethyst-family primary replacing the
  current near-black `--primary`; sparing iridescent gradient accents on key moments
  (active nav state, primary buttons, progress, empty states); dark mode keeps the
  obsidian/violet cast and gains depth (surface glow, crystal-tinted borders).
- **Surfaces:** cards, dialogs, and grid cells get subtle depth/faceting cues;
  crystal colors do real work app-wide instead of only inside the grid.
- **Motion:** restrained transitions using the existing `tw-animate-css`;
  everything gated on `prefers-reduced-motion`.

### Per-page pass (each page is a checkpoint)

1. Design tokens + `globals.css` + nav (sets the system everything inherits)
2. Login
3. Trackers `/` + dashboard `/dashboard`
4. Module detail + builders (manual, formula, chart)
5. Assistant
6. Food
7. Journal
8. Settings

### Constraints

- shadcn/ui primitives stay — this is theming and composition on top, not a
  component-library swap.
- Both color schemes ship together for every page (no "dark mode later").
- Accessibility floor: WCAG AA contrast for text, visible focus states.

---

## Process

- Each phase is its own branch and reviewable diff; discrete tasks within a phase
  get a stop-and-report checkpoint per the user's workflow rules.
- Definition of done per chunk: typecheck, tests, lint all pass.
- Next step after spec approval: writing-plans skill produces the Phase 1
  implementation plan (phases 2 and 3 get their plans when reached, informed by
  what earlier phases uncover).
