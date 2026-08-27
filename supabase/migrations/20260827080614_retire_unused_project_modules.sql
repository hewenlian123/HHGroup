-- Hard-delete the unused Tasks, Punch List, Schedule, and Material Selections modules.
-- Owner confirmed that no module data needs to be preserved.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Fail closed if an active table gained a foreign key to one of the retired tables.
do $dependency_preflight$
declare
  v_dependency record;
  v_retired_relations oid[];
begin
  select pg_catalog.array_agg(
    pg_catalog.to_regclass(pg_catalog.format('public.%I', relation_name))
  )
  into v_retired_relations
  from pg_catalog.unnest(array[
    'project_tasks',
    'project_schedule',
    'punch_list',
    'material_catalog',
    'project_material_selections',
    'material_selections',
    'material_selection_items',
    'project_closeout_punch',
    'final_punch_lists',
    'final_punch_list_items'
  ]) as retired(relation_name)
  where pg_catalog.to_regclass(pg_catalog.format('public.%I', relation_name)) is not null;

  select
    con.conrelid::regclass as dependent_table,
    con.conname as constraint_name,
    con.confrelid::regclass as retired_table
  into v_dependency
  from pg_catalog.pg_constraint con
  where con.contype = 'f'
    and con.confrelid = any(v_retired_relations)
    and con.conrelid <> all(v_retired_relations)
  limit 1;

  if found then
    raise exception using
      errcode = '2BP01',
      message = pg_catalog.format(
        'active relation %s still references retired relation %s through constraint %I',
        v_dependency.dependent_table,
        v_dependency.retired_table,
        v_dependency.constraint_name
      );
  end if;
end
$dependency_preflight$;

-- Remove known policy variants before deleting the retired private buckets.
drop policy if exists phase3a_punch_photos_authenticated_delete on storage.objects;
drop policy if exists phase3a_punch_photos_authenticated_insert on storage.objects;
drop policy if exists phase3a_punch_photos_public_read on storage.objects;
drop policy if exists punch_photos_read on storage.objects;
drop policy if exists punch_photos_insert on storage.objects;
drop policy if exists punch_photos_delete on storage.objects;

-- Supabase Storage protects its metadata tables from direct SQL DELETEs. The release
-- workflow must empty and delete these two buckets through the Storage API first.
do $storage_preflight$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id in ('punch-photos', 'material-images')
  ) or exists (
    select 1
    from storage.buckets
    where id in ('punch-photos', 'material-images')
  ) then
    raise exception using
      errcode = '2BP01',
      message = 'retired buckets punch-photos and material-images must be removed through the Storage API before this migration';
  end if;
end
$storage_preflight$;

drop function if exists public.replace_final_punch_list(
  uuid,
  date,
  text,
  text,
  text,
  text,
  jsonb
);

-- Child and referencing tables must be removed before their parents.
drop table if exists public.final_punch_list_items;
drop table if exists public.final_punch_lists;
drop table if exists public.project_closeout_punch;
drop table if exists public.punch_list;
drop table if exists public.project_schedule;
drop table if exists public.project_tasks;
drop table if exists public.material_selection_items;
drop table if exists public.material_selections;
drop table if exists public.project_material_selections;
drop table if exists public.material_catalog;

notify pgrst, 'reload schema';

commit;
