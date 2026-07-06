# Phase 3: Crystal/Geode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the crystal/geode identity from the tracker cards to the whole app: Space Grotesk display type, a deep-violet chrome accent, and a per-page polish pass — per the decided design language in the 2026-07-02 spec (§Phase 3, amended 2026-07-06).

**Architecture:** Task 1 builds the design system (fonts, tokens, nav) that every page inherits; Tasks 2–8 are per-page passes applying the conventions defined in Task 1. Visual work can't be unit-tested — each task's gate is: existing 187 tests still pass, tsc/lint/build clean, and a code review against the scope rules below.

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme inline` tokens), shadcn/ui primitives, `next/font/google`, oklch color.

## Global Constraints

- **Crystal-scope rule (spec, decided 2026-07-06):** crystal colors belong EXCLUSIVELY to tracker surfaces (tracker cards, geode art, grid cells/pills, chart series). The violet chrome accent appears ONLY in app chrome (active nav, primary buttons, links, focus rings, form-control accents). No task may color chrome with a crystal color or a tracker surface with the chrome violet.
- **Deep Vein intensity:** no gradient chrome anywhere. Iridescent gradients stay reserved for the existing geode artwork. (The "Full Bloom" treatments are rejected.)
- **Chrome accent values:** light `#6D4A9E`, dark `#7E58B8` — express in oklch in globals.css (Task 1 defines the exact conversions; all later tasks consume tokens, never raw hex).
- **Typography:** Space Grotesk (display/headings) + Geist (body), both via `next/font/google`. No new dependencies of any kind.
- **shadcn primitives stay** — this is theming/composition, not a component-library swap.
- **Both color schemes ship together** on every task; WCAG AA for text and interactive states; visible focus states; `prefers-reduced-motion` respected for anything animated.
- **The geode card artwork (`geode-icon.tsx`, `geode-style.ts`, `crystals.ts`) is untouchable** in this phase.
- **Definition of done per task:** `npx tsc --noEmit` clean, `npm test` (187) passes, `npm run lint` clean, `npm run build` succeeds.
- **Branch:** all work on `refactor/phase-3-redesign` off `main`. Create in Task 1 Step 1.
- Copy changes are in scope only where a task names them (F-04's formula-summary copy in Task 4; otherwise wording stays).

## Design conventions (defined once, used by Tasks 2–8)

- **Page header recipe:** `h1` gets `font-heading text-3xl font-bold tracking-tight` (the `font-heading` utility exists after Task 1); subtitle stays `text-muted-foreground`. Section headings (`h2`-level) get `font-heading text-xl font-semibold tracking-tight`.
- **Card titles** (`CardTitle` and equivalents) get `font-heading`.
- **Primary actions** use the default shadcn `Button` (which Task 1 turns violet via `--primary`); secondary actions stay `variant="outline"`. Never hand-roll button colors.
- **Links in prose/chrome:** `text-accent-text hover:underline underline-offset-4` — the AA-safe text tier of the accent (same as `--primary` in light; lifted in dark). Violet TEXT always uses `text-accent-text`; `--primary` is the surface/ring tier only (Task 1 amendment, 2026-07-06).
- **Empty states:** dashed border card, `font-heading` heading, one primary + one outline action — the pattern already on the trackers page, restyled once in Task 3 and copied verbatim where other pages need one.
- **Surface depth:** cards/dialogs may gain at most `shadow-sm` → `shadow-md on hover` and 1px borders — no new gradients, no glows on non-tracker surfaces.

---

### Task 1: Design system — fonts, tokens, nav

**Files:**
- Modify: `app/layout.tsx` (add Space Grotesk via next/font)
- Modify: `app/globals.css` (violet chrome tokens, heading font token, focus ring)
- Modify: `components/nav.tsx` (active-state violet, font-heading brand)
- Test: existing suite only (visual change)

**Interfaces:**
- Consumes: nothing.
- Produces (all later tasks rely on): CSS vars `--primary`/`--ring`/`--font-heading` retuned; Tailwind utility `font-heading`; nav active convention `text-accent-text font-semibold`.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git checkout -b refactor/phase-3-redesign
```

- [ ] **Step 2: Load Space Grotesk in `app/layout.tsx`**

Add to the existing font block (Geist imports stay):

```tsx
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
})
```

and add `${spaceGrotesk.variable}` to the `<html>` className alongside the existing font variables.

- [ ] **Step 3: Retune tokens in `app/globals.css`**

1. In `@theme inline`: change `--font-heading: var(--font-sans);` → `--font-heading: var(--font-space-grotesk), var(--font-sans);` (this makes Tailwind's `font-heading` utility real).
2. In `:root` (light): replace the near-black primary with the violet chrome —

```css
--primary: oklch(0.47 0.14 303);            /* #6D4A9E deep obsidian violet */
--primary-foreground: oklch(0.985 0 0);
--ring: oklch(0.47 0.14 303);
```

3. In `.dark` AND the `prefers-color-scheme` media block: 

```css
--primary: oklch(0.55 0.14 302);            /* #7E58B8 lifted for AA on obsidian */
--primary-foreground: oklch(0.985 0 0);
--ring: oklch(0.55 0.14 302);
```

4. Verify the exact oklch conversions with a converter before committing (the values above are close approximations; the hex references are normative). Round to 3 decimals.
5. Add to `@layer base`: `h1, h2, h3 { font-family: var(--font-heading); }` — pages then opt individual headings into size/weight via the header recipe classes.

- [ ] **Step 4: Nav (`components/nav.tsx`)**

1. Brand link: add `font-heading` to the existing classes.
2. `navLinkClass`: active state becomes `text-accent-text font-semibold` (AA-safe text tier) (inactive stays as-is). Mobile dropdown inherits automatically (same helper).
3. Contrast check: violet on limestone `#F4F1ED` and lifted violet on obsidian `#100E17` must both pass AA for the nav's text size — verify with a contrast checker and note results in the report.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Then `npm run dev`: every page now shows violet primary buttons + Space Grotesk h1s (inherited via base layer) with zero per-page edits yet. Confirm no tracker-surface color changed (tracker cards must look identical except heading font).

- [ ] **Step 6: Commit**

```bash
git add app/ components/nav.tsx
git commit -m "design(system): Space Grotesk display font, deep-violet chrome tokens, nav active state"
```

---

### Task 2: Login page

**Files:**
- Modify: `app/login/page.tsx` (+ any co-located login form component it imports — read the page first)

**Interfaces:**
- Consumes: Task 1 tokens/utilities.
- Produces: nothing downstream.

- [ ] **Step 1: Read the current page**, note its structure (it was NOT part of the (app) route group; it owns its full layout).

- [ ] **Step 2: Apply the identity**

1. Brand/title gets `font-heading` + the page-header recipe sizes.
2. Primary submit button: ensure it's the default `Button` (now violet). Secondary/toggle actions outline or link style per conventions.
3. Give the page its one distinctive moment within Deep Vein rules: center the card on the limestone/obsidian background and add a single `GeodeIcon` (import the existing component, any openness value ≥0.8, `amethyst`) above the title as brand mark — this is tracker-surface ART used as brand, which the spec's scope rule permits for the geode artwork itself; do NOT tint chrome with crystal colors.
4. Both color schemes; focus-visible rings on inputs (inherited `--ring` should already be violet — verify visually).

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/login/ && git commit -m "design(login): crystal brand mark, heading font, violet chrome"
```

---

### Task 3: Trackers page + dashboard

**Files:**
- Modify: `app/(app)/page.tsx` (header, action row, empty state), `app/(app)/dashboard/page.tsx` (header), `components/tracker-grid.tsx` (only if class-level polish needed), `components/consistency-grid.tsx` (header/controls chrome ONLY — cells are tracker surfaces, untouchable)

**Interfaces:**
- Consumes: Task 1 conventions.
- Produces: the restyled empty-state pattern other pages copy.

- [ ] **Step 1: Apply the page-header recipe** to both pages' h1/subtitle; action buttons per conventions (AI assistant = primary/violet, others outline — this is already the hierarchy, verify).

- [ ] **Step 2: Empty state (trackers page)**: dashed border stays; heading gets `font-heading`; add the same `GeodeIcon` brand-mark treatment as login (sealed stone look: openness 0 — "your first geode is waiting" energy; keep existing copy).

- [ ] **Step 3: Consistency-grid page chrome**: window-mode controls/selects get standard focus rings; column headers may take `font-heading` at their existing size. DO NOT touch cell rendering, crystal glyphs, `--grid-done/notdone` tokens, or anything driven by `crystalOverride`.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/ components/ && git commit -m "design(trackers,dashboard): header recipe, empty-state brand mark, grid chrome polish"
```

---

### Task 4: Module detail + builders

**Files:**
- Modify: `app/(app)/modules/[id]/page.tsx`, `app/(app)/modules/new/page.tsx`, `app/(app)/modules/new/formula/page.tsx`, edit pages, `components/module-builder.tsx`, `components/formula-builder.tsx`, `components/chart-builder.tsx`, `components/formula-summary.tsx`, `components/entry-form.tsx`, `components/entry-list.tsx` (chrome classes only)

**Interfaces:**
- Consumes: Task 1 conventions.
- Produces: nothing downstream.

- [ ] **Step 1: Page headers + section headings** per recipe across all module pages and the three builders (builders are long forms — their step/section headings get `font-heading text-xl font-semibold`).

- [ ] **Step 2: Form chrome:** primary submit buttons default-violet; destructive actions keep `variant="destructive"`; selects/inputs keep shadcn defaults (focus rings now violet via tokens). Chart previews and crystal pickers are tracker surfaces — colors untouched.

- [ ] **Step 3 (assigned from Task 1 review): calendar-heatmap cell color.** `components/charts/calendar-heatmap.tsx:131-160` uses `bg-primary` for cells — after the retune that paints tracker chart surfaces violet (scope-rule violation) and `bg-primary/25` is near-invisible on obsidian. Change cells to a neutral scale (`bg-foreground` opacity steps, matching how the consistency grid handles neutral cells) — NOT a crystal color (the heatmap is generic) and NOT `--primary`.

- [ ] **Step 4: F-04 copy fix (ruled 2026-07-06, carried from Phase 2):** in `components/formula-summary.tsx` (~line 47-48), align the default-substitution copy with actual behavior: defaults fill missing values only on days where at least one input has real data; days with no data are omitted from the series. Keep it to one sentence in the existing style.

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/ components/ && git commit -m "design(modules,builders): heading hierarchy, form chrome, heatmap neutral cells, F-04 copy alignment"
```

---

### Task 5: Assistant

**Files:**
- Modify: `app/(app)/assistant/page.tsx`, `components/assistant/chat.tsx`, proposal cards (`module-proposal-card.tsx`, `formula-proposal-card.tsx`, `chart-proposal-card.tsx`, `analytics-insight-card.tsx`) — chrome only

**Interfaces:**
- Consumes: Task 1 conventions.
- Produces: nothing downstream.

- [ ] **Step 1: Page header recipe**; chat input focus ring (inherited — verify); send/confirm buttons primary-violet; user-message bubbles may use `bg-primary text-primary-foreground` (chrome), assistant bubbles stay neutral surfaces.

- [ ] **Step 2 (includes Task 1 review assignment): Proposal cards:** migrate `text-primary`-as-text to `text-accent-text` at `components/assistant/analytics-insight-card.tsx:157` and `components/assistant/chart-proposal-card.tsx:115` (dark-mode AA failure at 3.29:1 otherwise). Then: titles `font-heading`; their "Add/Create" confirm buttons primary. Crystal pickers and chart previews inside cards are tracker surfaces — untouched.

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/ components/assistant/ && git commit -m "design(assistant): chat chrome, proposal-card headings"
```

---

### Task 6: Food

**Files:**
- Modify: `app/(app)/food/page.tsx`, `components/food/*.tsx` (chrome classes only: headers, buttons, focus, error text placement stays)

**Interfaces:**
- Consumes: Task 1 conventions.
- Produces: nothing downstream.

- [ ] **Step 1:** Page header recipe; date-nav chevrons/back-to-today get standard chrome hover/focus states; DailyTotalsBar numbers may take `font-heading` + `tabular-nums` at existing sizes; photo-uploader/manual-entry submit buttons primary-violet; analyze flow keeps its existing inline error rendering (Phase 2 work — don't restructure).

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/ components/food/ && git commit -m "design(food): header recipe, totals type, chrome states"
```

---

### Task 7: Journal (+ template builder)

**Files:**
- Modify: `app/(app)/journal/page.tsx`, `app/(app)/journal/template/page.tsx`, `components/journal/*.tsx` (chrome only)

**Interfaces:**
- Consumes: Task 1 conventions.
- Produces: nothing downstream.

- [ ] **Step 1:** Page header recipe on both pages; capture flow's save/transcribe buttons primary-violet; the local-only privacy note (photos never leave the device) gets a quiet emphasized treatment (`text-xs text-muted-foreground` with a small lock icon from lucide if one is already imported in the tree — no new icon package, lucide is present); history list dates keep `formatDisplayDate` output, entries' titles `font-heading`.

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/ components/journal/ && git commit -m "design(journal): header recipe, capture chrome, privacy note emphasis"
```

---

### Task 8: Settings + whole-app polish sweep

**Files:**
- Modify: `app/(app)/settings/page.tsx`, `components/settings-*.tsx`; sweep-verify every page

**Interfaces:**
- Consumes: everything.
- Produces: the finished phase.

- [ ] **Step 1:** Settings page header recipe; theme/timezone controls standard chrome.

- [ ] **Step 2: Scope-rule sweep (the phase's own acceptance test):**

```bash
grep -rn "9B6DCC\|6D4A9E\|7E58B8" app components lib --include="*.tsx" --include="*.ts"
```

Expected: zero raw-hex hits outside `lib/crystals.ts` (crystal defs) and `globals.css` comments. Then grep chrome tokens in tracker-surface components (`tracker-card.tsx`, `geode-*`, `consistency-grid.tsx` cells, chart series): `text-primary|bg-primary` must not appear on tracker surfaces. Any hit = fix before commit.

- [ ] **Step 3: Contrast + reduced-motion audit:** verify violet-on-limestone, lifted-violet-on-obsidian, and `--primary-foreground`-on-primary all AA at their used sizes; any transition added this phase respects `prefers-reduced-motion` (the existing `tw-animate-css` utilities do; verify anything hand-rolled).

- [ ] **Step 4: Full verification + commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add app/ components/ && git commit -m "design(settings): header recipe; polish sweep + scope-rule audit"
```

---

## Final phase verification (run on Fable 5)

- [ ] Full DoD suite on the branch head.
- [ ] Whole-branch review: scope-rule compliance (no crystal chrome / no violet tracker surfaces), convention consistency across all 8 tasks, no geode-artwork diffs.
- [ ] Human pass required before merge: this phase is visual — the user reviews the running app (both color schemes) page by page. List any deviations they should look at in the close-out report.

## Scope notes

- The Phase 2/earlier deferred code cleanups (totals-via-useMemo, `toFiniteNumber` naming, `created_at` secondary sort, wake double-fetch dedupe) are NOT bundled into this visual phase — they remain on the backlog ledger.
- Model policy (user requirement): per-task review and final verification on Fable 5. Implementers: Sonnet (visual judgment + multi-file, prose-spec tasks).
