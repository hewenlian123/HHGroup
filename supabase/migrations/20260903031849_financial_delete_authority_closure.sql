-- Financial destructive authority closure.
-- Direct table deletion is denied to every API role; the two audited RPCs are
-- the only supported deletion paths. No business rows are changed here.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $preflight$
declare
  worker_policy_names text[];
  ap_policy_names text[];
begin
  select pg_catalog.array_agg(p.policyname::text order by p.policyname)
  into worker_policy_names
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'worker_payments'
    and p.cmd = any(array['DELETE', 'ALL']);

  if worker_policy_names is distinct from array[
      'phase3a_worker_payments_authenticated_delete',
      'phase3b1_worker_payments_authenticated_delete',
      'worker_payments_authenticated_delete'
    ]
    and worker_policy_names is distinct from array[
      'allow authenticated delete',
      'phase3a_worker_payments_authenticated_delete',
      'phase3b1_worker_payments_authenticated_delete',
      'worker_payments_authenticated_delete'
    ]
  then
    raise exception using
      errcode = 'P0001',
      message = 'worker_payments destructive policy fingerprint differs from the audited catalog';
  end if;

  select pg_catalog.array_agg(p.policyname::text order by p.policyname)
  into ap_policy_names
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'ap_bills'
    and p.cmd = any(array['DELETE', 'ALL']);

  if ap_policy_names is distinct from array['financial_owner_admin_ap_bills'] then
    raise exception using
      errcode = 'P0001',
      message = 'ap_bills destructive policy fingerprint differs from the audited catalog';
  end if;

  if not pg_catalog.has_table_privilege('authenticated', 'public.worker_payments', 'DELETE')
    or not pg_catalog.has_table_privilege('service_role', 'public.worker_payments', 'DELETE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.ap_bills', 'DELETE')
    or not pg_catalog.has_table_privilege('service_role', 'public.ap_bills', 'DELETE')
  then
    raise exception using
      errcode = 'P0001',
      message = 'financial destructive table privileges differ from the audited catalog';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = any(array[
      'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
      'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure,
      'public.fn_worker_payments_before_delete()'::regprocedure
    ])
      and (
        p.prosecdef
        or p.proowner <> 'postgres'::regrole
        or p.proconfig is distinct from array['search_path=""']::text[]
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'financial destructive function fingerprint differs from the audited catalog';
  end if;
end;
$preflight$;

-- Preserve the exact audited predecessor variant for the reviewed emergency
-- rollback. The marker has no API execution privilege and carries no business data.
do $capture_predecessor$
declare
  worker_policy_count integer;
begin
  select pg_catalog.count(*)::integer
  into worker_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'worker_payments'
    and p.cmd = any(array['DELETE', 'ALL']);

  execute pg_catalog.format(
    'create or replace function public.financial_delete_authority_predecessor_worker_policy_count() returns integer language sql immutable security invoker set search_path = '''' as $marker$ select %s::integer $marker$',
    worker_policy_count
  );
end;
$capture_predecessor$;

alter function public.financial_delete_authority_predecessor_worker_policy_count()
owner to postgres;
revoke all on function public.financial_delete_authority_predecessor_worker_policy_count()
from public, anon, authenticated, service_role;

revoke all on table public.worker_payments, public.ap_bills from public, anon;
revoke delete on table public.worker_payments, public.ap_bills from authenticated, service_role;
grant select, insert, update on table public.worker_payments, public.ap_bills to authenticated, service_role;

do $block$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array['worker_payments', 'ap_bills'])
      and cmd = any(array['DELETE', 'ALL'])
  loop
    execute pg_catalog.format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$block$;

create policy financial_owner_admin_ap_bills_select
on public.ap_bills
as permissive
for select
to authenticated
using ((select public.is_owner_or_admin()));

create policy financial_owner_admin_ap_bills_insert
on public.ap_bills
as permissive
for insert
to authenticated
with check ((select public.is_owner_or_admin()));

create policy financial_owner_admin_ap_bills_update
on public.ap_bills
as permissive
for update
to authenticated
using ((select public.is_owner_or_admin()))
with check ((select public.is_owner_or_admin()));

-- These ledgers are implementation details of the privileged RPCs. Direct
-- writes could poison idempotent replay, so no API role may access them.
revoke all on table public.worker_payment_reversals, public.ap_bill_deletions
from public, anon, authenticated, service_role;

drop policy if exists worker_payment_reversals_owner_admin on public.worker_payment_reversals;
drop policy if exists ap_bill_deletions_owner_admin on public.ap_bill_deletions;

create or replace function public.fn_worker_payments_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.worker_reimbursements
  set
    status = 'pending',
    paid_at = null,
    payment_id = null
  where payment_id = old.id;

  update public.labor_entries
  set
    worker_payment_id = null,
    status = case
      when pg_catalog.lower(pg_catalog.btrim(coalesce(status, ''))) = 'paid'
        then 'Approved'
      else status
    end
  where worker_payment_id = old.id;

  if old.labor_entry_ids is not null
    and coalesce(pg_catalog.cardinality(old.labor_entry_ids), 0) > 0
  then
    update public.labor_entries labor
    set status = 'Approved'
    where labor.worker_id = old.worker_id
      and labor.id = any(old.labor_entry_ids)
      and pg_catalog.lower(pg_catalog.btrim(coalesce(labor.status, ''))) = 'paid';
  end if;

  return old;
end;
$function$;

alter function public.fn_worker_payments_before_delete() owner to postgres;
revoke all on function public.fn_worker_payments_before_delete()
from public, anon, authenticated, service_role;

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

alter function public.reverse_worker_payment_atomic(uuid, text) owner to postgres;
revoke all on function public.reverse_worker_payment_atomic(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.reverse_worker_payment_atomic(uuid, text)
to authenticated, service_role;

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

alter function public.delete_ap_bill_draft_atomic(uuid, text) owner to postgres;
revoke all on function public.delete_ap_bill_draft_atomic(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.delete_ap_bill_draft_atomic(uuid, text)
to authenticated, service_role;

comment on function public.fn_worker_payments_before_delete()
  is 'Internal SECURITY DEFINER trigger authority for same-transaction worker payment reversal only; no API role can execute it directly.';
comment on function public.reverse_worker_payment_atomic(uuid, text)
  is 'Only authorized atomic and idempotent worker-payment deletion path; direct table DELETE is denied to API roles.';
comment on function public.delete_ap_bill_draft_atomic(uuid, text)
  is 'Only authorized atomic Draft AP Bill deletion path; direct table DELETE is denied to API roles.';

notify pgrst, 'reload schema';
