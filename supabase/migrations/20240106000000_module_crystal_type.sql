-- Add a user-chosen crystal type to each module (crystal/geode theme).
alter table public.modules
  add column if not exists crystal_type text not null default 'amethyst';

alter table public.modules
  drop constraint if exists modules_crystal_type_check;

alter table public.modules
  add constraint modules_crystal_type_check check (
    crystal_type in (
      'amethyst', 'rose_quartz', 'citrine', 'aquamarine',
      'malachite', 'carnelian', 'labradorite', 'obsidian'
    )
  );

-- Composite index to keep the openness aggregate cheap.
create index if not exists entries_user_module_date_idx
  on public.entries (user_id, module_id, entry_date);
