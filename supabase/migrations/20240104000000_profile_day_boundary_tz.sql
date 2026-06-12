-- ================================================================
-- Add day_boundary_tz to profiles
-- ================================================================
-- Stores the user's IANA timezone (e.g. 'America/New_York', 'Europe/Rome').
-- NULL means unset; the UI defaults to the browser-detected timezone and
-- prompts the user to save it.  When non-NULL, this is the timezone used to
-- determine which calendar day a "now" entry belongs to.
--
-- Per-tracker override: a `day_boundary_tz` column can be added to `modules`
-- later following this exact same pattern (IANA string, NULL = inherit from
-- profile).  No schema change to `profiles` will be required at that point.
-- ================================================================

alter table public.profiles
  add column if not exists day_boundary_tz text;
