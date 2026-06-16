# Druzy — Progress Log

## Build steps completed (in order)

### 1. Foundation
- Next.js 15 + TypeScript + Supabase auth + middleware route protection
- Login/signup page
- Authenticated app shell (Nav with Trackers / Dashboard / Assistant / Food / Settings)

### 2. Module abstraction (no AI)
- `modules` + `entries` + `charts` + `food_entries` + `assets` tables with full RLS
- Manual module builder (`/modules/new`)
- Generic entry form driven by field schema
- Entry list with inline edit and delete
- Full CRUD for modules and entries

### 3. Charts
- `charts` table (separate from modules)
- Multiple charts per module, drag-to-reorder (`@dnd-kit`)
- `/dashboard` all-charts view
- Full chart config: bucketBy, aggregation, dateRange, fillForward, referenceLines, list type, dual y-axes, etc.
- Chart builder UI (`/modules/[id]/charts/new`, `/modules/[id]/charts/[chartId]/edit`)
- Auto-created default chart on module save
- Delete dependency warnings (formula + chart cross-references)
- Edit routes: `/modules/[id]/edit` (standard), `/modules/[id]/edit/formula` (formula)

### 4. AI assistant layer (Vercel AI SDK 6)
- `/api/chat` with `streamText`, `convertToModelMessages`, `toUIMessageStreamResponse`
- `createModule` tool — proposes schema, renders `ModuleProposalCard` (all fields editable), confirms via `createModuleFromProposal` server action
- `createFormulaModule` tool — proposes formula tracker, renders `FormulaProposalCard`, confirms via `createFormulaModuleFromProposal`
- `proposeChart` tool — fetches real data, computes via `getMultiSeriesData`, renders `ChartProposalCard` with live Recharts preview; one-click "Add chart"
- `queryAnalytics` tool — summary / trend / correlation / streak; computed in TypeScript (not by LLM); renders `AnalyticsInsightCard`
- Context injection: every `/api/chat` request injects user's existing modules (id, name, kind, fields) into system prompt
- Model config: `lib/ai/config.ts` — `chatModel` via OpenRouter (`openrouter/free`), `visionModel` (`anthropic/claude-sonnet-4-5`) for food photo analysis

### 5. Formula modules
- `formula_config` jsonb column on `modules`; `kind` column (`standard` | `formula`)
- Formula builder UI with alias + expression editor; sandboxed evaluator (`lib/formula.ts`)
- Formula summary component; formula modules computed on read, never logged directly

### 6. Bulk import
- CSV import wizard at `/modules/[id]/import`
- Column mapping UI, date-column detection, field-mapping with type preview
- Server action validates and bulk-inserts up to 5 000 rows

### 7. Settings
- Timezone picker (IANA) saved to `profiles.day_boundary_tz`
- Data & privacy disclosure section

### 8. Food calorie tracking (`/food`)
- `/food` page (server component, loads today's entries on first render)
- Day navigation (prev/next with client-side fetch via `/api/food/entries`)
- **Photo flow:** upload or capture → base64 → `/api/food/analyze` → Claude Sonnet vision estimates macros → editable form (never auto-saves) → `createFoodEntry` server action
- **Manual flow:** direct macro entry form
- Daily totals bar (calories / protein / fat / carbs)
- Per-entry inline edit (pencil) and delete
- Server actions: `getFoodEntriesForDate`, `getDailyTotals`, `createFoodEntry`, `updateFoodEntry`, `deleteFoodEntry` in `app/actions/food.ts`
- API routes: `POST /api/food/analyze` (vision), `GET /api/food/entries?date=` (client date nav)
- Types: `FoodEntry`, `DailyTotals`, `MacroEstimate`, `TrackerModule` added to `lib/types.ts`
- Food link added to nav
- **"Also log to tracker"** optional collapsible section on both photo and manual entry forms: select any standard module with numeric fields; values auto-matched from macros by field name (calories/protein/fat/carbs); editable before save; saves food entry + tracker entry atomically via `createEntryInModule` server action

### 10. Context for food photo analysis
- Optional context input added to photo uploader ("this is 22 grams of salmon", "12-inch plate")
- Context injected into Claude vision prompt to refine macro estimates
- Analysis no longer auto-triggers on file select — explicit "Estimate calories" button

### 11. Journal transcription (`/journal`)
- **DB:** `journal_templates` (one per user, `fields jsonb`) and `journal_entries` (`transcription text`, `extracted jsonb`, no photo stored) with owner-scoped RLS — migration `20240105000000_journal.sql`
- **Types:** `JOURNAL_FIELD_TYPES`, `JournalField`, `JournalTemplate`, `JournalEntry` added to `lib/types.ts`
- **Validations:** `journalFieldSchema`, `journalTemplateSchema`, `journalEntrySchema` added to `lib/validations.ts`
- **Ollama browser client** (`lib/ollama.ts`): `getOllamaConfig()`, `buildExtractionSchema(fields)`, `transcribeJournal({images,fields,signal})` — browser calls `localhost:11434` directly, never via Next.js server
- **Server actions** (`app/actions/journal.ts`): `getJournalTemplate`, `saveJournalTemplate`, `getJournalEntries`, `createJournalEntry` (inserts entry + fires `createEntryInModule` per mapped tracker field), `deleteJournalEntry`
- **Template builder** (`/journal/template`): add/remove/reorder fields; label→key auto-fill; type selector (text/list/number); optional extraction instruction; number fields can connect to a tracker module+field
- **Capture + review** (`/journal`): multi-photo picker; "Transcribe" → Ollama; full-transcription textarea (collapsible); per-field review editors (text input / numeric input / add-remove list); "Also log to \<Tracker\>" checkboxes per mapped number field; Re-transcribe; Save / Discard; amber fallback notice on Ollama error
- **History:** collapsible recent-entries list with extracted field values, expandable full transcription, delete with confirm
- **Privacy notice** on journal page; photos never leave the device
- **Nav:** Journal link added after Food
- **`.env.example`:** `NEXT_PUBLIC_OLLAMA_BASE_URL`, `NEXT_PUBLIC_OLLAMA_JOURNAL_MODEL`, `OLLAMA_ORIGINS` instructions documented
- **Default model is `qwen2.5vl`** (changed from `llama3.2-vision`): the `mllama` architecture crashes Ollama's llama.cpp runner ("unknown model architecture: 'mllama'") on multiple Ollama builds incl. 0.30.8. `qwen2.5vl` runs on Ollama's native engine and is stronger at handwriting/OCR. Updated in `lib/ollama.ts`, `.env.example`, and PRD.

## Database migrations (run in Supabase dashboard)
- `20240101000000_initial.sql` — all tables + RLS (includes `food_entries`, `assets`)
- `20240102000000_charts_table.sql` — charts table
- `20240103000000_formula_modules.sql` — `kind` + `formula_config` on modules
- `20240104000000_profile_day_boundary_tz.sql` — `day_boundary_tz` on profiles
- `20240105000000_journal.sql` — `journal_templates` + `journal_entries` tables with RLS

### 9. Two-stage chart aggregation (`dailyAggregation`)
- New optional `dailyAggregation` field on `ChartConfig` (and schema)
- `getTimeSeries` in `lib/chart-data.ts` now runs in two passes when set: first collapses all entries on the same calendar day using `dailyAggregation`, then applies outer `bucketBy` + `aggregation` on the per-day values
- Enables "weekly average of daily totals" and similar patterns that a single aggregation pass cannot express
- "Per-day rollup" dropdown added to chart builder UI (before "Bucket by"), with helper text
- `proposeChart` AI tool updated: `dailyAggregation` parameter added to schema + system prompt guidance
- Fully backward-compatible: existing charts with no `dailyAggregation` behave identically

### 12. PRD sync (v2.2)
- Updated `docs/prd.md` to reflect all built features:
  - §2 / §6.2: model config corrected to `openrouter/free` (both `chatModel` and `visionModel`)
  - §5.5 Food: added context input, explicit "Estimate calories" button, "Also log to tracker" feature
  - §11: cloud vision provider marked as decided
  - §12 Build Order: all steps marked **built**; added formula modules (step 5), two-stage aggregation (step 6), bulk import (step 7), settings (step 8); renumbered food → 9, journal → 10

### 13. Tracker status indicators
- Tracker cards on the home page (`/`) now show green (entry exists today) or red (no entry today) via border color + colored dot; formula trackers show no color since they can't be logged manually
- "Mark done" button appears on hover for red trackers; inserts a blank entry (`values: {}`) for today without navigating away
- New `markGreenForToday(moduleId, entryDate)` server action in `app/actions/entries.ts`: takes the client-supplied date, idempotent (skips insert if entry already exists for that date), revalidates `/` and the module detail path
- New `getTodayEntryStatus(moduleIds, date)` server action for client-side reconciliation of which trackers are done today
- New `components/tracker-card.tsx` client component (uses `useTransition` for pending state); card Link wraps the full card, button is outside the `<a>` tag to avoid invalid nesting; receives the resolved `today` date as a prop
- New `components/tracker-grid.tsx` wraps the cards, reconciles the server date against the client's effective timezone on mount, and updates card colors optimistically when a tracker is marked done (no reload)
- `app/page.tsx` fetches today's entries in a single query (guarded for empty module list) and passes `hasEntryToday` per card

### 14. Project-wide timezone consistency (day-boundary tz)
- New `lib/date.ts` centralizes all "today"/day-boundary logic: `todayInTimezone(tz)`, `clientEffectiveTimezone(savedTz)` (saved setting, else browser tz), `clientToday(savedTz)`, `daysAgoInTimezone(n, tz)`
- The single source of truth for which calendar day a "now" event belongs to is `profiles.day_boundary_tz` (from Settings); when unset, the client falls back to the browser tz and the server to UTC
- **Bug fixed:** food page computed "today" server-side in UTC, so photo/manual entries near midnight were logged to the wrong day. Food page now resolves today via the saved tz and `FoodLog` reconciles on mount using the client's effective tz (day nav + totals refetch correctly)
- Data-attribution surfaces now use the effective settings tz for their default date: food (`app/food/page.tsx` + `components/food/food-log.tsx`), manual entry form (`components/entry-form.tsx`), journal capture (`components/journal/journal-capture.tsx`), and tracker mark-done
- Chart/analytics "today" windows now honor the settings tz: `lib/chart-data.ts` (`getFilteredEntries`/`getTimeSeries`/`getMultiSeriesData` + all chart-type helpers + `daysAgo` accept a `timezone` param), `lib/analytics.ts` `computeStreak`, `components/charts/calendar-heatmap.tsx` today marker. Timezone is threaded from the pages (`/modules/[id]`, `/dashboard`) → `SortableChartsList` → `ModuleChart`/`ListChart`, and from `app/api/chat/route.ts` (proposeChart + queryAnalytics tools fetch the user's `day_boundary_tz`)
- All `timezone` params default to `'UTC'` for backward compatibility; client chart components resolve unset settings to the browser tz

## Known issues / open items
- `updateTheme` assistant tool not yet built (listed as not-yet-built in PRD §5.2)
- Journal transcription accuracy on real handwriting must be tested manually with Ollama running — cannot be verified in CI
- Do NOT use `llama3.2-vision` (mllama) with the journal feature — it crashes Ollama's llama.cpp runner on current builds. Use `qwen2.5vl` (the new default) or another native-engine vision model.
- Vision model (`anthropic/claude-sonnet-4-5` via OpenRouter) requires `OPENROUTER_API_KEY` to be set with sufficient credits; free-tier key won't work for vision calls
