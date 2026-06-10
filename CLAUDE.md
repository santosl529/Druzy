# Druzy

## What this is
Druzy is a self-hostable web app for logging and visualizing arbitrary aspects of personal life — experiences, skills practiced, health metrics, scores, gratitude, anything. The defining idea: a user describes a tracker in plain language and an AI assistant turns it into a structured, chartable "module." Two specialized AI capture features round it out: food-photo calorie estimation and handwritten-journal transcription (local model, never leaves the device). Designed for the builder plus a handful of friends — tens of users, not thousands. Currently pre-code / MVP phase.

## Stack
- **Framework:** Next.js 15 (App Router), React, TypeScript (strict)
- **Validation:** Zod — shared between AI tool outputs and DB-facing types
- **Database / auth / storage:** Supabase (Postgres + RLS, Supabase Auth, Supabase Storage)
- **Styling/UI:** Tailwind CSS + shadcn/ui + Lucide icons (shadcn defaults, no custom design system)
- **Charts:** Recharts
- **AI layer:** Vercel AI SDK 6 — `useChat`, tool calling with Zod schemas, generative UI
- **Food vision:** cloud vision model (Claude or GPT vision) via API
- **Journal vision:** local model via Ollama — runs on user's machine, never sends data to cloud
- **Hosting:** Vercel + Supabase cloud

## Commands
```
npm run dev    # start dev server
npm run build  # production build
npm run lint   # ESLint
npx tsc --noEmit  # typecheck
```

## Project structure
```
app/
  actions/       # server actions (auth.ts, …)
  login/         # login/signup page
  page.tsx       # dashboard (protected)
  layout.tsx     # root layout
components/
  nav.tsx        # top nav
  ui/            # shadcn components
lib/
  supabase/
    client.ts    # browser client
    server.ts    # server client (SSR)
  utils.ts       # cn() helper
middleware.ts    # session refresh + route protection
supabase/
  migrations/    # SQL migrations (run in Supabase dashboard or CLI)
```

## Conventions
- Match existing code style
- Ask before adding dependencies
- For product spec, see @docs/prd.md. Read the relevant sections when working on related features; don't read the whole thing for small changes.
- If we establish a new convention or hit a non-obvious gotcha, suggest a CLAUDE.md edit — but don't edit it unless I confirm.
## Secrets
- Never read .env.local or any .env.* file with real values.
- Refer to .env.example for required environment variables.
- If you need an env var's value, ask me.

## Definition of done
- Typecheck passes
- Tests pass
- Lint passes