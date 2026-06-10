-- ============================================================
-- Druzy — initial schema
-- ============================================================

-- ----------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  theme        text not null default 'druzy-default',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "owner_all" on public.profiles
  for all using (id = auth.uid());

-- Auto-create a profile row whenever a new auth user is created
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------
-- modules
-- ----------------------------------------------------------------
create table public.modules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  fields       jsonb not null default '[]',
  chart_config jsonb not null default '{}',
  is_builtin   boolean not null default false,
  shared       boolean not null default false, -- reserved; unused in MVP
  created_at   timestamptz not null default now()
);

create index modules_user_id_idx on public.modules (user_id);

alter table public.modules enable row level security;

create policy "owner_all" on public.modules
  for all using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- entries
-- ----------------------------------------------------------------
create table public.entries (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.modules(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  values      jsonb not null default '{}',
  entry_date  date not null default current_date,
  created_at  timestamptz not null default now()
);

create index entries_module_id_idx on public.entries (module_id);
create index entries_user_id_idx   on public.entries (user_id);
create index entries_entry_date_idx on public.entries (entry_date);

alter table public.entries enable row level security;

create policy "owner_all" on public.entries
  for all using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- food_entries  (dedicated table — own-table approach chosen)
-- ----------------------------------------------------------------
create table public.food_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  entry_date  date not null default current_date,
  calories    numeric,
  protein_g   numeric,
  fat_g       numeric,
  carbs_g     numeric,
  source      text not null check (source in ('photo', 'manual')),
  photo_path  text,
  created_at  timestamptz not null default now()
);

create index food_entries_user_id_idx    on public.food_entries (user_id);
create index food_entries_entry_date_idx on public.food_entries (entry_date);

alter table public.food_entries enable row level security;

create policy "owner_all" on public.food_entries
  for all using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- assets
-- ----------------------------------------------------------------
create table public.assets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  path       text not null,
  kind       text not null check (kind in ('food_photo', 'journal_photo', 'entry_photo')),
  created_at timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "owner_all" on public.assets
  for all using (user_id = auth.uid());
