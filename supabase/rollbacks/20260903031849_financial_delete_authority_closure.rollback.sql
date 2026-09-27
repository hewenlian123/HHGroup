-- Manual emergency rollback for 20260903031849_financial_delete_authority_closure.sql.
--
-- This restores the immediately preceding authenticated/service-role delete
-- posture only. It deliberately never restores anonymous table or RPC access.
-- Run only in a reviewed transaction and either COMMIT or ROLLBACK explicitly.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $guard$
begin
  if current_setting('hh.rollback_confirmation', true)
       is distinct from 'ROLLBACK_FINANCIAL_DELETE_AUTHORITY_CLOSURE_20260903031849' then
    raise exception 'set hh.rollback_confirmation before running this rollback';
  end if;

  if to_regclass('public.worker_payments') is null
     or to_regclass('public.ap_bills') is null
     or to_regprocedure('public.fn_worker_payments_before_delete()') is null
     or to_regprocedure('public.reverse_worker_payment_atomic(uuid,text)') is null
     or to_regprocedure('public.delete_ap_bill_draft_atomic(uuid,text)') is null
     or to_regprocedure('public.financial_delete_authority_predecessor_worker_policy_count()') is null then
    raise exception 'financial delete authority rollback requires the forward schema objects';
  end if;

  if exists (
    select 1
    from unnest(array['public.worker_payments'::regclass, 'public.ap_bills'::regclass]) as target_table
    where has_table_privilege('authenticated', target_table, 'DELETE')
       or has_table_privilege('service_role', target_table, 'DELETE')
       or has_table_privilege('anon', target_table, 'DELETE')
  ) then
    raise exception 'financial delete authority rollback stopped: direct DELETE closure is not present';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('worker_payments', 'ap_bills')
      and cmd in ('DELETE', 'ALL')
      and roles && array['public', 'anon', 'authenticated']::name[]
  ) then
    raise exception 'financial delete authority rollback stopped: delete-capable API policy is present';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid in (
      'public.fn_worker_payments_before_delete()'::regprocedure,
      'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
      'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
    )
      and not prosecdef
  ) then
    raise exception 'financial delete authority rollback stopped: SECURITY DEFINER forward state is not present';
  end if;

  if public.financial_delete_authority_predecessor_worker_policy_count() not in (3, 4) then
    raise exception 'financial delete authority rollback stopped: predecessor policy marker is invalid';
  end if;
end
$guard$;

-- Restore the prior API-role delete grants without restoring any anonymous access.
grant delete on table public.worker_payments, public.ap_bills to authenticated, service_role;

create policy phase3a_worker_payments_authenticated_delete
on public.worker_payments
as permissive
for delete
to authenticated
using (true);

create policy phase3b1_worker_payments_authenticated_delete
on public.worker_payments
as permissive
for delete
to authenticated
using (true);

create policy worker_payments_authenticated_delete
on public.worker_payments
as permissive
for delete
to authenticated
using (true);

do $restore_worker_policy_variant$
begin
  if public.financial_delete_authority_predecessor_worker_policy_count() = 4 then
    execute 'create policy "allow authenticated delete" on public.worker_payments as permissive for delete to authenticated using (true)';
  end if;
end
$restore_worker_policy_variant$;

drop policy if exists financial_owner_admin_ap_bills_select on public.ap_bills;
drop policy if exists financial_owner_admin_ap_bills_insert on public.ap_bills;
drop policy if exists financial_owner_admin_ap_bills_update on public.ap_bills;

create policy financial_owner_admin_ap_bills
on public.ap_bills
as permissive
for all
to authenticated
using ((select public.is_owner_or_admin()))
with check ((select public.is_owner_or_admin()));

-- Restore the exact predecessor routine definitions, including its invoker
-- authorization semantics. The ACLs remain exact: anon is never granted EXECUTE.
create or replace function public.fn_worker_payments_before_delete()
returns trigger
language plpgsql
security invoker
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

create or replace function public.reverse_worker_payment_atomic(
  p_payment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_existing public.worker_payment_reversals%rowtype;
  v_snapshot jsonb;
  v_count integer;
begin
  if current_user not in ('postgres', 'service_role')
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
security invoker
set search_path = ''
as $function$
declare
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_existing public.ap_bill_deletions%rowtype;
  v_bill public.ap_bills%rowtype;
  v_payment_count integer;
  v_count integer;
begin
  if current_user not in ('postgres', 'service_role')
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

alter function public.fn_worker_payments_before_delete() owner to postgres;
alter function public.reverse_worker_payment_atomic(uuid, text) owner to postgres;
alter function public.delete_ap_bill_draft_atomic(uuid, text) owner to postgres;
revoke all on function public.fn_worker_payments_before_delete()
from public, anon, authenticated, service_role;
revoke all on function public.reverse_worker_payment_atomic(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.delete_ap_bill_draft_atomic(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.reverse_worker_payment_atomic(uuid, text)
to authenticated, service_role;
grant execute on function public.delete_ap_bill_draft_atomic(uuid, text)
to authenticated, service_role;

-- SECURITY INVOKER routines need their prior replay-ledger access restored.
revoke all on table public.worker_payment_reversals, public.ap_bill_deletions from public, anon;
grant select, insert on table public.worker_payment_reversals to authenticated, service_role;
grant select, insert on table public.ap_bill_deletions to authenticated, service_role;

create policy worker_payment_reversals_owner_admin
on public.worker_payment_reversals
as permissive
for all
to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
)
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
);

create policy ap_bill_deletions_owner_admin
on public.ap_bill_deletions
as permissive
for all
to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
)
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
);

comment on function public.fn_worker_payments_before_delete() is null;
comment on function public.reverse_worker_payment_atomic(uuid, text)
  is 'Atomically and idempotently deletes a worker payment; the existing delete trigger reverses labor and reimbursements in the same transaction.';
comment on function public.delete_ap_bill_draft_atomic(uuid, text)
  is 'Atomically and idempotently deletes a Draft AP Bill only after a fail-closed locked payment dependency check.';

do $verify_predecessor_variant$
declare
  expected_count integer := public.financial_delete_authority_predecessor_worker_policy_count();
  actual_count integer;
begin
  select pg_catalog.count(*)::integer
  into actual_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'worker_payments'
    and p.cmd = 'DELETE'
    and 'authenticated' = any(p.roles);

  if actual_count <> expected_count then
    raise exception 'financial delete authority rollback did not restore the exact predecessor policy variant';
  end if;
end
$verify_predecessor_variant$;

drop function public.financial_delete_authority_predecessor_worker_policy_count();

do $verify$
begin
  if exists (
    select 1
    from unnest(array['public.worker_payments'::regclass, 'public.ap_bills'::regclass]) as target_table
    where has_table_privilege('anon', target_table, 'SELECT')
       or has_table_privilege('anon', target_table, 'INSERT')
       or has_table_privilege('anon', target_table, 'UPDATE')
       or has_table_privilege('anon', target_table, 'DELETE')
  ) then
    raise exception 'financial delete authority rollback must not restore anonymous CRUD';
  end if;

  if not has_table_privilege('authenticated', 'public.worker_payments', 'DELETE')
     or not has_table_privilege('authenticated', 'public.ap_bills', 'DELETE')
     or not has_table_privilege('service_role', 'public.worker_payments', 'DELETE')
     or not has_table_privilege('service_role', 'public.ap_bills', 'DELETE') then
    raise exception 'financial delete authority rollback did not restore API-role DELETE';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid in (
      'public.fn_worker_payments_before_delete()'::regprocedure,
      'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
      'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
    )
      and prosecdef
  ) then
    raise exception 'financial delete authority rollback did not restore SECURITY INVOKER routines';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

-- Intentionally no COMMIT. Inspect the above verification and explicitly
-- COMMIT to retain this emergency rollback or ROLLBACK to leave no change.
