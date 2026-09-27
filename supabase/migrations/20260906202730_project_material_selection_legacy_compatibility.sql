-- Upgrade the verified empty legacy table without renaming or deleting legacy fields.
-- Apply as a prerequisite when upgrading a database whose original CREATE TABLE
-- IF NOT EXISTS preserved catalog_id/item_name instead of the canonical columns.
set lock_timeout = '5s';
set statement_timeout = '60s';

do $$
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.project_material_selections'::regclass
      and attname = 'material_id' and not attisdropped
  ) and exists (select 1 from public.project_material_selections) then
    raise exception 'Populated legacy material selections require an explicit data mapping'
      using errcode = '23514';
  end if;

  alter table public.project_material_selections
    add column if not exists item text not null default '',
    add column if not exists category text not null default '',
    add column if not exists material_id uuid references public.material_catalog(id) on delete set null,
    add column if not exists material_name text not null default '',
    add column if not exists supplier text;

  -- Legacy reads may fall back to catalog_id. It cannot bypass material_id RLS.
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.project_material_selections'::regclass
      and attname = 'catalog_id' and not attisdropped
  ) and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_material_selections'::regclass
      and conname = 'project_material_selections_legacy_catalog_matches'
  ) then
    alter table public.project_material_selections
      add constraint project_material_selections_legacy_catalog_matches
      check (catalog_id is null or (material_id is not null and catalog_id = material_id));
  end if;
end $$;

notify pgrst, 'reload schema';
