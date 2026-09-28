set lock_timeout = '5s';
set statement_timeout = '60s';

-- P0: remove anonymous Operations access and retain the existing owner/admin role model.
do $policy_cleanup$
declare
  policy_row record;
begin
  for policy_row in
    select p.tablename, p.policyname
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array['project_tasks', 'punch_list', 'site_photos', 'inspection_log'])
      and p.roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end;
$policy_cleanup$;

revoke all on table
  public.project_tasks,
  public.punch_list,
  public.site_photos,
  public.inspection_log
from public, anon;

revoke truncate, references, trigger on table
  public.project_tasks,
  public.punch_list,
  public.site_photos,
  public.inspection_log
from authenticated;

grant select, insert, update, delete on table
  public.project_tasks,
  public.punch_list,
  public.site_photos,
  public.inspection_log
to authenticated;

alter table public.project_tasks enable row level security;
alter table public.punch_list enable row level security;
alter table public.site_photos enable row level security;
alter table public.inspection_log enable row level security;

create policy operations_owner_admin_project_tasks
on public.project_tasks
as permissive
for all
to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
)
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
);

create policy operations_owner_admin_punch_list
on public.punch_list
as permissive
for all
to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
)
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
);

create policy operations_owner_admin_site_photos
on public.site_photos
as permissive
for all
to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
)
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
);

create policy operations_owner_admin_inspection_log
on public.inspection_log
as permissive
for all
to authenticated
using (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
)
with check (
  coalesce((select auth.jwt())->'app_metadata'->>'role', '') = any(array['owner', 'admin'])
);

-- P0: preserve subcontract payment behavior while removing SECURITY DEFINER bypass.
create or replace function public.record_subcontract_payment(
  p_subcontract_id uuid,
  p_bill_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_bill_amount numeric;
  v_total_payments numeric;
begin
  if current_user not in ('postgres', 'service_role')
    and coalesce((select auth.jwt())->'app_metadata'->>'role', '') <> all(array['owner', 'admin'])
  then
    raise exception using errcode = '42501', message = 'Owner or admin role required.';
  end if;

  insert into public.subcontract_payments (
    subcontract_id,
    bill_id,
    payment_date,
    amount,
    method,
    note
  )
  values (
    p_subcontract_id,
    p_bill_id,
    p_payment_date,
    p_amount,
    p_method,
    p_note
  );

  if p_bill_id is not null then
    select bill.amount
    into v_bill_amount
    from public.subcontract_bills bill
    where bill.id = p_bill_id
    for update;

    if v_bill_amount is not null then
      select coalesce(pg_catalog.sum(payment.amount), 0)
      into v_total_payments
      from public.subcontract_payments payment
      where payment.bill_id = p_bill_id;

      if v_total_payments >= v_bill_amount then
        update public.subcontract_bills
        set status = 'Paid'
        where id = p_bill_id;
      elsif v_total_payments > 0 then
        update public.subcontract_bills
        set status = 'Partial'
        where id = p_bill_id
          and status <> 'Void';
      end if;
    end if;
  end if;
end;
$function$;

revoke all on function public.record_subcontract_payment(uuid, uuid, date, numeric, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.record_subcontract_payment(uuid, uuid, date, numeric, text, text)
to authenticated, service_role;

-- Durable replay ledgers let a client reconcile an ambiguous DELETE response without
-- reapplying financial mutations. Neither ledger can be updated or deleted through the API.
create table if not exists public.worker_payment_reversals (
  idempotency_key text primary key,
  payment_id uuid not null unique,
  payment_snapshot jsonb not null,
  reversed_at timestamptz not null default pg_catalog.clock_timestamp(),
  reversed_by uuid default auth.uid(),
  constraint worker_payment_reversals_key_check
    check (pg_catalog.length(pg_catalog.btrim(idempotency_key)) between 1 and 200)
);

alter table public.worker_payment_reversals enable row level security;
revoke all on table public.worker_payment_reversals from public, anon, authenticated;
grant select, insert on table public.worker_payment_reversals to authenticated;
grant select, insert on table public.worker_payment_reversals to service_role;

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

create table if not exists public.ap_bill_deletions (
  idempotency_key text primary key,
  bill_id uuid not null unique,
  bill_snapshot jsonb not null,
  deleted_at timestamptz not null default pg_catalog.clock_timestamp(),
  deleted_by uuid default auth.uid(),
  constraint ap_bill_deletions_key_check
    check (pg_catalog.length(pg_catalog.btrim(idempotency_key)) between 1 and 200)
);

alter table public.ap_bill_deletions enable row level security;
revoke all on table public.ap_bill_deletions from public, anon, authenticated;
grant select, insert on table public.ap_bill_deletions to authenticated;
grant select, insert on table public.ap_bill_deletions to service_role;

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

-- The trigger remains the authority for the existing reversal semantics. Running as
-- the deleting caller makes every dependency mutation honor that caller's RLS identity.
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

revoke all on function public.fn_worker_payments_before_delete()
from public, anon, authenticated, service_role;

drop trigger if exists trg_worker_payments_before_delete on public.worker_payments;
create trigger trg_worker_payments_before_delete
before delete on public.worker_payments
for each row
execute function public.fn_worker_payments_before_delete();

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

revoke all on function public.delete_ap_bill_draft_atomic(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.delete_ap_bill_draft_atomic(uuid, text)
to authenticated, service_role;

comment on function public.record_subcontract_payment(uuid, uuid, date, numeric, text, text)
  is 'Records a subcontract payment as the authenticated caller and updates the existing bill status semantics without RLS bypass.';
comment on function public.reverse_worker_payment_atomic(uuid, text)
  is 'Atomically and idempotently deletes a worker payment; the existing delete trigger reverses labor and reimbursements in the same transaction.';
comment on function public.delete_ap_bill_draft_atomic(uuid, text)
  is 'Atomically and idempotently deletes a Draft AP Bill only after a fail-closed locked payment dependency check.';

notify pgrst, 'reload schema';
