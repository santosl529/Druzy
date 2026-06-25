-- Card summary: a per-tracker choice of which single value shows on its
-- dashboard card (field + aggregation mode + time window). Computed on read
-- in app code; nothing is stored beyond this declarative config.
--
-- Nullable: when null, the card falls back to a sensible auto-derived summary
-- (first numeric field summed over today, or done/not-done for a single boolean).
alter table public.modules
  add column if not exists card_config jsonb;

comment on column public.modules.card_config is
  'Optional { field, mode, timeWindow } describing the card summary value. Null = auto-derived default.';
