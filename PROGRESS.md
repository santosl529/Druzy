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

## Known issues / open items
- `updateTheme` assistant tool not yet built (listed as not-yet-built in PRD §5.2)
- Journal transcription accuracy on real handwriting must be tested manually with Ollama running — cannot be verified in CI
- Do NOT use `llama3.2-vision` (mllama) with the journal feature — it crashes Ollama's llama.cpp runner on current builds. Use `qwen2.5vl` (the new default) or another native-engine vision model.
- Vision model (`anthropic/claude-sonnet-4-5` via OpenRouter) requires `OPENROUTER_API_KEY` to be set with sufficient credits; free-tier key won't work for vision calls
