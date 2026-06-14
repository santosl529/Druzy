# Druzy — Product Requirements Document

**Version:** 2.1 (MVP)
**Status:** Draft — keep current as decisions change during the build
**Audience:** AI coding agent (Claude Code) + the builder

---

## 1. Overview

**Druzy** is a self-hostable web app for logging and visualizing arbitrary aspects of personal life — experiences, skills practiced, health metrics, scores, gratitude, anything. The defining idea is that the user describes a tracker in plain language and an AI assistant turns it into a structured, chartable "module." Two specialized AI capture features round it out: food-photo calorie estimation and handwritten-journal transcription.

(The name refers to *druzy* — a surface of many tiny crystals that accumulate over time. It's the visual/aesthetic identity; the crystal theme informs the icon and palette, not the feature set. Note: an unrelated product at druzy.app exists; acceptable because this is a personal tool, not a public launch.)

**Core thesis / differentiator:** One consistent data shape underlies every tracker, so the user (or their non-technical friends) can spin up a brand-new tracker by *describing* it — no developer, no hardcoding — and get forms, storage, and analytics for free. The AI's job is **unstructured intent → structure**, not picking from menus. Existing tools either have rigid predefined trackers (most habit apps) or are flexible but generic and manual (Notion/Airtable). Druzy is flexible *and* conversational *and* analytics-first.

**Scale:** Designed for the builder plus a handful of friends — **tens of users, not thousands.** Optimize for clarity, iterability, and correctness over scalability. Prefer simple, verifiable approaches over clever infrastructure.

**What this PRD covers:** the full MVP. Deferred ambitions (runtime chart code-generation, richer charting, mobile app, social/comparison features) are listed in Out of Scope.

---

## 2. Tech Stack

- **Framework:** Next.js 15 (App Router), React, TypeScript (strict).
- **Language/validation:** TypeScript end to end; **Zod** schemas shared between AI tool outputs and DB-facing types.
- **Database / auth / storage:** Supabase — Postgres with Row Level Security, Supabase Auth, Supabase Storage (for photos).
- **Styling/UI:** Tailwind CSS + shadcn/ui + Lucide icons. **Function over form for the MVP** — use shadcn defaults; no custom design system yet.
- **Charts:** Recharts for v1. (D3/visx is the escape hatch if a specific chart proves limiting — not a v1 dependency.)
- **AI assistant layer:** **Vercel AI SDK 6** — `useChat` for the chat surface, tool calling with Zod input schemas, generative UI for rendering tool results as components. This is the primary *new* tool to learn; keep new-tooling concentrated here. **Provider:** OpenRouter (`@ai-sdk/openai` with `baseURL: 'https://openrouter.ai/api/v1'`); model configured in `lib/ai/config.ts` (currently `anthropic/claude-sonnet-4-5`). Swap model by changing one string; swap provider by changing the import.
- **Food vision:** a cloud vision model (e.g. Claude or GPT vision) via API.
- **Journal vision:** a **local** model via Ollama (or equivalent) — runs on the user's machine.
- **Hosting:** Vercel + Supabase cloud (journal transcription stays local regardless).

**Libraries / approaches to avoid:**
- No `localStorage`/`sessionStorage` for source-of-truth data — Postgres is the store.
- Don't reach for LangChain or heavy agent frameworks; the AI SDK covers what's needed.
- Don't let the LLM do arithmetic over datasets (see §6) — compute in app code.

**Design philosophy:** Build the parts that work *without* AI first, then layer AI on top. If the data model is wrong, everything above it is wrong.

---

## 3. User Roles

Two roles; flat and simple for this scale.

- **User** — the default. Can create/edit/delete their own modules and entries, use the assistant, view their own analytics, upload photos for food/journal capture. Sees only their own data.
- **Admin** (the builder) — everything a User can do. No special in-app powers required for MVP; admin status (if needed for debugging/maintenance) is set directly in the DB, not via a signup flow.

No team/shared-ownership relationships in MVP. Each user's data is fully siloed. (Friend-to-friend *comparison/sharing* is explicitly out of scope — see §10.)

---

## 4. Authentication & Onboarding

- **Signup:** open email/password (or magic link) via Supabase Auth. Low volume, so no invite gating required — but keep it simple to add later.
- **Post-login landing:** the user's dashboard (list of their modules + recent activity). Empty state for new users: a prompt to create their first tracker, with both the "describe it to the assistant" path and a "build it manually" path visible.
- **Session handling:** Supabase session; **server-side route protection** on all authenticated routes and all API/route handlers. No client-only gating.
- **No linking flows** between users in MVP.

---

## 5. Page / Screen Specifications

Behavioral specs — visual/component choices are the agent's. Core unless marked.

### 5.1 Trackers `/`
- **Purpose:** home; list of the user's trackers.
- **Elements/actions:** grid of module cards; entry points to create a new module (assistant or manual); quick link into each module.
- **Empty state:** new-user prompt to create a first tracker.

### 5.2a Dashboard `/dashboard`
- **Purpose:** all charts across all modules in one view.
- **Elements/actions:** 2-column grid of every chart the user has created, across all modules; module name shown as context above each chart; no curation — shows everything.
- **Empty state:** prompt to add a chart to a tracker.
- **Note:** Per-dashboard chart curation/arrangement (a separate ordering independent of module ordering) is explicitly out of scope for now — see §10.

### 5.2 Assistant `/assistant` (core) — **`createModule` tool built**
- **Purpose:** the conversational interface — create modules, ask analytics questions, change theme.
- **Elements/actions:** chat UI (AI SDK v6 `useChat`); message list with part-based rendering; when a `createModule` tool call finishes, a `ModuleProposalCard` is rendered inline with editable fields; confirm button calls `createModuleFromProposal` server action and redirects to the new module.
- **Module creation flow:**
  1. User types a natural-language description (e.g. "track my saxophone practice").
  2. `/api/chat` receives `UIMessage[]`, converts via `convertToModelMessages`, and calls `streamText` with the `createModule` tool.
  3. Tool `execute` runs strict `moduleSchema.safeParse`; returns `{ success: true, proposal }` or `{ success: false, error }`.
  4. `maxSteps: 3` lets the model read a validation error and retry (capped at 2 retries).
  5. On success, `ModuleProposalCard` renders with the proposed name and fields — all editable (label, key, type, unit, required, select options).
  6. "Create tracker" calls `createModuleFromProposal(name, fields)` → re-validates server-side → inserts + `createDefaultChart` → returns `{ id }` → client redirects to `/modules/[id]`.
  7. "Discard" button sets a discarded state on the card; the user types a new description.
- **Never save a module without explicit confirmation.**
- **Context injection (built):** every `/api/chat` request fetches the user's existing modules (id, name, kind, field keys/types/units) and injects them into the system prompt. All tools can reference existing trackers by UUID.
- **`createFormulaModule` tool (built):** AI proposes a formula tracker referencing existing modules by UUID. Tool execute validates moduleId/field/expression server-side. `FormulaProposalCard` shows editable alias, defaultValue, and expression; confirm calls `createFormulaModuleFromProposal`.
- **`proposeChart` tool (built):** when the user asks to see or visualize data, the AI calls `proposeChart` instead of giving text instructions. Tool execute fetches the user's entries, runs `getMultiSeriesData`, and returns the computed data. `ChartProposalCard` renders a live Recharts preview with actual data; "Add to tracker" dropdown; one-click "Add chart" calls `addChartFromProposal`. Supports chartType (line/bar/area), multi-series, bucketBy, aggregation, dual y-axes.
- **`queryAnalytics` tool (built):** when the user asks a question about their data (averages, trends, correlations, streaks), the AI calls `queryAnalytics`. Tool execute fetches entries server-side, computes the statistic in TypeScript (never sends raw rows to the LLM), and returns structured aggregates. `AnalyticsInsightCard` renders the numbers inline; the LLM narrates in text. Supports four operations: `summary` (count/avg/min/max/total/stdDev), `trend` (direction, % change, slope), `correlation` (Pearson r between two numeric fields across modules), `streak` (current and longest consecutive-day streak).
- **Not yet built:** `updateTheme`.

### 5.3 Module detail `/modules/[id]` (core)
- **Purpose:** view/log/analyze one tracker.
- **Elements/actions:** auto-generated entry form; entry history table with inline edit (pencil) and delete (confirm dialog) per row; all of the module's charts rendered in `position` order; drag-to-reorder charts; add/edit/delete individual charts; edit-module affordance (add/rename/remove fields); delete-module button (preflight warns about formula/chart dependents before confirming).
- **Chart routes:** `/modules/[id]/charts/new` (add chart), `/modules/[id]/charts/[chartId]/edit` (edit chart).
- **Edit routes:** `/modules/[id]/edit` (standard trackers), `/modules/[id]/edit/formula` (formula trackers). The standard route redirects formula modules to their dedicated route.
- **Default chart:** auto-created when a module is saved — `line` if numeric fields exist, `list` if text/select fields exist, `table` otherwise.
- **Edge cases:** module with no entries yet (chart shows empty state); field added after entries exist (older entries simply lack that key).
- **Delete dependency warnings:** before deleting a module, the UI runs a preflight that identifies (a) formula trackers that reference the deleted module as an input and (b) charts in other modules whose series point at the deleted module. Both are surfaced in the confirm dialog. The deletes themselves cascade at the DB level (entries + this module's charts); the dangling cross-module references are not auto-cleaned (they degrade silently to empty series).

### 5.4 Manual module builder `/modules/new` (core)
- **Purpose:** create/edit a module's field schema without the assistant (fallback + editing).
- **Elements/actions:** add fields (key, label, type, required, options for selects, unit for number/rating fields). Chart config is managed separately via the charts UI, not here.

### 5.5 Food / nutrition `/food` (core, specialized)
- **Purpose:** daily macro tracking via photo or manual entry.
- **Elements/actions:** photo upload/capture → cloud vision estimates calories/protein/fat/carbs → **editable** result → save; manual entry of macros; daily totals view (calories, protein, fat, carbs); history by day.
- **Non-negotiable UX:** estimates are framed as approximate and are editable before saving. Never save AI estimates silently.

### 5.6 Journal `/journal` (core, specialized)
- **Purpose:** transcribe handwritten entries locally and extract structured fields.
- **Elements/actions:** upload journal photo(s) → **local** model transcribes + extracts (weight, calories, protein, gratitude) → review/edit → save into the relevant modules.
- **Edge case / fallback:** if local transcription quality is poor, fall back to manual entry with the photo attached (see §11).

### 5.7 Settings `/settings`
- **Purpose:** account, date/time config, data/privacy disclosure.
- **Elements/actions:** theme selection (also changeable via assistant); day-boundary timezone selector (IANA timezone, saved to profile); a clear plain-language statement of what data goes where (see §8).

---

## 6. Core Logic / Algorithms

### 6.1 The module abstraction (the heart of the product)
Every tracker is a module with a consistent shape; every logged row is an entry keyed to that module's fields. Because the shape is uniform, the entry form, storage, and charts are all **generic** — written once, working for any module.

Field types (fixed enum): `text`, `number`, `date`, `rating`, `boolean`, `select`, `photo`.

### 6.2 AI module creation (intent → schema) — **built**
```
on user description:
  POST /api/chat  ← UIMessage[] (AI SDK v6 wire format)
  convertToModelMessages(messages) → streamText + createModule tool
  tool execute:
    run moduleSchema.safeParse({ name, fields })
    if invalid → return { success: false, error }
      → LLM reads error, retries (maxSteps: 3; cap 2 retries)
    if valid   → return { success: true, proposal: { name, fields } }
  stream toUIMessageStreamResponse()
  client renders ModuleProposalCard (editable)
  on explicit confirm:
    createModuleFromProposal(name, fields)  ← server action
    re-validates server-side (never trust client)
    insert module + createDefaultChart
    return { id } → client redirect to /modules/[id]
```
The LLM only ever emits the ModuleSchema shape; Zod is the gate on both the API route (tool execute) and the server action (createModuleFromProposal). No free-form code generation.

**Model config:** `lib/ai/config.ts` — currently `openrouter('anthropic/claude-sonnet-4-5')` via OpenRouter. Swap model by editing one string; swap provider by changing the import. Env var: `OPENROUTER_API_KEY`.

### 6.3 Cross-module analytics (compute in code, AI narrates)
```
on analytics question:
  LLM (tool `queryAnalytics`) maps the question to:
    - which module(s)/field(s)
    - which operation (trend, average, correlation, count, ...)
  APP CODE fetches the relevant rows (server-side) and computes the statistic
    (correlation coefficient, moving average, totals, etc.) in TypeScript
  the computed numeric result (NOT the raw rows) is passed back to the LLM
  LLM narrates the result into a readable insight
  render insight + an appropriate chart of the computed data
```
**Why:** LLMs are unreliable at arithmetic over many data points, and sending raw rows is needless data exposure. Computing in code is more accurate, cheaper, and more private. Charts are chosen from the fixed library, not invented.

### 6.4 Food estimation
```
on food photo:
  send image to cloud vision model with a structured-output prompt
  receive {calories, protein, fat, carbs} (+ confidence/notes if available)
  present as an EDITABLE form, never auto-save
  on save -> write a food entry for the current day
```

### 6.5 Journal transcription
```
on journal photo (LOCAL ONLY):
  run local model to transcribe text
  extract structured fields (weight, calories, protein, gratitude) from the text
  present transcription + extracted fields for review/edit
  on save -> write to the relevant modules
  image and text are processed locally; nothing sent to any third party
```

Where logic must run: module persistence, analytics computation, and all ownership checks are **server-side**. Journal transcription runs **locally** by requirement.

---

## 7. Data Model

Conventions: UUID primary keys; `timestamptz` for times; `jsonb` for flexible/variable shapes; **RLS enabled on every table, default-deny, owner-scoped.**

### `profiles`
- `id` uuid PK (matches Supabase auth user id)
- `display_name` text
- `theme` text — current theme id (default `'druzy-default'`)
- `is_admin` boolean default false
- `day_boundary_tz` text nullable — IANA timezone string (e.g. `'America/New_York'`). Null = unset; the UI defaults to the browser-detected timezone. Governs which calendar day a "now" entry is attributed to. **Per-tracker override:** a `day_boundary_tz` column on `modules` (same IANA string, null = inherit profile) can be added later without migrating this table.
- `created_at` timestamptz

### `modules`
- `id` uuid PK
- `user_id` uuid FK → profiles.id (indexed)
- `name` text
- `fields` jsonb — array of `{ key, label, type, required, options? }`; `type` ∈ the field-type enum (§9)
- `is_builtin` boolean default false — true for the food module (bespoke handling)
- `created_at` timestamptz
- Index on `user_id`.
- **Note:** `chart_config` was removed in v2.1; charts are now a separate `charts` table.

### `charts`
- `id` uuid PK
- `module_id` uuid FK → modules.id (indexed; cascade delete)
- `user_id` uuid FK → profiles.id (indexed; denormalized for clean RLS)
- `config` jsonb — the chart config (see §9 for full field list)
- `position` int — ordering within a module's chart list (0-indexed)
- `created_at` timestamptz
- Indexes on `module_id`, `user_id`.
- RLS: owner-scoped, default-deny.

### `entries`
- `id` uuid PK
- `module_id` uuid FK → modules.id (indexed)
- `user_id` uuid FK → profiles.id (indexed; denormalized for clean RLS)
- `values` jsonb — `{ [field_key]: value }`
- `entry_date` date — **the day the entry is *for*** (the day the thing happened, set by the client using the user's local date). `created_at` is never used for day attribution — it is only used as a tiebreaker for display sort order when two entries share the same `entry_date`. This ensures logging late (doing something on 5/16 but entering it on 5/17) correctly attributes the entry to 5/16. All chart bucketing, aggregation, daily totals, and streak computation read `entry_date` exclusively.
- `created_at` timestamptz
- Indexes on `module_id`, `user_id`, `entry_date`.

### `food_entries` (or a built-in module instance — implementer's choice; if a table, spec below)
- `id` uuid PK
- `user_id` uuid FK → profiles.id (indexed)
- `entry_date` date (indexed)
- `calories` numeric, `protein_g` numeric, `fat_g` numeric, `carbs_g` numeric
- `source` text — `'photo'` | `'manual'`
- `photo_path` text nullable — Supabase Storage path
- `created_at` timestamptz

*(If food is modeled as a built-in module + entries instead of its own table, keep the same fields inside `values` and set `modules.is_builtin = true`. Either is acceptable; pick one and be consistent.)*

### `assets`
- `id` uuid PK
- `user_id` uuid FK → profiles.id
- `path` text — Supabase Storage path
- `kind` text — `'food_photo'` | `'journal_photo'` | `'entry_photo'`
- `created_at` timestamptz

**Schema-ready, present-but-unused (for clearly-anticipated needs only):**
- `modules.shared` boolean default false — reserved for a future sharing feature; **not used in MVP** (do not build sharing logic now).

**RLS:** every table — a row is readable/writable only when `user_id = auth.uid()` (for `profiles`, `id = auth.uid()`). Default-deny; no public read.

---

## 8. Security / Non-Negotiables

- **RLS on every table from day one**, owner-scoped, default-deny. This is the primary protection for a multi-user app — get it right before building features on top.
- **Journal content never leaves the device** — transcription is local-only. Hard requirement.
- **Analytics sends computed aggregates to the LLM, not raw rows** wherever feasible (§6.3).
- **Module creation and theming send only intent/schema** — no personal logged values.
- **Food data** is sent to a cloud vision provider; this is the one accepted third-party data flow, justified by low sensitivity and disclosed to the user.
- **Provider terms:** use API-tier providers that do not train on inputs; verify current terms before sending real data; prefer zero-retention if offered.
- **Server-side ownership checks** on every mutating route — never trust the client for `user_id`.
- **Transparency:** a plain-language "what data goes where" statement in Settings. The trust-killer is users discovering data flows later; disclose up front.

---

## 9. Domain Data / Taxonomies

**Field types** (for `modules.fields[].type`):
`text`, `number`, `date`, `rating`, `boolean`, `select`, `photo`

**Number/rating field extras** (optional per-field metadata):
- `unit` — string, max 20 chars (e.g. `"lbs"`, `"kcal"`, `"min"`). Displayed alongside values in entry lists (`"154 lbs"`), as a suffix label in the entry form, and auto-appended to Y-axis labels on charts when `config.yLabel` is not explicitly set. Validated by Zod. Has no effect on non-numeric fields.

**Chart types** (for `charts.config.chartType`) — fixed library for MVP:
`line`, `bar`, `area`, `scatter`, `pie`, `heatmap`, `calendar-heatmap`, `histogram`, `stacked-bar`, `number-stat`, `table`, `list`

- `list` renders a formatted list of field values (e.g. "songs I've memorized"). Uses `displayField` + optional `secondaryField` instead of axis fields. Ignores time/axis config.

**Chart config fields** (`charts.config` jsonb) — declarative; all computation runs in app code:

| Field | Type | Notes |
|---|---|---|
| `chartType` | ChartType | required |
| `title` | string? | optional display title |
| `series` | `{moduleId, field, label?, color?, yAxis?}[]` | data sources; supports multiple series across modules; `yAxis:'right'` enables dual-axis |
| `bucketBy` | `none\|day\|week\|month\|year` | group time axis; default `none` |
| `aggregation` | `none\|sum\|avg\|count\|min\|max\|median` | combine values in a bucket; default `none` |
| `dateRange` | `{type:'all'\|'last_n_days'\|'custom', n?, start?, end?}` | filter entries by date |
| `filters` | `{field, op, value}[]` | row-level filters; op ∈ `eq\|neq\|gt\|gte\|lt\|lte\|contains` |
| `sort` | `{field, direction:'asc'\|'desc'}` | used by `list` and `table` types |
| `xLabel` / `yLabel` | string? | axis labels |
| `yRightLabel` | string? | label for the right Y-axis (dual-axis charts) |
| `yAxisMin` | number? | override: left Y-axis lower bound |
| `yAxisMax` | number? | override: left Y-axis upper bound |
| `yRightAxisMin` | number? | override: right Y-axis lower bound (dual-axis) |
| `yRightAxisMax` | number? | override: right Y-axis upper bound (dual-axis) |
| `zeroBaseline` | bool? | override default baseline behavior (see below) |
| `stacked` | bool? | for stacked-bar |
| `showPoints` | bool? | for line/area/scatter |
| `showGrid` | bool? | default true |
| `showLegend` | bool? | default false for single series |
| `fillForward` | bool? | carry last value to days with no entry (line/bar/area) |
| `referenceLines` | `{value, label?, color?}[]` | horizontal reference lines |
| `displayField` | string? | `list` type: primary field to display |
| `secondaryField` | string? | `list` type: optional secondary field |

**Y-axis auto-scaling (type-driven defaults):**
- `bar` / `area` → zero-baseline: lower bound fixed at 0, upper bound auto. The filled area / bar height encodes magnitude; a non-zero lower bound is misleading.
- `line` / `scatter` → fit-to-data: bounds computed from the data's actual min/max with ~10 % headroom, then snapped outward to nice round tick values. Preserves readability for narrow-range data (e.g. body weight 150–160).
- Edge cases (no data, single point, all-identical values) fall back to a ±1 range around the value so the axis is never degenerate.
- Empty / null buckets in aggregated data remain `null` — they are rendered as gaps, not zeros, so they don't distort the scale or the line.
- For dual-axis charts, auto-scaling is applied **independently** to the left and right axes.
- **Manual overrides** (`yAxisMin`, `yAxisMax`, `zeroBaseline`) always take precedence over the automatic behavior. `zeroBaseline=true` forces zero-baseline on any chart type; `zeroBaseline=false` suppresses it on bar/area (use fit-to-data instead). Omit all three for the type-driven default.

**Design invariant:** chart config is purely declarative. No SQL, no JS expressions. All transforms (bucketing, aggregation, fill-forward) are computed in app code (`lib/chart-data.ts`), not stored in config.

**Food macros** (fixed fields): `calories`, `protein_g`, `fat_g`, `carbs_g`

**Journal extraction fields** (fixed for MVP): `weight`, `calories`, `protein`, `gratitude`

**Asset kinds:** `food_photo`, `journal_photo`, `entry_photo`

**Theme ids:** `druzy-default` (others may be added; assistant's `updateTheme` must validate against the known set).

---

## 10. Out of Scope (deliberately NOT built in MVP)

If a task drifts into any of these, **stop and confirm** before proceeding.

- **Runtime code-generation of novel chart types.** Charts come only from the fixed enum in §9. No executing AI-generated component code (and therefore no sandboxing work).
- ~~**Multi-module charts.**~~ **Built.** Multi-series charts across modules are active. Line, bar, and area charts support 2+ series from different modules, joined by date, with optional dual Y-axes.
- **Curated/saved custom dashboards.** `/dashboard` shows all charts in a flat grid. A "My Dashboard" with per-user curation, arrangement, or a separate ordering join table is future work.
- **Social / sharing / comparison between friends.** Each user is siloed. (`modules.shared` column exists but stays unused.)
- **Polished/custom UI design.** shadcn defaults only.
- **Mobile/native app.** Responsive web is enough.
- **Offline support.**
- **Richer charting via D3/visx.** Recharts only unless explicitly revisited.
- **Auto-generating modules without user confirmation.** Always review-then-confirm.
- **LLM-side arithmetic over datasets.** Compute in app code.
- **Hardcoding bespoke trackers beyond food.** Everything else goes through the generic module path.

---

## 11. Open Questions (decided during the build)

- **Local transcription accuracy** — the biggest unknown. Test against the builder's real handwriting early; if quality is too low, ship the manual-entry-with-photo fallback instead of leaning on transcription. Decide which local model after a quick bake-off.
- **Food modeling** — ~~decided~~: dedicated `food_entries` table (not a built-in module). Fixed columns (calories, protein_g, fat_g, carbs_g) and dedicated daily-total queries.
- **Exact cloud vision provider** for food, and exact theme palette(s) — deferred.
- **Whether the AI assistant is worth its complexity for any given surface** — validate as you go; for chart-picking specifically, a plain UI may beat the assistant. Don't over-invest in AI where a menu is better.

---

## 12. Build Order

Each step shippable and testable before the next. **Resist building schema/features for out-of-scope or future-phase items.**

1. **Foundation** — Next.js + TypeScript + Supabase; auth; **RLS on every table from the start**; authenticated app shell (login → empty dashboard).
2. **Module abstraction, no AI** — `modules` + `entries` tables; manual module builder; generic entry form from the field schema; view entries; full CRUD. *This proves the core data model — don't proceed until it feels right.*
3. **Charts** — `charts` table; multiple charts per module; drag-to-reorder; `/dashboard` all-charts view; full chart config (bucketBy, aggregation, dateRange, fillForward, referenceLines, list type, etc.).
4. **AI assistant layer** — Vercel AI SDK 6; `createModule` **built**, `createFormulaModule` **built**, `proposeChart` **built** (live preview + one-click add), context injection **built**, `queryAnalytics` **built** (summary/trend/correlation/streak, computed in app code); `updateTheme` **not yet built**.
5. **Food calorie tracking** — cloud vision → editable macros → save; manual path; daily totals.
6. **Journal transcription** — local model; photo → transcribe + extract → review → save; **test on real handwriting early**, with manual fallback ready.

After step 2 especially: stop and actually use the manual version before adding AI on top.

---

## Keeping this PRD current

Treat this document as the source of truth. When a decision changes mid-build (e.g. the food modeling choice, or dropping transcription for the fallback), **update the relevant section before the next coding task touches it** — a stale spec actively pulls the coding agent toward the old design. Consider a short companion "decisions log" capturing the *why* behind non-obvious choices (compute-in-code analytics, local-only journals, fixed chart library) so they aren't re-litigated later.