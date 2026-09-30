-- Wrap auth.uid() in a subselect in every owner policy so Postgres evaluates
-- it once per statement (initPlan) instead of once per row. Also scope the
-- policies to `authenticated`: anon never matched them anyway (auth.uid() is
-- null), so access is unchanged. For `for all` policies without WITH CHECK,
-- USING doubles as the check, so writes stay owner-only.
alter policy "owner_all" on public.profiles
  to authenticated using (id = (select auth.uid()));

alter policy "owner_all" on public.modules
  to authenticated using (user_id = (select auth.uid()));

alter policy "owner_all" on public.entries
  to authenticated using (user_id = (select auth.uid()));

alter policy "owner_all" on public.food_entries
  to authenticated using (user_id = (select auth.uid()));

alter policy "owner_all" on public.assets
  to authenticated using (user_id = (select auth.uid()));

alter policy "owner_all" on public.charts
  to authenticated using (user_id = (select auth.uid()));

alter policy "owner_all" on public.journal_templates
  to authenticated using (user_id = (select auth.uid()));

alter policy "owner_all" on public.journal_entries
  to authenticated using (user_id = (select auth.uid()));
