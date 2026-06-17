# Crystal & Geode Theme — Design

**Date:** 2026-06-17
**Status:** Approved (pending written-spec review)

## Summary

Retheme Druzy around crystals and geodes. The defining metaphor: each tracker is a
**geode** that starts sealed in rough stone and progressively **cracks open to reveal a
crystal interior** as the habit/skill is kept up. The crystal's color and personality are
chosen by the user per tracker, so the grid reads as a collection of distinct gems at
varying stages of opening.

The name "Druzy" is itself a crystal term (the fine crystal coating inside a geode), so the
theme is a natural fit rather than a bolt-on.

## Goals

- A coherent geological visual identity across the whole app (palette, surfaces, type accents),
  not just the cards.
- Tracker cards that visibly "open" based on long-term consistency, with a momentum effect
  rewarding re-engagement after a lapse.
- A user-chosen crystal type per tracker giving each card a distinct identity.
- Preserve the existing daily "logged today" signal as a clearly separate indicator.
- Light and dark mode, system-aware.

## Non-Goals

- Canvas / WebGL rendering (rejected — SVG gives crisp, themeable vector art without the weight).
- Per-type bespoke geode *shells* (the shell geometry is shared across all 8 types for homogeneity;
  only crystal color and optional facet accents vary).
- Animated openness transitions on the client (static render at computed value; see Known Extensions).
- A manual light/dark toggle (system preference only for now).
- Caching/denormalizing openness (rejected — see Performance).
- An explicit "skip a day" entry state (not a current concept; left as a future pill variant).

---

## Palette

Colors are authored in oklch to match the existing shadcn token system in `app/globals.css`.
Hex values below are the design reference; convert to oklch when implementing.

### Surfaces — Dark mode
| Token | Hex ref | Role |
|---|---|---|
| Background | `#100E17` | Deep obsidian, faint violet undertone |
| Surface (cards) | `#1C1826` | Lifted stone |
| Border | `#2E2A3B` | Geological seam |
| Muted text | `#7A7490` | Dusty lavender-gray |
| Foreground | `#EDE8F5` | Off-white with crystal hint |

### Surfaces — Light mode
| Token | Hex ref | Role |
|---|---|---|
| Background | `#F4F1ED` | Warm pale limestone |
| Surface (cards) | `#FFFFFF` | Clean geode interior |
| Border | `#DDD8D0` | Sandstone seam |
| Muted text | `#8C8580` | Weathered stone |
| Foreground | `#1C1826` | Deep charcoal |

### Crystal types (8)
Each crystal has a **primary** (structural/border color) and a **glow** (interior/shadow color).
Crystal colors are identical in both light and dark mode; only the stone surfaces differ.

| Key | Name | Primary | Glow |
|---|---|---|---|
| `amethyst` | Amethyst | `#9B6DCC` | `#C9A7F0` |
| `rose_quartz` | Rose Quartz | `#D4789C` | `#F0B8CF` |
| `citrine` | Citrine | `#C49A2A` | `#F0CC6A` |
| `aquamarine` | Aquamarine | `#3AADA8` | `#7FE0DC` |
| `malachite` | Malachite | `#3A9B6F` | `#72D4A8` |
| `carnelian` | Carnelian | `#C45E3A` | `#F09070` |
| `labradorite` | Labradorite | `#4A7AB5` | `#8AB8E8` |
| `obsidian` | Obsidian | `#6A6580` | `#A8A2C0` |

The crystal map (key → name, primary, glow) lives in one module, e.g. `lib/crystals.ts`,
as the single source of truth consumed by the card, the picker, and any preview.

---

## Openness mechanic

Openness is a number in `[0, 1]` driving every visual stage of a card. It is computed
**server-side on read** (never stored).

```
recent_score   = (# distinct days with an entry in the last 30 days) / 30      // 0–1
lifetime_score = min(total_entries / days_since_created, 1)                     // 0–1, capped
openness       = min(recent_score * (1 + lifetime_score * 0.5), 1)
```

Properties this gives us:
- **No recent activity → sealed**, regardless of history (recent_score = 0 ⇒ openness = 0).
- **Momentum / re-engagement:** an established tracker (high lifetime_score) re-opens up to
  1.5× faster than a brand-new one at the same recent rate.
- Always bounded to `[0, 1]`.

Edge cases:
- `days_since_created < 1` → treat as 1 to avoid divide-by-zero / >1 blowups.
- **Formula trackers** do not log daily entries; they render at a **fixed openness of 1**
  (fully open). Their crystal still displays; the openness formula is not applied.

### Visual stages
Driven by the single `--openness` value; thresholds are for narrative description — the CSS
interpolates continuously, it does not snap between stages.

| Range | Stage | Appearance |
|---|---|---|
| 0–0.2 | Sealed | Rough stone face; faint crack seam; crystal barely visible at edge |
| 0.2–0.4 | Cracking | Visible crack; warm glow escaping; stone dominant |
| 0.4–0.6 | Opening | Crystal interior clearly showing through a widened split |
| 0.6–0.8 | Open | Surface shifts stone → crystal; border glows crystal-primary |
| 0.8–1.0 | Blooming | Full crystal face; subtle shimmer; box-shadow radiates glow |

---

## Card design

Two **independent** visual channels so they never conflict:

1. **Geode openness** (the card surface, border, glow) = long-term consistency.
2. **Today status pill** (top corner, its own element) = today's logging state.

### Status pill
| State | Appearance |
|---|---|
| Logged today | Filled pill, crystal-glow color, check icon |
| Not yet | Hollow pill, muted stone outline, "Today" label |
| (future) Skipped | Dashed/muted variant — not built now |

This **replaces** the current red/green card border (`border-green-500` / `border-red-400` in
`components/tracker-card.tsx`). The geode is now the card's primary visual; the pill carries
the binary daily signal.

### Implementation: watercolor-styled SVG geode

The geode is rendered as an **inline SVG** illustration, recolorable per crystal via CSS custom
properties. SVG is chosen so all 8 crystal types recolor cleanly from one shared illustration —
raster frames would need re-rendering per color. The **art direction follows the reference
frames in `docs/references/tracker-opening/`**: hand-drawn ink outlines, layered watercolor-ish
fills, a soft colored halo behind the stone, and paper-grain texture. True painterly watercolor
is *approximated* in SVG (ink strokes + layered translucent fills + an `feTurbulence`/`feDisplacementMap`
roughen filter on edges + a soft radial halo), not pixel-identical to the painted frames.

**Shared geometry, per-type color (homogeneity):** there is **one** reusable `<GeodeIcon>`
component. The stone, crack network, crystal cluster, and burst rays are all shared geometry;
crystal *type* changes only the fill/gradient colors via CSS vars, never the silhouette. Every
card is recognizably the same object; only the gem color differs.

**Driven by CSS variables** (set inline on the SVG root, cast `as React.CSSProperties`):
`--openness` (0–1 number), `--crystal-primary`, `--crystal-glow`.

**Staged reveal — the reference is a 10-frame opening; we render the static state for the card's
computed openness.** The frames map to openness thresholds (continuous interpolation where
practical; layer opacity/transform crossfades between stages otherwise):

| Openness | Stage (matches reference frames) | What's drawn |
|---|---|---|
| 0.0–0.2 | **Sealed** (frames 1–2) | Whole faceted grey stone, faint hairline seam, soft halo |
| 0.2–0.4 | **Cracking** (frames 3–4) | Crack network spreads across the stone; first warm glow in the seams |
| 0.4–0.55 | **Charging** (frame 5) | Crack network glows bright (energy `--crystal-glow`); stone still closed |
| 0.55–0.75 | **Splitting** (frames 6–7) | Stone parts into ~4 chunks; glow pours from the gap; crystal tips emerge |
| 0.75–1.0 | **Blooming** (frames 8–10) | Chunks pushed to the corners; full faceted crystal cluster centered; radiating rays + watercolor splatter + sparkles |

Mechanics:
- **Stone chunks:** ~4 chunk paths, each translating outward (toward its corner) by
  `calc(var(--openness) * <amount>)` past the split threshold, with a slight rotation. Below the
  split threshold they sit flush forming the whole stone.
- **Crack glow:** the crack/seam paths are stroked with `--crystal-glow`, their opacity rising
  with openness so the "charging" stage lights up before the stone parts.
- **Crystal cluster:** faceted polygons filled by a `linearGradient` from `--crystal-glow` to
  `--crystal-primary`, with lighter facet-highlight overlays; cluster scale/opacity rise with
  openness so it grows out of the gap.
- **Burst rays + sparkles:** radiating stroke lines + a few sparkle marks, opacity gated to
  high openness (~past 0.8) so they only appear at bloom.
- **Border / card glow** (on the card element, not the SVG):
  `border-color: color-mix(in oklch, var(--stone-border), var(--crystal-primary) calc(var(--openness) * 100%))`
  and
  `box-shadow: 0 0 24px color-mix(in srgb, var(--crystal-glow) calc(var(--openness) * 45%), transparent)`.
- **Blooming shimmer:** an optional subtle highlight/opacity pulse on the facets, gated past ~0.8
  and disabled under `prefers-reduced-motion`.

These rely on `color-mix()`/`calc()` plus standard SVG transforms, gradients, and filters — all
stable evergreen-browser features. The SVG renders **static at the computed openness value** — no
client animation of openness itself (see Known Extensions).

**Artwork note:** the stone, crack, cluster, and ray paths must be authored deliberately to match
the reference's illustrated feel. This is the theme's signature element — budget real iteration
here, comparing against `docs/references/tracker-opening/frame_00N.jpg` at each stage. Building it
in stage layers (sealed / cracking / charging / splitting / blooming) that cross-fade by openness
keeps it tractable.

---

## Data model changes

### Migration: `supabase/migrations/20240106000000_module_crystal_type.sql`
- Add `crystal_type text not null default 'amethyst'` to `modules`.
- Add a check constraint restricting it to the 8 keys above.
- Default `'amethyst'` backfills existing rows; users can change it later via edit.

### Types
- `lib/types.ts`: add `crystal_type: CrystalType` to `Module`; add a `CrystalType` union and
  `CrystalKey` list mirroring `lib/crystals.ts`.

### Reads (openness)
The trackers page (`app/page.tsx`) currently fetches only *today's* entries. It must also
obtain, per module: count of distinct entry-days in the last 30 days, total entry count, and
`created_at` (already on the module).

- Use a **single `GROUP BY module_id` aggregate** query over `entries` (one round trip for all
  of the user's modules), not per-card queries.
- Add an index `entries(user_id, module_id, entry_date)` to keep it cheap.
- Compute `openness` in a small pure helper (e.g. `lib/openness.ts`) that takes the aggregate
  row + module and returns the number — unit-testable in isolation.

---

## Create / edit flows (crystal picker)

A crystal picker — a row of 8 colored gems with labels — is a **required** field (no default in
the UI; the column default only protects legacy rows). It must appear in every module-creation
path:

1. **Manual:** `components/module-builder.tsx` → submits to `app/actions/modules.ts` (`createModule`),
   which must persist `crystal_type`.
2. **Formula:** the formula builder flow (`app/modules/new/formula`) — crystal still chosen even
   though the card renders fully open.
3. **AI assistant:** the module proposal card (`components/assistant/module-proposal-card.tsx`)
   gains a crystal picker before the user confirms creation; the create action persists it.
4. **Edit:** existing module edit pages allow changing the crystal.

The picker is a small reusable component reading from `lib/crystals.ts`.

---

## Dark mode wiring

`app/globals.css` already defines a `.dark` block, but **no `.dark` class is ever applied**
(no theme provider, no toggle) — so dark tokens are currently dormant.

To make it system-aware **without adding a dependency** (per the "ask before adding
dependencies" convention): apply the dark tokens via `@media (prefers-color-scheme: dark)`
in `globals.css` (mirror the existing `.dark` values onto `:root` inside the media query, or
restructure so both the media query and the `.dark` class share the same token block).

`next-themes` (for a manual toggle) is noted as a future option but is out of scope here.

---

## Performance

Openness is **computed on read, not cached.** Rationale: openness depends on *today's date*
(the 30-day window slides; `days_since_created` grows daily), so a stored value would be wrong
the next morning even with zero writes — correct caching would require both write-invalidation
**and** a daily recompute job. The avoided cost is a single indexed aggregate over a few hundred
rows (sub-millisecond at this scale: tens of users, a handful of trackers each). Compute-on-read
is simpler and always correct. The `GROUP BY` + index above is the scalability story if
trackers-per-user ever grows.

---

## Testing

- **`lib/openness.ts`** — pure-function unit tests: zero recent activity ⇒ 0; momentum
  multiplier; cap at 1; `days_since_created < 1` guard; formula module ⇒ 1.
- **`lib/crystals.ts`** — every `CrystalType` has a name, primary, and glow; keys match the DB
  check constraint and the TS union (guards against drift).
- **Card / `<GeodeIcon>` rendering** — given an openness value and crystal type, the correct
  CSS variables and crystal gradient stops are emitted; status pill reflects `hasEntryToday`.
- **Typecheck / lint / build** per the project Definition of Done.

---

## Known extensions (out of scope)

- Animated openness transitions: would require registering `--openness` via `@property` as
  `<number>` so CSS can interpolate it. Static render needs nothing special.
- Manual light/dark toggle via `next-themes`.
- Per-crystal distinct *shell silhouettes* (shell geometry is shared in v1; only crystal color
  and optional facet accents vary).
- "Skipped today" pill variant.

---

## Affected files (reference)

- `app/globals.css` — palette overhaul + dark-mode media query
- `lib/crystals.ts` *(new)* — crystal source of truth (key → name, primary, glow, optional facet accents)
- `components/geode-icon.tsx` *(new)* — shared SVG geode (parametric on `--openness`, color per crystal)
- `lib/openness.ts` *(new)* — openness computation
- `lib/types.ts` — `CrystalType`, `Module.crystal_type`
- `supabase/migrations/20240106000000_module_crystal_type.sql` *(new)*
- `components/tracker-card.tsx` — geode surface, glow, status pill (replaces red/green border)
- `app/page.tsx` — aggregate entries query + openness computation
- `components/module-builder.tsx`, `app/actions/modules.ts` — crystal picker + persistence
- `components/assistant/module-proposal-card.tsx` — crystal picker in AI flow
- Formula create/edit + module edit pages — crystal picker
- `components/crystal-picker.tsx` *(new)* — reusable picker
