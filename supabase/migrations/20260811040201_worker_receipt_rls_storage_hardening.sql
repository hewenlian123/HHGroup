begin;

-- Worker receipt public-intake hardening.
-- Non-destructive: this migration does not rewrite or delete receipt rows or Storage objects.

-- The compatibility bridge must have audited and remediated the known two
-- external references before the bucket is made private. This runs before any
-- bucket, policy, or grant change so a failed gate rolls back without outage.
do $$
declare
  remediation_audit_rows bigint;
  incompatible_reference_count bigint;
  missing_object_count bigint;
  incomplete_remediation_count bigint;
begin
  if not exists (select 1 from storage.buckets where id = 'worker-receipts') then
    raise exception 'Receipt hardening blocked: worker-receipts bucket is missing';
  end if;

  if to_regclass('public.worker_receipt_reference_remediations') is null then
    raise exception 'Receipt hardening bridge has not been applied';
  end if;

  select count(*)
  into remediation_audit_rows
  from public.worker_receipt_reference_remediations;

  if remediation_audit_rows <> 2 then
    raise exception 'Receipt hardening blocked: expected exactly 2 remediation audit rows, found %', remediation_audit_rows;
  end if;

  select count(*)
  into incomplete_remediation_count
  from public.worker_receipt_reference_remediations as remediation
  join public.worker_receipts as receipt
    on receipt.id = remediation.worker_receipt_id
  left join public.worker_reimbursements as reimbursement
    on reimbursement.id = remediation.reimbursement_id
  where receipt.receipt_url is distinct from remediation.replacement_storage_path
    or receipt.reimbursement_id is distinct from remediation.reimbursement_id
    or (
      remediation.reimbursement_id is not null
      and reimbursement.receipt_url is distinct from remediation.replacement_storage_path
    );

  if incomplete_remediation_count <> 0 then
    raise exception 'Receipt hardening blocked: % remediation audit rows do not match the current receipt linkage', incomplete_remediation_count;
  end if;

  select count(*)
  into incompatible_reference_count
  from public.worker_receipts
  where receipt_url is null
    or not (
      receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
      or receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)(\?[^#]*)?$'
    );

  if incompatible_reference_count <> 0 then
    raise exception
      'Receipt hardening blocked: % incompatible receipt references remain (% remediation audit rows)',
      incompatible_reference_count,
      remediation_audit_rows;
  end if;

  with resolved_receipts as (
    select case
      when receipt_url ~ '^uploads/' then receipt_url
      else regexp_replace(
        regexp_replace(
          receipt_url,
          '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/',
          '',
          'i'
        ),
        '\?.*$',
        ''
      )
    end as storage_path
    from public.worker_receipts
  )
  select count(*)
  into missing_object_count
  from resolved_receipts
  where not exists (
    select 1
    from storage.objects as receipt_object
    where receipt_object.bucket_id = 'worker-receipts'
      and receipt_object.name = resolved_receipts.storage_path
  );

  if missing_object_count <> 0 then
    raise exception 'Receipt hardening blocked: % referenced receipt objects are missing', missing_object_count;
  end if;
end
$$;

alter table public.worker_receipts enable row level security;

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
where id = 'worker-receipts';

do $$
declare
  target_policy record;
begin
  -- Remove any legacy policy that grants access to worker-receipts, including drifted names.
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

create policy worker_receipts_public_intake_insert
on storage.objects
for insert
to anon
with check (
  bucket_id = 'worker-receipts'
  and name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
);

do $$
declare
  target_policy record;
begin
  -- Replace every permissive anon/authenticated receipt policy with the explicit model below.
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

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, service_role;

create or replace function private.worker_receipt_upload_exists(p_path text)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from storage.objects as receipt_object
    where receipt_object.bucket_id = 'worker-receipts'
      and receipt_object.name = p_path
  );
$function$;

revoke all on function private.worker_receipt_upload_exists(text) from public;
grant execute on function private.worker_receipt_upload_exists(text) to anon;

create policy worker_receipts_public_submit
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
  and receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
  and private.worker_receipt_upload_exists(receipt_url)
  and expense_type in ('Building Materials', 'Tools', 'Food', 'Transportation', 'Supplies', 'Other')
  and receipt_date is not null
  and (vendor is null or (btrim(vendor) <> '' and length(vendor) <= 160))
  and (description is null or (btrim(description) <> '' and length(description) <= 500))
  and (notes is null or (btrim(notes) <> '' and length(notes) <= 1000))
  and status = 'Pending'
  and rejection_reason is null
  and reimbursement_id is null
);

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
