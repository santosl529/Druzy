-- ================================================================
-- Add binary_module_id to journal_templates
-- ================================================================
-- Allows the user to connect a binary (single-boolean) tracker to the
-- journal capture flow so that saving a journal entry automatically marks
-- that tracker as done in the consistency grid.
-- ================================================================

alter table public.journal_templates
  add column if not exists binary_module_id uuid references public.modules(id) on delete set null;
