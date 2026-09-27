-- HH finance/labor/contact data belongs to the existing singleton company profile.
-- Preserve that architecture and existing role permissions; membership is live, not JWT-only.
set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function private.company_organization_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(o.id))[1] else null end
  from public.organizations o join public.company_profile c on c.id=o.legacy_company_profile_id;
$$;
create or replace function private.can_access_company()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_member(private.company_organization_id());
$$;
create or replace function private.can_manage_company()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_admin(private.company_organization_id());
$$;
create or replace function private.is_company_project(project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.projects p where p.id=project_id
    and p.organization_id=private.company_organization_id());
$$;
revoke all on function private.company_organization_id(),private.can_access_company(),
  private.can_manage_company(),private.is_company_project(uuid) from public,anon,authenticated;
grant execute on function private.can_access_company(),private.can_manage_company(),
  private.is_company_project(uuid) to authenticated;

-- The historical remote-schema migration removed this active workflow table.
-- Restore metadata only; private file access continues to require documents metadata.
create table if not exists public.project_change_order_attachments (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.project_change_orders(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_change_order_attachments_change_order_id_idx
  on public.project_change_order_attachments(change_order_id);
alter table public.project_change_order_attachments enable row level security;
revoke all on public.project_change_order_attachments from public,anon,authenticated;
grant select,insert,update,delete on public.project_change_order_attachments to authenticated,service_role;
create policy change_order_attachment_access on public.project_change_order_attachments
  for all to authenticated using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

-- Project linkage is authoritative even for trusted server writes.
create or replace function private.validate_company_project_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_value text := nullif(btrim(to_jsonb(new)->>'project_id'),'');
begin
  if project_value is not null and not exists(select 1 from public.projects p
    where p.id::text=project_value and p.organization_id=private.company_organization_id()) then
    raise exception 'Project must belong to the shared company' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.validate_company_project_reference() from public,anon,authenticated;

create or replace function private.validate_project_company_contacts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb := to_jsonb(new); project_org uuid;
begin
  if nullif(row_data->>'customer_id','') is null and nullif(row_data->>'client_id','') is null
    and nullif(row_data->>'assigned_worker_id','') is null and nullif(row_data->>'created_by','') is null then
    return new;
  end if;
  if tg_table_name='projects' then project_org := (row_data->>'organization_id')::uuid;
  elsif tg_table_name='material_selections' and row_data->>'project_id' is null then
    project_org := (row_data->>'organization_id')::uuid;
  else select p.organization_id into project_org from public.projects p where p.id::text=row_data->>'project_id';
  end if;
  if project_org is distinct from private.company_organization_id() or project_org is null then
    raise exception 'Company contacts cannot be assigned to another organization' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.validate_project_company_contacts() from public,anon,authenticated;
do $$
declare t text;
begin
  foreach t in array array['projects','material_selections','project_tasks','punch_list'] loop
    execute format('create trigger company_contact_reference before insert or update on public.%I for each row execute function private.validate_project_company_contacts()',t);
  end loop;
end $$;

-- Existing role policies remain the permission authority. This additional boundary
-- prevents arbitrary owner JWTs or revoked members from reading the shared company.
do $$
declare t text; rule text; project_type text; conflicting_rows bigint;
begin
  foreach t in array array[
    'accounting_periods','accounts','ap_bill_deletions','ap_bill_payments','ap_bills',
    'app_security_settings','attachments','audit_logs','bank_transactions','bills',
    'categories','clients','commission_payment_records','commission_payments','commissions',
    'commitments','company_profile','cost_allocations','customers','daily_work_entries','deposits',
    'estimate_activity_events','estimate_categories','estimate_items','estimate_meta',
    'estimate_payment_schedule_items','estimate_snapshots','estimate_templates','estimates',
    'expense_attachments','expense_lines','expense_options','expenses','invoice_items',
    'invoice_payments','invoices','labor_entries','labor_invoices','labor_payments','labor_workers',
    'payment_accounts','payment_received_attachments','payment_schedule_template_items',
    'payment_schedule_templates','payments_received','project_budget_items',
    'project_change_order_attachments','project_change_order_items','project_change_orders',
    'project_commissions','project_cost_codes','receipt_queue','receipt_storage_cleanup_candidates',
    'subcontract_bills','subcontract_deductions','subcontract_payment_schedule','subcontract_payments',
    'subcontractors','subcontracts','vendors','worker_advances','worker_invoices',
    'worker_payment_reversals','worker_payments','worker_rate_history',
    'worker_receipt_reference_remediations','worker_receipts','worker_reimbursements','workers'
  ] loop
    if to_regclass(format('public.%I',t)) is null then
      raise exception 'Company authorization prerequisite missing: %',t;
    end if;
    execute format('revoke all on public.%I from public,anon',t);
    rule := '(select private.can_access_company())';
    select data_type into project_type from information_schema.columns
      where table_schema='public' and table_name=t and column_name='project_id';
    if project_type in ('uuid','text') then
      execute format('select count(*) from public.%I r where nullif(btrim(r.project_id::text),'''') is not null and not exists(select 1 from public.projects p where p.id::text=r.project_id::text and p.organization_id=private.company_organization_id())',t)
        into conflicting_rows;
      if conflicting_rows <> 0 then
        raise exception 'Company project mapping conflict in %: % rows require explicit review',t,conflicting_rows;
      end if;
    end if;
    if project_type='uuid' then
      rule := rule || ' and (project_id is null or private.is_company_project(project_id))';
      execute format('create trigger company_project_reference before insert or update on public.%I for each row execute function private.validate_company_project_reference()',t);
    elsif project_type='text' then
      -- Receipt queue retains its existing incomplete-draft semantics; valid project
      -- IDs are checked before finalization, and no foreign project may be stored.
      execute format('create trigger company_project_reference before insert or update on public.%I for each row execute function private.validate_company_project_reference()',t);
    end if;
    execute format('create policy company_membership_boundary on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t,rule,rule);
  end loop;
end $$;

-- SQL clients must never bypass RLS through TRUNCATE or install table triggers.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('revoke truncate,trigger,references on public.%I from public,anon,authenticated',t.tablename);
  end loop;
end $$;

-- Change Orders and budget rows require their exact parent project as well as
-- the company's existing financial role. Parent-only children cannot forge project_id.
create policy change_order_project_boundary on public.project_change_orders as restrictive
  for all to authenticated using (private.can_manage_project(project_id))
  with check (private.can_manage_project(project_id));
create policy change_order_item_project_boundary on public.project_change_order_items as restrictive
  for all to authenticated using (exists(select 1 from public.project_change_orders c
    where c.id=change_order_id and private.can_manage_project(c.project_id)))
  with check (exists(select 1 from public.project_change_orders c where c.id=change_order_id
    and private.can_manage_project(c.project_id) and (project_id is null or project_id=c.project_id)));
create policy change_order_attachment_project_boundary on public.project_change_order_attachments as restrictive
  for all to authenticated using (exists(select 1 from public.project_change_orders c
    where c.id=change_order_id and private.can_manage_project(c.project_id)))
  with check (exists(select 1 from public.project_change_orders c
    where c.id=change_order_id and private.can_manage_project(c.project_id)));

create policy project_budget_role_boundary on public.project_budget_items as restrictive
  for all to authenticated using (private.can_manage_company() and private.can_manage_project(project_id))
  with check (private.can_manage_company() and private.can_manage_project(project_id));

-- Browser-facing legacy RPCs execute with caller permissions and cannot bypass RLS.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('approve_change_order','approve_subcontract_bill','create_subcontract_bill_guard') loop
    execute format('alter function %s security invoker',f.signature);
    execute format('alter function %s set search_path = public',f.signature);
    execute format('revoke all on function %s from public,anon',f.signature);
    execute format('grant execute on function %s to authenticated,service_role',f.signature);
  end loop;
end $$;

-- Existing private financial buckets retain their finer-grained policies, with
-- the same live company boundary. Branding is intentionally public.
create policy company_financial_storage_boundary on storage.objects as restrictive for all to public
  using (bucket_id not in ('expense-attachments','payment-attachments','receipts','worker-receipts')
    or private.can_access_company())
  with check (bucket_id not in ('expense-attachments','payment-attachments','receipts','worker-receipts')
    or private.can_manage_company());

notify pgrst,'reload schema';

create or replace function public.reverse_worker_payment_atomic(
  p_payment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_existing public.worker_payment_reversals%rowtype;
  v_snapshot jsonb;
  v_count integer;
begin
  if coalesce((select auth.jwt())->>'role','') <> 'service_role'
    and not private.can_manage_company() then
    raise exception 'Company administrator access required' using errcode='42501';
  end if;
  if coalesce((select auth.jwt())->>'role', '') <> 'service_role'
    and coalesce((select auth.jwt())->'app_metadata'->>'role', '') <> all(array['owner', 'admin'])
  then
    raise exception using errcode = '42501', message = 'Owner or admin role required.';
  end if;

  if p_payment_id is null or v_key = '' or pg_catalog.length(v_key) > 200 then
    raise exception using
      errcode = '22023',
      message = 'Worker payment reversal idempotency key and payment id are required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hh:worker-payment-reversal:' || p_payment_id::text, 0)
  );

  select reversal.*
  into v_existing
  from public.worker_payment_reversals reversal
  where reversal.idempotency_key = v_key
     or reversal.payment_id = p_payment_id
  order by (reversal.idempotency_key = v_key) desc
  limit 1;

  if found then
    if v_existing.idempotency_key <> v_key or v_existing.payment_id <> p_payment_id then
      raise exception using
        errcode = '23505',
        message = 'Worker payment reversal idempotency key was reused with different content.';
    end if;
    if exists (select 1 from public.worker_payments payment where payment.id = p_payment_id) then
      raise exception using
        errcode = '23514',
        message = 'Existing worker payment reversal is incomplete.';
    end if;
    return pg_catalog.jsonb_build_object('payment_id', p_payment_id, 'reused', true);
  end if;

  select pg_catalog.to_jsonb(payment)
  into v_snapshot
  from public.worker_payments payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Payment not found.';
  end if;

  insert into public.worker_payment_reversals (
    idempotency_key,
    payment_id,
    payment_snapshot
  )
  values (v_key, p_payment_id, v_snapshot);

  delete from public.worker_payments payment
  where payment.id = p_payment_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Worker payment reversal did not delete exactly one payment.';
  end if;

  return pg_catalog.jsonb_build_object('payment_id', p_payment_id, 'reused', false);
end;
$function$;

create or replace function public.delete_ap_bill_draft_atomic(
  p_bill_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_existing public.ap_bill_deletions%rowtype;
  v_bill public.ap_bills%rowtype;
  v_payment_count integer;
  v_count integer;
begin
  if coalesce((select auth.jwt())->>'role','') <> 'service_role'
    and not private.can_manage_company() then
    raise exception 'Company administrator access required' using errcode='42501';
  end if;
  if coalesce((select auth.jwt())->>'role', '') <> 'service_role'
    and coalesce((select auth.jwt())->'app_metadata'->>'role', '') <> all(array['owner', 'admin'])
  then
    raise exception using errcode = '42501', message = 'Owner or admin role required.';
  end if;

  if p_bill_id is null or v_key = '' or pg_catalog.length(v_key) > 200 then
    raise exception using
      errcode = '22023',
      message = 'Draft AP Bill delete idempotency key and bill id are required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hh:ap-bill-delete:' || p_bill_id::text, 0)
  );

  select deletion.*
  into v_existing
  from public.ap_bill_deletions deletion
  where deletion.idempotency_key = v_key
     or deletion.bill_id = p_bill_id
  order by (deletion.idempotency_key = v_key) desc
  limit 1;

  if found then
    if v_existing.idempotency_key <> v_key or v_existing.bill_id <> p_bill_id then
      raise exception using
        errcode = '23505',
        message = 'Draft AP Bill delete idempotency key was reused with different content.';
    end if;
    if exists (select 1 from public.ap_bills bill where bill.id = p_bill_id) then
      raise exception using errcode = '23514', message = 'Existing Draft AP Bill deletion is incomplete.';
    end if;
    return pg_catalog.jsonb_build_object('bill_id', p_bill_id, 'reused', true);
  end if;

  select bill.*
  into v_bill
  from public.ap_bills bill
  where bill.id = p_bill_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Bill not found.';
  end if;
  if v_bill.status <> 'Draft' then
    raise exception using errcode = '23514', message = 'Only Draft bills can be deleted';
  end if;

  perform 1
  from public.ap_bill_payments payment
  where payment.bill_id = p_bill_id
  order by payment.id
  for update;

  select pg_catalog.count(*)
  into v_payment_count
  from public.ap_bill_payments payment
  where payment.bill_id = p_bill_id;
  if v_payment_count > 0 then
    raise exception using errcode = '23514', message = 'Cannot delete a bill with payments';
  end if;

  insert into public.ap_bill_deletions (
    idempotency_key,
    bill_id,
    bill_snapshot
  )
  values (v_key, p_bill_id, pg_catalog.to_jsonb(v_bill));

  delete from public.ap_bills bill
  where bill.id = p_bill_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Draft AP Bill delete did not remove exactly one bill.';
  end if;

  return pg_catalog.jsonb_build_object('bill_id', p_bill_id, 'reused', false);
end;
$function$;
