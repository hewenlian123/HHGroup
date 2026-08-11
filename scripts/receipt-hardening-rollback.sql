begin;

-- Operator-only exact rollback generated from the verified Production
-- pre-cutover catalog state (captured 2026-08-10). This restores the historic
-- public worker-receipts delivery contract and its exact related RLS policies
-- and grants. It never deletes or rewrites receipt rows or Storage objects.

do $$
begin
  if to_regclass('public.worker_receipt_reference_remediations') is null then
    raise exception 'Receipt bridge audit table is missing; do not run this rollback';
  end if;

  if not exists (select 1 from storage.buckets where id = 'worker-receipts') then
    raise exception 'Receipt hardening blocked: worker-receipts bucket is missing';
  end if;
end
$$;

alter table public.worker_receipts enable row level security;
alter table public.workers enable row level security;
alter table public.projects enable row level security;
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

update storage.buckets
set
  public = true,
  file_size_limit = null,
  allowed_mime_types = null
where id = 'worker-receipts';

do $$
declare
  target_policy record;
begin
  for target_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%worker-receipts%'
        or coalesce(with_check, '') ilike '%worker-receipts%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', target_policy.policyname);
  end loop;
end
$$;

create policy phase3a_worker_receipts_authenticated_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'worker-receipts'::text);

create policy phase3a_worker_receipts_public_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'worker-receipts'::text);

create policy worker_receipts_public_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'worker-receipts'::text);

create policy worker_receipts_storage_select
on storage.objects for select to anon, authenticated
using (bucket_id = 'worker-receipts'::text);

do $$
declare
  target_table text;
  target_policy record;
begin
  foreach target_table in array array['worker_receipts', 'workers', 'projects'] loop
    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', target_policy.policyname, target_table);
    end loop;

    execute format('revoke all on table public.%I from public', target_table);
    execute format('revoke all on table public.%I from anon', target_table);
    execute format('revoke all on table public.%I from authenticated', target_table);
    execute format('revoke all on table public.%I from service_role', target_table);
    if target_table = 'worker_receipts' then
      revoke insert (
        worker_id, worker_name, project_id, expense_type, vendor, amount,
        description, receipt_url, notes, receipt_date
      ) on table public.worker_receipts from anon;
    else
      execute format('revoke select (id, name) on table public.%I from anon', target_table);
    end if;
    execute format('grant select, references, trigger, truncate on table public.%I to anon', target_table);
    execute format('grant select, insert, update, delete, references, trigger, truncate on table public.%I to authenticated', target_table);
    execute format('grant select, insert, update, delete, references, trigger, truncate on table public.%I to service_role', target_table);
  end loop;
end
$$;

create policy "allow authenticated delete" on public.worker_receipts for delete to authenticated using (true);
create policy "allow authenticated insert" on public.worker_receipts for insert to authenticated with check (true);
create policy "allow authenticated read" on public.worker_receipts for select to authenticated using (true);
create policy "allow authenticated update" on public.worker_receipts for update to authenticated using (true);
create policy phase3a_worker_receipts_anon_select on public.worker_receipts for select to anon using (true);
create policy phase3a_worker_receipts_authenticated_delete on public.worker_receipts for delete to authenticated using (true);
create policy phase3a_worker_receipts_authenticated_insert on public.worker_receipts for insert to authenticated with check (true);
create policy phase3a_worker_receipts_authenticated_select on public.worker_receipts for select to authenticated using (true);
create policy phase3a_worker_receipts_authenticated_update on public.worker_receipts for update to authenticated using (true) with check (true);
create policy worker_receipts_select on public.worker_receipts for select to anon using (true);
create policy worker_receipts_select_all_open on public.worker_receipts for select to public using (true);

create policy "allow authenticated delete" on public.workers for delete to authenticated using (true);
create policy "allow authenticated insert" on public.workers for insert to authenticated with check (true);
create policy "allow authenticated read" on public.workers for select to authenticated using (true);
create policy "allow authenticated update" on public.workers for update to authenticated using (true);
create policy phase3a_workers_anon_select on public.workers for select to anon using (true);
create policy phase3a_workers_authenticated_delete on public.workers for delete to authenticated using (true);
create policy phase3a_workers_authenticated_insert on public.workers for insert to authenticated with check (true);
create policy phase3a_workers_authenticated_select on public.workers for select to authenticated using (true);
create policy phase3a_workers_authenticated_update on public.workers for update to authenticated using (true) with check (true);
create policy workers_select_all on public.workers for select to anon using (true);

create policy "allow authenticated delete" on public.projects for delete to authenticated using (true);
create policy "allow authenticated insert" on public.projects for insert to authenticated with check (true);
create policy "allow authenticated read" on public.projects for select to authenticated using (true);
create policy "allow authenticated update" on public.projects for update to authenticated using (true);
create policy phase3a_projects_anon_select on public.projects for select to anon using (true);
create policy phase3a_projects_authenticated_delete on public.projects for delete to authenticated using (true);
create policy phase3a_projects_authenticated_insert on public.projects for insert to authenticated with check (true);
create policy phase3a_projects_authenticated_select on public.projects for select to authenticated using (true);
create policy phase3a_projects_authenticated_update on public.projects for update to authenticated using (true) with check (true);
create policy projects_select_all on public.projects for select to anon using (true);

revoke all on table storage.objects from public;
revoke all on table storage.objects from anon;
revoke all on table storage.objects from authenticated;
revoke all on table storage.objects from service_role;
grant select, insert, update, delete, references, trigger, truncate on table storage.objects to anon;
grant select, insert, update, delete, references, trigger, truncate on table storage.objects to authenticated;
grant select, insert, update, delete, references, trigger, truncate on table storage.objects to service_role;

revoke all on table storage.buckets from public;
revoke all on table storage.buckets from anon;
revoke all on table storage.buckets from authenticated;
revoke all on table storage.buckets from service_role;
grant select, insert, update, delete, references, trigger, truncate on table storage.buckets to anon;
grant select, insert, update, delete, references, trigger, truncate on table storage.buckets to authenticated;
grant select, insert, update, delete, references, trigger, truncate on table storage.buckets to service_role;

-- The verified pre-cutover state has neither bridge helper. Remove the public
-- execution path created by bridge/final before returning to that baseline.
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on schema private from service_role;
revoke all on table public.worker_receipt_reference_remediations from public;
revoke all on table public.worker_receipt_reference_remediations from anon;
revoke all on table public.worker_receipt_reference_remediations from authenticated;
revoke all on table public.worker_receipt_reference_remediations from service_role;
revoke all on function private.remediate_worker_receipt_reference(uuid, text, text) from public;
revoke all on function private.remediate_worker_receipt_reference(uuid, text, text) from anon;
revoke all on function private.remediate_worker_receipt_reference(uuid, text, text) from authenticated;
revoke all on function private.remediate_worker_receipt_reference(uuid, text, text) from service_role;
drop function if exists private.worker_receipt_upload_exists(text);
drop function if exists private.worker_receipt_bridge_reference_exists(text);

notify pgrst, 'reload schema';

commit;
