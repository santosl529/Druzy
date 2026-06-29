-- Consistency grid config: how each tracker appears in the /dashboard grid.
-- mode 'binary'   → cell = did an entry exist? (or boolean field = true)
-- mode 'goal'     → cell = all conditions met?
-- mode 'gradient' → crystal scales in size/glow with the day's value
-- Null = auto-default: binary for standard modules, gradient for formula modules.
alter table public.modules
  add column if not exists dashboard_config jsonb;

comment on column public.modules.dashboard_config is
  'Consistency grid config: { mode, goal?, gradientField?, gradientRange? }. Null = auto-default.';
