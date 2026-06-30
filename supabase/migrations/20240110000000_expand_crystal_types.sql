-- Expand the crystal_type allow-list to include the 10 new crystals added in
-- the cf487ea commit (sapphire, emerald, ruby, topaz, turquoise, moonstone,
-- onyx, garnet, opal, sunstone).
alter table public.modules
  drop constraint if exists modules_crystal_type_check;

alter table public.modules
  add constraint modules_crystal_type_check check (
    crystal_type in (
      'amethyst', 'rose_quartz', 'citrine', 'aquamarine',
      'malachite', 'carnelian', 'labradorite', 'obsidian',
      'sapphire', 'emerald', 'ruby', 'topaz',
      'turquoise', 'moonstone', 'onyx', 'garnet',
      'opal', 'sunstone'
    )
  );
