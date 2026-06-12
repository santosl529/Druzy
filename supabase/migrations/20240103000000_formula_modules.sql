-- Formula modules: a module whose daily value is computed from other
-- modules' data (compute on read; no stored computed entries).

alter table modules
  add column if not exists kind text not null default 'standard';

alter table modules
  add column if not exists formula_config jsonb;

alter table modules
  drop constraint if exists modules_kind_check;

alter table modules
  add constraint modules_kind_check check (kind in ('standard', 'formula'));

-- A formula module must have a config; a standard module must not.
alter table modules
  drop constraint if exists modules_formula_config_check;

alter table modules
  add constraint modules_formula_config_check check (
    (kind = 'formula' and formula_config is not null)
    or (kind = 'standard' and formula_config is null)
  );
