-- ================================================================
-- Journal: user-configurable extraction templates + journal entries
-- ================================================================
-- Photos are intentionally NOT stored — they stay on the user's device.
-- Only the transcription text and extracted field values are persisted.
-- ================================================================

-- ----------------------------------------------------------------
-- journal_templates — one row per user, upserted on save
-- ----------------------------------------------------------------
create table public.journal_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  fields      jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

alter table public.journal_templates enable row level security;

create policy "owner_all" on public.journal_templates
  for all using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- journal_entries — one row per saved journal entry
-- ----------------------------------------------------------------
create table public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  entry_date    date not null,
  transcription text,
  extracted     jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index journal_entries_user_id_idx    on public.journal_entries (user_id);
create index journal_entries_entry_date_idx on public.journal_entries (entry_date);

alter table public.journal_entries enable row level security;

create policy "owner_all" on public.journal_entries
  for all using (user_id = auth.uid());
