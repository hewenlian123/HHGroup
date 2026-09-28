-- Drop project features that exist only for Schedule, Tasks, Punch List,
-- Photos, Inspections, and Material Selections.
-- Shared document authorization and activity-log parent checks are rewritten
-- first so they no longer depend on the dropped tables.
-- Finance tables, views, functions, activity_logs, documents, closeout
-- (final_punch_lists), and the attachments bucket are left in place.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.can_read_project_document_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.documents d
    where d.file_path = object_name
      and private.is_org_member(d.organization_id)
      and (
        d.project_id is null
        or exists (
          select 1
          from public.projects p
          where p.id = d.project_id
            and p.organization_id = d.organization_id
        )
      )
      and (
        private.document_object_path_matches(object_name, d.organization_id, d.project_id, d.id)
        or split_part(object_name, '/', 1) <> 'organizations'
      )
  );
$$;

revoke all on function private.can_read_project_document_object(text) from public, anon, authenticated;
grant execute on function private.can_read_project_document_object(text) to authenticated;

create or replace function private.validate_resource_parent_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_org uuid;
  new_org uuid;
begin
  if new.project_id is not distinct from old.project_id then
    return new;
  end if;
  select organization_id into old_org from public.projects where id = old.project_id;
  select organization_id into new_org from public.projects where id = new.project_id;
  if old_org is distinct from new_org then
    raise exception 'Resource cannot move between organizations' using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function private.validate_resource_parent_organization() from public, anon, authenticated;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select pol.policyname
    from pg_catalog.pg_policies pol
    where pol.schemaname = 'storage'
      and pol.tablename = 'objects'
      and (
        pol.policyname like 'punch_photos\_%' escape '\'
        or pol.policyname like 'material_images\_%' escape '\'
        or pol.policyname like 'phase3a_punch_photos\_%' escape '\'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_name);
  end loop;
end $$;

drop policy if exists "punch_photos_read" on storage.objects;
drop policy if exists "punch_photos_insert" on storage.objects;
drop policy if exists "punch_photos_delete" on storage.objects;
drop policy if exists phase3a_punch_photos_public_read on storage.objects;
drop policy if exists phase3a_punch_photos_authenticated_insert on storage.objects;
drop policy if exists phase3a_punch_photos_authenticated_delete on storage.objects;
drop policy if exists punch_photos_read_boundary on storage.objects;
drop policy if exists punch_photos_member_read on storage.objects;
drop policy if exists punch_photos_no_new_objects on storage.objects;
drop policy if exists punch_photos_no_object_replacement on storage.objects;
drop policy if exists punch_photos_no_object_removal on storage.objects;
drop policy if exists material_images_read_boundary on storage.objects;
drop policy if exists material_images_member_read on storage.objects;
drop policy if exists material_images_no_new_objects on storage.objects;
drop policy if exists material_images_no_object_replacement on storage.objects;
drop policy if exists material_images_no_object_removal on storage.objects;

delete from storage.objects
where bucket_id in ('punch-photos', 'material-images');

delete from storage.buckets
where id in ('punch-photos', 'material-images');

-- Policies and triggers on the feature tables depend on the feature functions.
-- Drop those dependents first so the functions and tables can be removed
-- without CASCADE. activity_logs keeps authorization_parent_organization.
do $$
declare
  object_name text;
  table_name text;
  feature_tables text[] := array[
    'material_selection_items',
    'material_selections',
    'project_material_selections',
    'material_catalog',
    'punch_list',
    'site_photos',
    'inspection_log',
    'inspection_logs',
    'project_tasks',
    'project_schedule'
  ];
begin
  foreach table_name in array feature_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;
    for object_name in
      select pol.policyname
      from pg_catalog.pg_policies pol
      where pol.schemaname = 'public'
        and pol.tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', object_name, table_name);
    end loop;
    for object_name in
      select tg.tgname
      from pg_catalog.pg_trigger tg
      join pg_catalog.pg_class rel on rel.oid = tg.tgrelid
      join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public'
        and rel.relname = table_name
        and not tg.tgisinternal
    loop
      execute format('drop trigger if exists %I on public.%I', object_name, table_name);
    end loop;
  end loop;
end $$;

drop function if exists private.material_matches_project(uuid, uuid);
drop function if exists private.can_read_legacy_material_image(text);
drop function if exists private.validate_material_image_reference();
drop function if exists private.material_image_reference_matches(text, text);
drop function if exists private.can_read_legacy_punch_photo(text);
drop function if exists private.validate_project_photo_reference();

drop table if exists public.material_selection_items;
drop table if exists public.material_selections;
drop table if exists public.project_material_selections;
drop table if exists public.material_catalog;
drop table if exists public.punch_list;
drop table if exists public.site_photos;
drop table if exists public.inspection_log;
drop table if exists public.inspection_logs;
drop table if exists public.project_tasks;
drop table if exists public.project_schedule;

notify pgrst, 'reload schema';

commit;
