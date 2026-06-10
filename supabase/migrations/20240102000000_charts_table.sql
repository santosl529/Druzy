-- ============================================================
-- Druzy — migration: charts as a first-class table
-- Moves chart config out of modules.chart_config into charts rows.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Create charts table
-- ----------------------------------------------------------------
create table public.charts (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references public.modules(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  config     jsonb not null default '{}',
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create index charts_module_id_idx on public.charts (module_id);
create index charts_user_id_idx   on public.charts (user_id);

alter table public.charts enable row level security;

create policy "owner_all" on public.charts
  for all using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- 2. Migrate existing chart_config rows into charts
--    Shape: old { chartType, xField, yField, fillForward }
--           new { chartType, series:[{moduleId, field}], fillForward, ... }
-- ----------------------------------------------------------------
insert into public.charts (module_id, user_id, config, position, created_at)
select
  m.id as module_id,
  m.user_id,
  jsonb_build_object(
    'chartType',   coalesce(m.chart_config->>'chartType', 'line'),
    'title',       null,
    'series',      jsonb_build_array(
                     jsonb_build_object(
                       'moduleId', m.id::text,
                       'field',    coalesce(m.chart_config->>'yField', '')
                     )
                   ),
    'fillForward', (m.chart_config->>'fillForward')::boolean,
    'xLabel',      m.chart_config->>'xField'
  ) as config,
  0 as position,
  now() as created_at
from public.modules m
where m.chart_config is not null
  and m.chart_config::text != '{}'
  and m.chart_config->>'chartType' is not null;

-- ----------------------------------------------------------------
-- 3. Drop chart_config from modules
-- ----------------------------------------------------------------
alter table public.modules drop column if exists chart_config;
