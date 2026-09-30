-- Lifetime entry count per module for the calling user, aggregated in
-- Postgres so the trackers page can compute openness without a request per
-- module (or downloading every entry row). Security invoker: entries RLS
-- still applies; the explicit user filter lets it use
-- entries_user_module_date_idx.
create or replace function public.module_entry_counts()
returns table (module_id uuid, entry_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.module_id, count(*)
  from public.entries e
  where e.user_id = (select auth.uid())
  group by e.module_id;
$$;

revoke execute on function public.module_entry_counts() from public, anon;
grant execute on function public.module_entry_counts() to authenticated;
