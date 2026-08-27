-- Read-only verification for the Documents / Site Photos / Inspection Log
-- product cleanup. Run after the local migration has been applied.

do $$
declare
  v_remaining_relations text;
  v_module_storage_buckets text;
  v_module_storage_policies text;
  v_site_photo_objects bigint;
begin
  select string_agg(format('%I.%I', relation_ns.nspname, relation.relname), ', ')
  into v_remaining_relations
  from pg_class relation
  join pg_namespace relation_ns on relation_ns.oid = relation.relnamespace
  where relation_ns.nspname = 'public'
    and relation.relname in ('site_photos', 'inspection_log', 'inspection_logs')
    and relation.relkind in ('r', 'p', 'v', 'm', 'f');

  if v_remaining_relations is not null then
    raise exception 'Retired DB relation(s) still exist: %', v_remaining_relations;
  end if;

  if to_regclass('public.documents') is null then
    raise exception 'Shared public.documents metadata table was not preserved';
  end if;

  if to_regclass('public.attachments') is null then
    raise exception 'Shared public.attachments table was not preserved';
  end if;

  if to_regclass('public.expense_attachments') is null then
    raise exception 'Shared public.expense_attachments table was not preserved';
  end if;

  if to_regclass('public.payment_received_attachments') is null then
    raise exception 'Shared public.payment_received_attachments table was not preserved';
  end if;

  if not exists (select 1 from storage.buckets where id = 'attachments') then
    raise exception 'Shared attachments Storage bucket was not preserved';
  end if;

  select count(*)
  into v_site_photo_objects
  from storage.objects
  where bucket_id = 'attachments'
    and name like 'site-photos/%';

  if v_site_photo_objects <> 0 then
    raise exception 'Retired attachments/site-photos Storage objects remain: %', v_site_photo_objects;
  end if;

  select string_agg(id, ', ' order by id)
  into v_module_storage_buckets
  from storage.buckets
  where id in (
    'site-photos',
    'site_photos',
    'inspection-log',
    'inspection_log',
    'inspection-logs',
    'inspection_logs'
  );

  if v_module_storage_buckets is not null then
    raise exception 'Retired dedicated Storage bucket(s) remain: %', v_module_storage_buckets;
  end if;

  select string_agg(policyname, ', ' order by policyname)
  into v_module_storage_policies
  from pg_policies
  where schemaname = 'storage'
    and tablename in ('objects', 'buckets')
    and (
      policyname ~* 'site.?photos|inspection.?logs?'
      or coalesce(qual, '') ~* 'site-photos|site_photos|inspection-log|inspection_log|inspection-logs|inspection_logs'
      or coalesce(with_check, '') ~* 'site-photos|site_photos|inspection-log|inspection_log|inspection-logs|inspection_logs'
    );

  if v_module_storage_policies is not null then
    raise exception 'Retired module Storage policy/policies remain: %', v_module_storage_policies;
  end if;
end
$$;

select
  'retired_documents_site_photos_inspection_log_verified' as verification,
  to_regclass('public.documents')::text as preserved_document_metadata,
  (select id from storage.buckets where id = 'attachments') as preserved_shared_bucket;
