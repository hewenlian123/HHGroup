-- Retire the Site Photos and Inspection Log product modules.
--
-- Documents Center UI is retired separately, but public.documents and the
-- private attachments bucket are shared by active project attachments and
-- generated closeout PDFs, so they are intentionally preserved here.

set lock_timeout = '5s';
set statement_timeout = '120s';

begin;

do $$
declare
  v_external_foreign_keys text;
  v_dependent_views text;
  v_function_references text;
  v_storage_policies text;
  v_storage_buckets text;
  v_site_photo_objects bigint;
begin
  -- A foreign key owned by any non-retired table means an active relation may
  -- still depend on one of the targets. Abort instead of deleting around it.
  select string_agg(
    format('%I.%I (%I)', source_ns.nspname, source.relname, constraint_row.conname),
    ', '
    order by source_ns.nspname, source.relname, constraint_row.conname
  )
  into v_external_foreign_keys
  from pg_constraint constraint_row
  join pg_class target on target.oid = constraint_row.confrelid
  join pg_namespace target_ns on target_ns.oid = target.relnamespace
  join pg_class source on source.oid = constraint_row.conrelid
  join pg_namespace source_ns on source_ns.oid = source.relnamespace
  where constraint_row.contype = 'f'
    and target_ns.nspname = 'public'
    and target.relname in ('site_photos', 'inspection_log', 'inspection_logs')
    and not (
      source_ns.nspname = 'public'
      and source.relname in ('site_photos', 'inspection_log', 'inspection_logs')
    );

  if v_external_foreign_keys is not null then
    raise exception
      'Retired module cleanup blocked by incoming foreign key(s): %',
      v_external_foreign_keys;
  end if;

  -- Views can hide dependencies that are not visible in the FK graph.
  select string_agg(
    distinct format('%I.%I', view_ns.nspname, view_relation.relname),
    ', '
  )
  into v_dependent_views
  from pg_depend dependency
  join pg_rewrite rewrite_rule on rewrite_rule.oid = dependency.objid
  join pg_class view_relation on view_relation.oid = rewrite_rule.ev_class
  join pg_namespace view_ns on view_ns.oid = view_relation.relnamespace
  join pg_class target on target.oid = dependency.refobjid
  join pg_namespace target_ns on target_ns.oid = target.relnamespace
  where target_ns.nspname = 'public'
    and target.relname in ('site_photos', 'inspection_log', 'inspection_logs')
    and view_relation.relkind in ('v', 'm')
    and not (
      view_ns.nspname = 'public'
      and view_relation.relname in ('site_photos', 'inspection_log', 'inspection_logs')
    );

  if v_dependent_views is not null then
    raise exception
      'Retired module cleanup blocked by dependent view(s): %',
      v_dependent_views;
  end if;

  -- PostgreSQL does not catalog every procedural-function table reference as a
  -- dependency, so inspect user-defined function bodies as a second gate.
  select string_agg(
    format('%I.%I(%s)', function_ns.nspname, function_row.proname,
      pg_get_function_identity_arguments(function_row.oid)),
    ', '
    order by function_ns.nspname, function_row.proname,
      pg_get_function_identity_arguments(function_row.oid)
  )
  into v_function_references
  from pg_proc function_row
  join pg_namespace function_ns on function_ns.oid = function_row.pronamespace
  where function_row.prokind in ('f', 'p')
    and function_ns.nspname not in ('pg_catalog', 'information_schema')
    and function_row.prosrc ~* '\m(site_photos|inspection_log|inspection_logs)\M';

  if v_function_references is not null then
    raise exception
      'Retired module cleanup blocked by function reference(s): %',
      v_function_references;
  end if;

  -- Site Photos used the shared attachments bucket under this prefix. Storage
  -- bytes must be removed through the Storage API before this migration runs.
  select count(*)
  into v_site_photo_objects
  from storage.objects
  where bucket_id = 'attachments'
    and name like 'site-photos/%';

  if v_site_photo_objects > 0 then
    raise exception
      'Retired module cleanup blocked: % attachments/site-photos object(s) must be removed through the Storage API first',
      v_site_photo_objects;
  end if;

  -- These names cover known legacy dedicated-bucket variants. The active
  -- shared attachments bucket is deliberately not included.
  select string_agg(id, ', ' order by id)
  into v_storage_buckets
  from storage.buckets
  where id in (
    'site-photos',
    'site_photos',
    'inspection-log',
    'inspection_log',
    'inspection-logs',
    'inspection_logs'
  );

  if v_storage_buckets is not null then
    raise exception
      'Retired module cleanup blocked: dedicated Storage bucket(s) % must be emptied and removed through the Storage API first',
      v_storage_buckets;
  end if;

  -- Do not silently leave a prefix-specific policy on the shared Storage
  -- tables. No such policy exists in the verified local schema.
  select string_agg(policyname, ', ' order by policyname)
  into v_storage_policies
  from pg_policies
  where schemaname = 'storage'
    and tablename in ('objects', 'buckets')
    and (
      policyname ~* 'site.?photos|inspection.?logs?'
      or coalesce(qual, '') ~* 'site-photos|site_photos|inspection-log|inspection_log|inspection-logs|inspection_logs'
      or coalesce(with_check, '') ~* 'site-photos|site_photos|inspection-log|inspection_log|inspection-logs|inspection_logs'
    );

  if v_storage_policies is not null then
    raise exception
      'Retired module cleanup blocked by module-specific Storage policy/policies: %',
      v_storage_policies;
  end if;
end
$$;

-- Child/duplicate Inspection Log variants have no inbound references. Indexes,
-- table RLS policies, grants, and table-owned constraints leave with each table.
drop table if exists public.site_photos;
drop table if exists public.inspection_log;
drop table if exists public.inspection_logs;

notify pgrst, 'reload schema';

commit;
