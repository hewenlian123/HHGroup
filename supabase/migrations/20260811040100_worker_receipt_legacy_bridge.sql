-- Temporary compatibility bridge for the receipt hardening cutover.
-- It keeps the historic public object URL contract working only until the final
-- migration, while keeping receipt records readable only by owners and admins.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, service_role;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'worker-receipts') then
    raise exception 'Receipt hardening blocked: worker-receipts bucket is missing';
  end if;
end
$$;

alter table public.worker_receipts enable row level security;

-- The bridge intentionally leaves delivery public for historic public object URLs.
-- Its narrow Storage INSERT rule still rejects list/read/write mutations by anon.
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

-- Accept an existing canonical path or exactly the historic public URL for a
-- canonical object. Arbitrary external URLs never pass the bridge policy.
create or replace function private.worker_receipt_bridge_reference_exists(p_reference text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  resolved_path text;
begin
  if p_reference is null or btrim(p_reference) = '' then
    return false;
  end if;

  if p_reference ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$' then
    resolved_path := p_reference;
  elsif p_reference ~* '^https?://[^/?#]+/storage/v1/object/public/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)(\?[^#]*)?$' then
    resolved_path := regexp_replace(
      p_reference,
      '^https?://[^/?#]+/storage/v1/object/public/worker-receipts/',
      '',
      'i'
    );
    resolved_path := regexp_replace(resolved_path, '\?.*$', '');
  else
    return false;
  end if;

  return private.worker_receipt_upload_exists(resolved_path);
end;
$function$;

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

-- The deployed receipt contract submits without returning a receipt row, so no
-- temporary anon SELECT policy is needed for the compatibility bridge.
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

-- Anonymous receipt options are limited to active id/name values; this bridge
-- does not carry forward broad public worker or project access.
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

create table if not exists public.worker_receipt_reference_remediations (
  id bigint generated by default as identity primary key,
  worker_receipt_id uuid not null unique references public.worker_receipts(id),
  reimbursement_id uuid references public.worker_reimbursements(id),
  old_receipt_url text not null,
  old_reimbursement_receipt_url text,
  replacement_storage_path text not null check (
    replacement_storage_path ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
  ),
  remediated_at timestamptz not null default now()
);

alter table public.worker_receipt_reference_remediations enable row level security;
revoke all on table public.worker_receipt_reference_remediations from public;
revoke all on table public.worker_receipt_reference_remediations from anon;
revoke all on table public.worker_receipt_reference_remediations from authenticated;
grant select, insert on table public.worker_receipt_reference_remediations to service_role;

-- This audited, service-role-only function updates one exact, externally hosted
-- legacy reference and its linked reimbursement atomically. It never deletes data.
create or replace function private.remediate_worker_receipt_reference(
  p_worker_receipt_id uuid,
  p_expected_receipt_url text,
  p_replacement_storage_path text
)
returns table (
  worker_receipt_id uuid,
  reimbursement_id uuid,
  replacement_storage_path text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt_row public.worker_receipts%rowtype;
  reimbursement_row public.worker_reimbursements%rowtype;
  expected_receipt_url text := btrim(coalesce(p_expected_receipt_url, ''));
  replacement_path text := btrim(coalesce(p_replacement_storage_path, ''));
begin
  if replacement_path !~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$' then
    raise exception 'Replacement receipt path is not canonical';
  end if;

  if not private.worker_receipt_upload_exists(replacement_path) then
    raise exception 'Replacement receipt object does not exist';
  end if;

  select *
  into receipt_row
  from public.worker_receipts
  where id = p_worker_receipt_id
  for update;

  if not found then
    raise exception 'Worker receipt % does not exist', p_worker_receipt_id;
  end if;

  if receipt_row.receipt_url is distinct from expected_receipt_url then
    raise exception 'Worker receipt % changed since the audit', p_worker_receipt_id;
  end if;

  if expected_receipt_url !~* '^https?://' then
    raise exception 'Only an externally hosted legacy reference may be remediated';
  end if;

  if receipt_row.reimbursement_id is not null then
    select *
    into reimbursement_row
    from public.worker_reimbursements
    where id = receipt_row.reimbursement_id
    for update;

    if not found then
      raise exception 'Linked reimbursement % does not exist', receipt_row.reimbursement_id;
    end if;

    if reimbursement_row.receipt_url is distinct from receipt_row.receipt_url then
      raise exception 'Linked reimbursement receipt reference changed since the audit';
    end if;

    update public.worker_reimbursements
    set receipt_url = replacement_path
    where id = receipt_row.reimbursement_id;
  end if;

  update public.worker_receipts
  set receipt_url = replacement_path
  where id = receipt_row.id;

  insert into public.worker_receipt_reference_remediations (
    worker_receipt_id,
    reimbursement_id,
    old_receipt_url,
    old_reimbursement_receipt_url,
    replacement_storage_path
  )
  values (
    receipt_row.id,
    receipt_row.reimbursement_id,
    receipt_row.receipt_url,
    reimbursement_row.receipt_url,
    replacement_path
  );

  return query
  select receipt_row.id, receipt_row.reimbursement_id, replacement_path;
end;
$function$;

revoke all on function private.remediate_worker_receipt_reference(uuid, text, text) from public;
grant execute on function private.remediate_worker_receipt_reference(uuid, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
