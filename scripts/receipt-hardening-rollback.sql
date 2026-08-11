begin;

-- Operator-only rollback: restore the narrow compatibility bridge, not the
-- historic unbounded policies. It never deletes or rewrites rows or objects.

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

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, service_role;

-- Restoring public delivery is deliberate and is the reversible boundary of the
-- final cutover. The object path, type, and size limits remain in force.
update storage.buckets
set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
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

create policy worker_receipts_bridge_anon_insert
on storage.objects
for insert
to anon
with check (
  bucket_id = 'worker-receipts'
  and name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
);

revoke all on function private.worker_receipt_upload_exists(text) from public;
grant execute on function private.worker_receipt_upload_exists(text) to anon;
revoke all on function private.worker_receipt_bridge_reference_exists(text) from public;
grant execute on function private.worker_receipt_bridge_reference_exists(text) to anon;

do $$
declare
  target_policy record;
begin
  for target_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'worker_receipts'
      and roles && array['anon', 'authenticated', 'public']::name[]
  loop
    execute format('drop policy if exists %I on public.worker_receipts', target_policy.policyname);
  end loop;
end
$$;

revoke all on table public.worker_receipts from public;
revoke all on table public.worker_receipts from anon;
grant insert (
  worker_id,
  worker_name,
  project_id,
  expense_type,
  vendor,
  amount,
  description,
  receipt_url,
  notes,
  receipt_date
) on table public.worker_receipts to anon;
grant select, insert, update, delete on table public.worker_receipts to authenticated;
grant select, insert, update, delete on table public.worker_receipts to service_role;

create policy worker_receipts_bridge_public_submit
on public.worker_receipts
for insert
to anon
with check (
  worker_id is not null
  and worker_name is not null
  and btrim(worker_name) <> ''
  and length(worker_name) <= 120
  and exists (
    select 1
    from public.workers as worker_option
    where worker_option.id = worker_receipts.worker_id
      and worker_option.name = worker_receipts.worker_name
  )
  and (
    project_id is null
    or exists (
      select 1
      from public.projects as project_option
      where project_option.id = worker_receipts.project_id
    )
  )
  and amount between 0.01 and 100000
  and private.worker_receipt_bridge_reference_exists(receipt_url)
  and expense_type in ('Building Materials', 'Tools', 'Food', 'Transportation', 'Supplies', 'Other')
  and receipt_date is not null
  and (vendor is null or (btrim(vendor) <> '' and length(vendor) <= 160))
  and (description is null or (btrim(description) <> '' and length(description) <= 500))
  and (notes is null or (btrim(notes) <> '' and length(notes) <= 1000))
  and status = 'Pending'
  and rejection_reason is null
  and reimbursement_id is null
);

create policy worker_receipts_bridge_anon_insert
on public.worker_receipts
as restrictive
for insert
to anon
with check (private.worker_receipt_bridge_reference_exists(receipt_url));

create policy worker_receipts_owner_admin_select
on public.worker_receipts
for select
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner', 'admin'));

create policy worker_receipts_owner_admin_insert
on public.worker_receipts
for insert
to authenticated
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner', 'admin'));

create policy worker_receipts_owner_admin_update
on public.worker_receipts
for update
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner', 'admin'))
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner', 'admin'));

create policy worker_receipts_owner_admin_delete
on public.worker_receipts
for delete
to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner', 'admin'));

do $$
declare
  target_table text;
  target_policy record;
begin
  foreach target_table in array array['workers', 'projects'] loop
    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and cmd in ('ALL', 'SELECT')
        and roles && array['anon', 'public']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', target_policy.policyname, target_table);
    end loop;

    execute format('revoke all on table public.%I from public', target_table);
    execute format('revoke all on table public.%I from anon', target_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
    execute format('grant select (id, name) on table public.%I to anon', target_table);
  end loop;
end
$$;

create policy worker_receipt_options_workers_anon_select
on public.workers
for select
to anon
using (
  lower(btrim(coalesce(status, ''))) = 'active'
  and btrim(coalesce(name, '')) <> ''
);

create policy worker_receipt_options_projects_anon_select
on public.projects
for select
to anon
using (
  lower(btrim(coalesce(status, ''))) = 'active'
  and btrim(coalesce(name, '')) <> ''
);

notify pgrst, 'reload schema';

commit;
