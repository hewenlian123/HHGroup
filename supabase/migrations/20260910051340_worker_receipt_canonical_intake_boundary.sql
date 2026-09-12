-- T3 E: trusted intake generation. No historical backfill or financial mutation.
set lock_timeout='5s';
set statement_timeout='60s';
alter table public.worker_receipts add column canonical_ingested_at timestamptz;
comment on column public.worker_receipts.canonical_ingested_at is
  'Database-owned authenticated intake marker. NULL means LEGACY_UNVERIFIED/read-only. Never backfill or infer from created_at.';
create unique index worker_receipts_canonical_upload_key on public.worker_receipts(receipt_url)
  where canonical_ingested_at is not null;

create function public.intake_worker_receipt_atomic(p_receipt_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r public.worker_receipts%rowtype;
  w public.workers%rowtype;
  v_worker uuid; v_project uuid; v_amount numeric; v_date date; v_path text;
  v_normal jsonb; v_time timestamptz;
begin
  if auth.uid() is null or not private.can_access_company() or not exists(
    select 1 from auth.users u where u.id=auth.uid() and not coalesce(u.is_anonymous,false)) then
    raise exception 'Authenticated company intake required.' using errcode='42501';
  end if;
  if p_receipt_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('worker_id','worker_name','project_id','amount','expense_type','vendor','description','notes','receipt_date','receipt_url')) then
    raise exception 'Invalid intake fields; marker, lifecycle and created_at are database-owned.' using errcode='22023';
  end if;
  v_worker:=nullif(p_payload->>'worker_id','')::uuid;
  v_project:=nullif(p_payload->>'project_id','')::uuid;
  v_amount:=(p_payload->>'amount')::numeric;
  v_date:=(p_payload->>'receipt_date')::date;
  v_path:=p_payload->>'receipt_url';
  if v_worker is null or v_amount is null or v_amount<0.01 or v_amount>100000
    or v_amount::text in ('NaN','Infinity','-Infinity') or v_date is null
    or v_path is null or v_path !~ ('^uploads/'||p_receipt_id::text||'\.(jpg|png|webp|pdf)$')
    or not private.worker_receipt_upload_exists(v_path) then
    raise exception 'Valid Worker, amount, date and uploaded Receipt identity required.' using errcode='23514';
  end if;
  -- Normalize once after raw validation, before identity comparison and scaled-column storage.
  v_amount:=round(v_amount,2);
  if v_project is not null and not private.can_access_project(v_project) then
    raise exception 'Receipt project is outside authorized scope.' using errcode='42501';
  end if;
  if coalesce(p_payload->>'expense_type','Other') not in
    ('Building Materials','Tools','Food','Food / Meal','Transportation','Supplies','Equipment','Other')
    or length(coalesce(p_payload->>'vendor',''))>160 or length(coalesce(p_payload->>'description',''))>500
    or length(coalesce(p_payload->>'notes',''))>1000 then
    raise exception 'Invalid receipt intake text fields.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hh:worker-receipt-intake:'||p_receipt_id::text,0));
  select * into r from public.worker_receipts where id=p_receipt_id for update;
  select * into w from public.workers where id=v_worker for key share;
  if not found or nullif(btrim(p_payload->>'worker_name'),'') is distinct from w.name then
    raise exception 'Receipt Worker identity mismatch.' using errcode='23514';
  end if;
  v_normal:=jsonb_build_object('worker_id',v_worker,'worker_name',w.name,'project_id',v_project,
    'amount',v_amount,'expense_type',coalesce(p_payload->>'expense_type','Other'),
    'vendor',nullif(btrim(p_payload->>'vendor'),''),'description',nullif(btrim(p_payload->>'description'),''),
    'notes',nullif(btrim(p_payload->>'notes'),''),'receipt_date',v_date,'receipt_url',v_path);
  if r.id is not null then
    if r.canonical_ingested_at is null then raise exception 'LEGACY_UNVERIFIED: receipt is read-only.'; end if;
    if (select jsonb_object_agg(k,v) from jsonb_each(to_jsonb(r)) x(k,v) where v_normal ? k)
      is distinct from v_normal then raise exception 'Receipt intake identity reused with different content.' using errcode='23505'; end if;
    return to_jsonb(r);
  end if;
  -- Reject re-use of a known object; do not infer an association or promote legacy.
  if exists(select 1 from public.worker_receipts x where x.receipt_url=v_path
    or split_part(x.receipt_url,'?',1) like '%/'||v_path) then
    raise exception 'Receipt upload already recorded; do not re-intake historical evidence.' using errcode='23505';
  end if;
  v_time:=clock_timestamp();
  insert into public.worker_receipts(id,worker_id,worker_name,project_id,amount,expense_type,vendor,
    description,notes,receipt_date,receipt_url,status,canonical_ingested_at,created_at)
  values(p_receipt_id,v_worker,w.name,v_project,v_amount,v_normal->>'expense_type',v_normal->>'vendor',
    v_normal->>'description',v_normal->>'notes',v_date,v_path,'Pending',v_time,v_time) returning * into r;
  return to_jsonb(r);
end $$;
alter function public.intake_worker_receipt_atomic(uuid,jsonb) owner to postgres;
revoke all on function public.intake_worker_receipt_atomic(uuid,jsonb) from public,anon,service_role;
grant execute on function public.intake_worker_receipt_atomic(uuid,jsonb) to authenticated;

create function private.is_canonical_worker_obligation(p_id uuid)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.worker_reimbursements o join public.worker_receipts r
   on r.id=o.source_worker_receipt_id and r.reimbursement_id=o.id
   where o.id=p_id and r.canonical_ingested_at is not null and r.status='Approved'
     and r.worker_id is not null and r.worker_id=o.worker_id
     and r.project_id is not distinct from o.project_id and r.amount=o.amount
     and o.amount>0 and o.amount::text not in ('NaN','Infinity','-Infinity'));
$$;
revoke all on function private.is_canonical_worker_obligation(uuid) from public,anon,authenticated,service_role;

create function private.guard_receipt_canonical_boundary()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op<>'INSERT' then
    if old.canonical_ingested_at is null then raise exception 'LEGACY_UNVERIFIED: Receipt is read-only.'; end if;
    if tg_op='DELETE' then raise exception 'Receipt deletion is not an ordinary workflow.'; end if;
    if row(new.id,new.canonical_ingested_at,new.created_at) is distinct from row(old.id,old.canonical_ingested_at,old.created_at) then
      raise exception 'Receipt intake identity and timestamps are immutable.';
    end if;
  elsif current_user<>'postgres' or new.canonical_ingested_at is null or new.status is distinct from 'Pending'
    or new.reimbursement_id is not null or new.created_at is distinct from new.canonical_ingested_at then
    raise exception 'Receipt creation requires authenticated canonical intake.';
  end if;
  if new.worker_id is null or new.amount is null or new.amount<=0
    or new.amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid canonical Receipt Worker or amount.'; end if;
  return new;
end $$;
create trigger receipt_canonical_boundary before insert or update or delete on public.worker_receipts
for each row execute function private.guard_receipt_canonical_boundary();

create function private.guard_obligation_canonical_boundary()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.worker_receipts%rowtype;
begin
  if tg_op<>'INSERT' then
    if not private.is_canonical_worker_obligation(old.id) then raise exception 'LEGACY_UNVERIFIED: obligation is read-only.'; end if;
    if tg_op='DELETE' then raise exception 'Canonical obligation cannot be deleted.'; end if;
    if new.created_at is distinct from old.created_at then raise exception 'Obligation timestamp is immutable.'; end if;
  end if;
  if current_user<>'postgres' then raise exception 'Obligation mutation requires canonical RPC.'; end if;
  select * into r from public.worker_receipts where id=new.source_worker_receipt_id;
  if r.id is null or r.canonical_ingested_at is null or new.worker_id is null or r.worker_id is distinct from new.worker_id
    or r.project_id is distinct from new.project_id or r.amount is distinct from new.amount
    or new.amount is null or new.amount<=0 or new.amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Canonical obligation requires its marked matching Receipt.';
  end if;
  if tg_op='INSERT' and (r.status is distinct from 'Pending' or r.reimbursement_id is not null
    or new.status is distinct from 'pending' or new.payment_id is not null or new.paid_at is not null) then
    raise exception 'Obligation creation requires canonical Receipt approval.';
  end if;
  return new;
end $$;
create trigger obligation_canonical_boundary before insert or update or delete on public.worker_reimbursements
for each row execute function private.guard_obligation_canonical_boundary();

create function private.guard_expense_canonical_boundary()
returns trigger language plpgsql security invoker set search_path='' as $$
declare e public.expenses%rowtype; o public.worker_reimbursements%rowtype;
begin
  if tg_table_name='expense_lines' then
   if tg_op='UPDATE' and new.expense_id is distinct from old.expense_id then
    if exists(select 1 from public.expenses x where x.id in (old.expense_id,new.expense_id)
      and (x.worker_id is not null or x.source='worker_reimbursement' or x.source_type='reimbursement')) then
      raise exception 'Worker Expense lines cannot be reparented.';
    end if;
   end if;
  end if;
  if tg_table_name='expense_lines' then
    select * into e from public.expenses where id=case when tg_op='DELETE' then old.expense_id else new.expense_id end;
  elsif tg_op='INSERT' then e:=new; else e:=old; end if;
  if e.worker_id is null and e.source is distinct from 'worker_reimbursement' and e.source_type is distinct from 'reimbursement' then
    -- A non-worker expense cannot be promoted through ordinary edits either.
    if tg_table_name='expenses' then
      if tg_op='UPDATE' and (new.worker_id is not null or new.source='worker_reimbursement' or new.source_type='reimbursement') then
        raise exception 'Worker reimbursement requires canonical Receipt intake.';
      end if;
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select * into o from public.worker_reimbursements where id::text=e.source_id::text;
  if e.source is distinct from 'worker_reimbursement' or e.source_type is distinct from 'reimbursement'
    or not private.is_canonical_worker_obligation(o.id)
    or e.worker_id is distinct from o.worker_id or e.project_id is distinct from o.project_id
    or e.amount is distinct from o.amount or e.total is distinct from o.amount then
    raise exception 'LEGACY_UNVERIFIED: Worker Expense is read-only.';
  end if;
  if current_user<>'postgres' or tg_op='DELETE' then raise exception 'Worker Expense mutation requires canonical settlement.'; end if;
  if tg_table_name='expense_lines' then
    if new.amount is distinct from o.amount or new.project_id is distinct from o.project_id
      or (tg_op='UPDATE' and to_jsonb(new) is distinct from to_jsonb(old))
      or (tg_op='INSERT' and exists(select 1 from public.expense_lines where expense_id=e.id)) then
      raise exception 'Canonical reimbursement Expense line is immutable.';
    end if;
  else
    if tg_op='UPDATE' and row(new.id,new.worker_id,new.project_id,new.amount,new.total,new.source,new.source_id,new.source_type,new.created_at)
      is distinct from row(old.id,old.worker_id,old.project_id,old.amount,old.total,old.source,old.source_id,old.source_type,old.created_at) then
      raise exception 'Canonical reimbursement Expense identity is immutable.';
    end if;
    if lower(new.status) is not distinct from 'paid' then
      if o.status is distinct from 'paid' or o.payment_id is null then raise exception 'Expense settlement requires canonical payment.'; end if;
    elsif lower(new.status) is distinct from 'approved' then raise exception 'Invalid canonical Expense lifecycle.';
    elsif tg_op='UPDATE' and lower(old.status)='paid' and not exists(
      select 1 from public.worker_payment_reversals where payment_id=o.payment_id) then
      raise exception 'Expense reopen requires trusted reversal evidence.';
    end if;
  end if;
  return new;
end $$;
create trigger expense_canonical_boundary before insert or update or delete on public.expenses
for each row execute function private.guard_expense_canonical_boundary();
create trigger expense_line_canonical_boundary before insert or update or delete on public.expense_lines
for each row execute function private.guard_expense_canonical_boundary();

-- Reuse payment metadata to identify new RPC writes, including labor-only payroll.
-- No extra column and no promotion of old payment/reversal evidence.
create function private.guard_payment_canonical_boundary()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op<>'INSERT' and old.settlement_metadata->>'canonical_boundary' is distinct from 'receipt-v1' then
    raise exception 'LEGACY_UNVERIFIED: worker payment is read-only.';
  end if;
  if current_user<>'postgres' then raise exception 'Worker payment requires canonical RPC.'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.settlement_metadata->>'canonical_boundary' is distinct from 'receipt-v1' then
    raise exception 'New Worker payment requires canonical generation evidence.';
  end if;
  return new;
end $$;
create trigger payment_canonical_boundary before insert or update or delete on public.worker_payments
for each row execute function private.guard_payment_canonical_boundary();

revoke insert,update,delete,truncate on public.worker_reimbursements from public,anon,authenticated,service_role;
revoke insert,delete,truncate on public.worker_receipts from public,anon,authenticated,service_role;
do $$ declare c record; begin
  for c in select attname from pg_attribute where attrelid='public.worker_reimbursements'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke insert (%I),update (%I) on public.worker_reimbursements from public,anon,authenticated,service_role',c.attname,c.attname);
  end loop;
  for c in select attname from pg_attribute where attrelid='public.worker_receipts'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke insert (%I) on public.worker_receipts from public,anon,authenticated,service_role',c.attname);
  end loop;
end $$;
revoke all on function private.guard_receipt_canonical_boundary(),private.guard_obligation_canonical_boundary(),
 private.guard_expense_canonical_boundary(),private.guard_payment_canonical_boundary() from public,anon,authenticated,service_role;

create or replace function public.approve_worker_receipt_atomic(
  p_receipt_id uuid, p_actor_user_id uuid, p_expected_worker_id uuid,
  p_expected_amount numeric, p_expected_project_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.worker_receipts%rowtype;
  o public.worker_reimbursements%rowtype;
  v_company uuid;
  v_reused boolean := false;
begin
  select * into r from public.worker_receipts where id=p_receipt_id for update;
  if not found then raise exception using errcode='P0002',message='Receipt not found.'; end if;
  if r.canonical_ingested_at is null then raise exception 'LEGACY_UNVERIFIED: Receipt approval is blocked.'; end if;
  v_company := private.assert_worker_receipt_approval_actor(p_actor_user_id);
  if (r.status in ('Pending','Approved')) is not true then
    raise exception using errcode='23514',message='Receipt is not approvable.';
  end if;
  p_expected_amount:=round(p_expected_amount,2);
  if r.worker_id is null or r.worker_id is distinct from p_expected_worker_id
    or r.amount is null or r.amount <= 0 or r.amount::text in ('NaN','Infinity','-Infinity')
    or r.amount is distinct from p_expected_amount
    or r.project_id is distinct from p_expected_project_id then
    raise exception using errcode='23514',message='Invalid or changed receipt worker, amount or project.';
  end if;
  perform 1 from public.workers where id=r.worker_id for update;
  if not found then raise exception using errcode='23514',message='Receipt worker not found.'; end if;
  if r.project_id is not null then
    perform 1 from public.projects where id=r.project_id and organization_id=v_company for share;
    if not found then raise exception using errcode='42501',message='Receipt project is outside the company.'; end if;
  end if;
  select * into o from public.worker_reimbursements where source_worker_receipt_id=r.id for update;
  if found then
    if r.status is distinct from 'Approved' or r.reimbursement_id is distinct from o.id
      or o.worker_id is distinct from r.worker_id or o.amount is distinct from r.amount
      or o.project_id is distinct from r.project_id then
      raise exception using errcode='23514',message='HISTORICAL_LINK_CONFLICT';
    end if;
    perform private.validate_worker_reimbursement_sources(array[o.id],r.worker_id);
    v_reused := true;
  else
    if r.status is distinct from 'Pending' or r.reimbursement_id is not null then
      raise exception using errcode='23514',message='HISTORICAL_LINK_CONFLICT';
    end if;
    insert into public.worker_reimbursements
      (source_worker_receipt_id,worker_id,project_id,amount,vendor,description,receipt_url,status,reimbursement_date)
    values (r.id,r.worker_id,r.project_id,r.amount,r.vendor,
      coalesce(nullif(concat_ws(' · ',nullif(r.vendor,''),nullif(r.expense_type,'')),''),r.description),
      r.receipt_url,'pending',(current_timestamp at time zone 'UTC')::date)
    returning * into o;
    update public.worker_receipts set reimbursement_id=o.id,status='Approved',rejection_reason=null
    where id=r.id returning * into r;
    if not found then raise exception using errcode='23514',message='Receipt link failed.'; end if;
  end if;
  return jsonb_build_object('receipt',to_jsonb(r),'obligation',to_jsonb(o),
    'receipt_id',r.id,'reimbursement_id',o.id,'amount',o.amount,'reused',v_reused);
end;
$$;

create or replace function private.validate_worker_reimbursement_sources(p_ids uuid[],p_worker_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare o public.worker_reimbursements%rowtype; v_count integer;
begin
  if p_ids is null or p_worker_id is null or array_position(p_ids,null) is not null then
    raise exception 'Invalid reimbursement identity.';
  end if;
  select count(*) into v_count from public.worker_reimbursements where id=any(p_ids);
  if v_count <> cardinality(p_ids) then raise exception 'Missing reimbursement source.'; end if;
  for o in select * from public.worker_reimbursements where id=any(p_ids) loop
    if not ((o.status is not distinct from 'pending' and o.payment_id is null)
      or (o.status is not distinct from 'paid' and o.payment_id is not null)) then
      raise exception 'Unknown or inconsistent reimbursement lifecycle state.';
    end if;
    if o.status is not distinct from 'paid' and not exists(select 1 from public.worker_payments p
      where p.id=o.payment_id and p.worker_id=o.worker_id and p.settlement_completed_at is not null
        and p.settlement_metadata->>'status'='completed'
        and p.settlement_metadata->'reimbursement_ids' @> jsonb_build_array(o.id)) then
      raise exception 'Settled reimbursement lacks completed payment evidence.';
    end if;
    if o.worker_id is distinct from p_worker_id or o.amount is null or o.amount<=0
      or o.amount::text in ('NaN','Infinity','-Infinity') then
      raise exception using errcode='23514',message='Invalid reimbursement worker or amount.';
    end if;
    if not private.is_canonical_worker_obligation(o.id) then
      raise exception 'LEGACY_UNVERIFIED: payment requires a canonical marked Receipt.';
    end if;
  end loop;
end;
$$;

create or replace function public.record_worker_reimbursement_payment_atomic(
  p_idempotency_key text,
  p_worker_id uuid,
  p_payment_method text,
  p_payment_date date,
  p_note text,
  p_reimbursement_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_ids uuid[] := array[]::uuid[];
  v_fingerprint text;
  v_existing public.worker_payments%rowtype;
  v_payment_id uuid;
  v_total numeric := 0;
  v_count integer := 0;
  v_completed_at timestamptz;
begin
  if v_key = '' or length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Reimbursement idempotency key is required.';
  end if;
  if p_worker_id is null or p_payment_date is null or v_method is null then
    raise exception using errcode = '22023', message = 'Invalid reimbursement payment request.';
  end if;

  select coalesce(array_agg(x.id order by x.id), array[]::uuid[])
  into v_ids
  from (
    select distinct unnest(coalesce(p_reimbursement_ids, array[]::uuid[])) as id
  ) x;
  if cardinality(v_ids) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one reimbursement to pay.';
  end if;
  if cardinality(v_ids) <> cardinality(coalesce(p_reimbursement_ids, array[]::uuid[])) then
    raise exception using errcode = '22023', message = 'Reimbursement IDs must be unique.';
  end if;

  v_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'worker_id', p_worker_id,
      'payment_method', v_method,
      'payment_date', p_payment_date,
      'note', p_note,
      'reimbursement_ids', to_jsonb(v_ids)
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hh:worker-payment-identity:' || v_key, 0)
  );

  perform private.lock_worker_reimbursement_sources(v_ids,p_worker_id);
  perform 1
  from public.workers w
  where w.id = p_worker_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Worker not found.';
  end if;
  -- Reversal retains the original identity permanently; a repay is a new intent.
  if exists(select 1 from public.worker_payment_reversals
    where payment_snapshot->>'idempotency_key'=v_key) then
    raise exception using errcode='23505',message='Payment identity was reversed; use a new payment intent.';
  end if;

  select wp.*
  into v_existing
  from public.worker_payments wp
  where wp.idempotency_key = v_key
  for update;

  if found then
    if v_existing.settlement_metadata->>'canonical_boundary' is distinct from 'receipt-v1' or v_existing.settlement_completed_at is null
      or v_existing.settlement_metadata->>'status' is distinct from 'completed' then
      raise exception using errcode = '23514', message = 'Existing reimbursement idempotency record is incomplete.';
    end if;
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'Reimbursement idempotency key was reused with different content.';
    end if;
    if v_existing.worker_id is distinct from p_worker_id
      or nullif(btrim(coalesce(v_existing.payment_method, '')), '') is distinct from v_method
      or v_existing.payment_date is distinct from p_payment_date
      or coalesce(v_existing.settlement_metadata->>'type', '') <> 'reimbursement_payment'
      or coalesce(v_existing.settlement_metadata->'reimbursement_ids', '[]'::jsonb) is distinct from to_jsonb(v_ids)
    then
      raise exception using errcode = '23514', message = 'Existing completed reimbursement payment no longer matches its request.';
    end if;

    select count(*)
    into v_count
    from public.worker_reimbursements wr
    where wr.id = any(v_ids)
      and wr.worker_id = p_worker_id
      and wr.payment_id = v_existing.id
      and lower(btrim(coalesce(wr.status, ''))) = 'paid'
      and exists (
        select 1
        from public.expenses e
        where e.source = 'worker_reimbursement'
          and e.source_id::text = wr.id::text
          and e.source_type = 'reimbursement'
          and lower(btrim(coalesce(e.status, ''))) = 'paid'
          and e.amount is not distinct from wr.amount
          and (select count(*) from public.expense_lines el where el.expense_id = e.id and el.amount is not distinct from wr.amount) = 1
      );
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'Existing completed reimbursement payment is incomplete.';
    end if;
    if v_existing.total_amount is distinct from (select sum(amount) from public.worker_reimbursements where id=any(v_ids)) then
      raise exception 'Existing payment amount mismatch.';
    end if;
    return jsonb_build_object(
      'payment_id', v_existing.id,
      'updated_count', cardinality(v_ids),
      'reused', true
    );
  end if;




  perform 1
  from public.worker_reimbursements wr
  where wr.id = any(v_ids)
  order by wr.id
  for update;

  select count(*), coalesce(sum(wr.amount), 0)
  into v_count, v_total
  from public.worker_reimbursements wr
  where wr.id = any(v_ids)
    and wr.worker_id = p_worker_id
    and wr.payment_id is null
    and lower(btrim(coalesce(wr.status, ''))) = 'pending'
    and wr.amount > 0;
  if v_count <> cardinality(v_ids) then
    raise exception using
      errcode = '23514',
      message = 'One or more reimbursements are missing, invalid, belong to another worker, or are already settled.';
  end if;

  insert into public.worker_payments (
    worker_id,
    total_amount,
    payment_method,
    note,
    payment_date,
    labor_entry_ids,
    idempotency_key,
    request_fingerprint,
    settlement_metadata
  )
  values (
    p_worker_id,
    v_total,
    v_method,
    nullif(btrim(coalesce(p_note, '')), ''),
    p_payment_date,
    array[]::uuid[],
    v_key,
    v_fingerprint,
    jsonb_build_object('canonical_boundary','receipt-v1',
      'type', 'reimbursement_payment',
      'reimbursement_ids', to_jsonb(v_ids),
      'request_fingerprint', v_fingerprint,
      'status', 'pending'
    )
  )
  returning id into v_payment_id;

  update public.worker_reimbursements
  set
    status = 'paid',
    paid_at = clock_timestamp(),
    payment_id = v_payment_id
  where worker_id = p_worker_id
    and id = any(v_ids)
    and payment_id is null
    and lower(btrim(coalesce(status, ''))) = 'pending';
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'Could not settle every reimbursement.';
  end if;

  v_completed_at := clock_timestamp();
  update public.worker_payments
  set
    settlement_completed_at = v_completed_at,
    settlement_metadata = settlement_metadata || jsonb_build_object(
      'status', 'completed',
      'completed_at', v_completed_at
    )
  where id = v_payment_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Reimbursement payment metadata was not completed.';
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'updated_count', cardinality(v_ids),
    'reused', false
  );
end;
$$;

create or replace function public.record_worker_payroll_settlement(
  p_idempotency_key text,
  p_worker_id uuid,
  p_project_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_notes text,
  p_labor_entry_ids uuid[],
  p_reimbursement_ids uuid[],
  p_advance_ids uuid[],
  p_advance_deduction_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_labor_ids uuid[] := array[]::uuid[];
  v_reimbursement_ids uuid[] := array[]::uuid[];
  v_advance_ids uuid[] := array[]::uuid[];
  v_fingerprint text;
  v_existing public.worker_payments%rowtype;
  v_payment_id uuid;
  v_labor_total numeric := 0;
  v_reimbursement_total numeric := 0;
  v_advance_total numeric := 0;
  v_expected_total numeric := 0;
  v_count integer := 0;
  v_completed_at timestamptz;
begin
  if v_key = '' or length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Payroll idempotency key is required.';
  end if;
  if p_worker_id is null or p_amount is null or p_amount <= 0
    or p_amount::text in ('NaN','Infinity','-Infinity') or p_payment_date is null then
    raise exception using errcode = '22023', message = 'Invalid payroll settlement request.';
  end if;
  if v_method is null then
    raise exception using errcode = '22023', message = 'Payment method is required.';
  end if;
  if p_advance_deduction_amount is null or p_advance_deduction_amount < 0
    or p_advance_deduction_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'Advance deduction must be non-negative.';
  end if;

  -- The same canonical decimal values own retry identity, comparison and persistence.
  p_amount:=round(p_amount,2);
  p_advance_deduction_amount:=round(p_advance_deduction_amount,2);
  if p_amount <= 0 then
    raise exception using errcode='22023',message='Payroll cash amount must round to at least 0.01.';
  end if;

  select coalesce(array_agg(x.id order by x.id), array[]::uuid[])
  into v_labor_ids
  from (
    select distinct unnest(coalesce(p_labor_entry_ids, array[]::uuid[])) as id
  ) x;
  select coalesce(array_agg(x.id order by x.id), array[]::uuid[])
  into v_reimbursement_ids
  from (
    select distinct unnest(coalesce(p_reimbursement_ids, array[]::uuid[])) as id
  ) x;
  select coalesce(array_agg(x.id order by x.id), array[]::uuid[])
  into v_advance_ids
  from (
    select distinct unnest(coalesce(p_advance_ids, array[]::uuid[])) as id
  ) x;

  if cardinality(v_labor_ids) <> cardinality(coalesce(p_labor_entry_ids, array[]::uuid[]))
    or cardinality(v_reimbursement_ids) <> cardinality(coalesce(p_reimbursement_ids, array[]::uuid[]))
    or cardinality(v_advance_ids) <> cardinality(coalesce(p_advance_ids, array[]::uuid[]))
  then
    raise exception using errcode = '22023', message = 'Settlement IDs must be unique.';
  end if;
  v_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'worker_id', p_worker_id,
      'project_id', p_project_id,
      'amount', p_amount,
      'payment_method', v_method,
      'payment_date', p_payment_date,
      'notes', p_notes,
      'labor_entry_ids', to_jsonb(v_labor_ids),
      'reimbursement_ids', to_jsonb(v_reimbursement_ids),
      'advance_ids', to_jsonb(v_advance_ids),
      'advance_deduction_amount', p_advance_deduction_amount
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hh:worker-payment-identity:' || v_key, 0)
  );

  perform private.lock_worker_reimbursement_sources(v_reimbursement_ids,p_worker_id);
  perform 1
  from public.workers w
  where w.id = p_worker_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Worker not found.';
  end if;
  perform 1 from public.labor_entries where id=any(v_labor_ids) order by id for update;
  perform 1 from public.worker_advances where id=any(v_advance_ids) order by id for update;
  -- Reversal retains the original identity permanently; a repay is a new intent.
  if exists(select 1 from public.worker_payment_reversals
    where payment_snapshot->>'idempotency_key'=v_key) then
    raise exception using errcode='23505',message='Payment identity was reversed; use a new payment intent.';
  end if;

  select wp.*
  into v_existing
  from public.worker_payments wp
  where wp.idempotency_key = v_key
  for update;

  if found then
    if v_existing.settlement_metadata->>'canonical_boundary' is distinct from 'receipt-v1' or v_existing.settlement_completed_at is null
      or v_existing.settlement_metadata->>'status' is distinct from 'completed' then
      raise exception using errcode = '23514', message = 'Existing payroll idempotency record is incomplete.';
    end if;
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'Payroll idempotency key was reused with different content.';
    end if;
    if v_existing.worker_id is distinct from p_worker_id
      or v_existing.total_amount is distinct from p_amount
      or nullif(btrim(coalesce(v_existing.payment_method, '')), '') is distinct from v_method
      or v_existing.payment_date is distinct from p_payment_date
      or coalesce(v_existing.labor_entry_ids, array[]::uuid[]) is distinct from v_labor_ids
      or coalesce(v_existing.settlement_metadata->'reimbursement_ids', '[]'::jsonb) is distinct from to_jsonb(v_reimbursement_ids)
      or coalesce(v_existing.settlement_metadata->'advance_ids', '[]'::jsonb) is distinct from to_jsonb(v_advance_ids)
    then
      raise exception using errcode = '23514', message = 'Existing completed payroll settlement no longer matches its request.';
    end if;

    select count(*)
    into v_count
    from public.labor_entries le
    where le.id = any(v_labor_ids)
      and le.worker_id = p_worker_id and (p_project_id is null or le.project_id = p_project_id)
      and le.worker_payment_id = v_existing.id;
    if v_count <> cardinality(v_labor_ids) then
      raise exception using errcode = '23514', message = 'Existing completed payroll settlement has incomplete labor links.';
    end if;

    select count(*)
    into v_count
    from public.worker_reimbursements wr
    where wr.id = any(v_reimbursement_ids)
      and wr.worker_id = p_worker_id and (p_project_id is null or wr.project_id = p_project_id)
      and wr.payment_id = v_existing.id
      and lower(btrim(coalesce(wr.status, ''))) = 'paid';
    if v_count <> cardinality(v_reimbursement_ids) then
      raise exception using errcode = '23514', message = 'Existing completed payroll settlement has incomplete reimbursement links.';
    end if;

    select count(*)
    into v_count
    from public.worker_advances wa
    where wa.id = any(v_advance_ids)
      and wa.worker_id = p_worker_id
      and lower(btrim(coalesce(wa.status, ''))) = 'deducted';
    if v_count <> cardinality(v_advance_ids) then
      raise exception using errcode = '23514', message = 'Existing completed payroll settlement has incomplete advance links.';
    end if;

    return jsonb_build_object('payment_id', v_existing.id, 'reused', true);
  end if;

  if cardinality(v_labor_ids) = 0 and cardinality(v_reimbursement_ids) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one labor entry or reimbursement to pay.';
  end if;




  if cardinality(v_labor_ids) > 0 then
    perform 1
    from public.labor_entries le
    where le.id = any(v_labor_ids)
    order by le.id
    for update;

    select count(*), coalesce(sum(coalesce(le.labor_cost_snapshot, le.amount_snapshot, le.cost_amount, 0)), 0)
    into v_count, v_labor_total
    from public.labor_entries le
    where le.id = any(v_labor_ids)
      and le.worker_id = p_worker_id and (p_project_id is null or le.project_id = p_project_id)
      and le.worker_payment_id is null;
    if v_count <> cardinality(v_labor_ids) then
      raise exception using errcode = '23514', message = 'One or more labor entries are missing, belong to another worker, or are already settled.';
    end if;
  end if;

  if cardinality(v_reimbursement_ids) > 0 then
    perform 1
    from public.worker_reimbursements wr
    where wr.id = any(v_reimbursement_ids)
    order by wr.id
    for update;

    select count(*), coalesce(sum(coalesce(wr.amount, 0)), 0)
    into v_count, v_reimbursement_total
    from public.worker_reimbursements wr
    where wr.id = any(v_reimbursement_ids)
      and wr.worker_id = p_worker_id and (p_project_id is null or wr.project_id = p_project_id)
      and wr.payment_id is null
      and lower(btrim(coalesce(wr.status, ''))) = 'pending';
    if v_count <> cardinality(v_reimbursement_ids) then
      raise exception using errcode = '23514', message = 'One or more reimbursements are missing, belong to another worker, or are already settled.';
    end if;
  end if;

  if cardinality(v_advance_ids) > 0 then
    perform 1
    from public.worker_advances wa
    where wa.id = any(v_advance_ids)
    order by wa.id
    for update;

    select count(*), coalesce(sum(wa.amount), 0)
    into v_count, v_advance_total
    from public.worker_advances wa
    where wa.id = any(v_advance_ids)
      and wa.worker_id = p_worker_id
      and lower(btrim(coalesce(wa.status, ''))) = 'pending';
    if v_count <> cardinality(v_advance_ids) then
      raise exception using errcode = '23514', message = 'One or more advances are missing, belong to another worker, or are not pending.';
    end if;
  end if;

  v_advance_total:=round(v_advance_total,2);
  if v_advance_total is distinct from p_advance_deduction_amount then
    raise exception using errcode = '23514', message = 'Advance deduction must match whole open advance records.';
  end if;

  v_expected_total := round(v_labor_total + v_reimbursement_total,2);
  if v_expected_total is distinct from (p_amount + p_advance_deduction_amount) then
    raise exception using
      errcode = '23514',
      message = pg_catalog.format(
        'Payment amount plus advance deduction must match selected items (expected %s).',
        pg_catalog.to_char(v_expected_total, 'FM999999999990.00')
      );
  end if;

  insert into public.worker_payments (
    worker_id,
    total_amount,
    payment_method,
    note,
    payment_date,
    labor_entry_ids,
    idempotency_key,
    request_fingerprint,
    settlement_metadata
  )
  values (
    p_worker_id,
    p_amount,
    v_method,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_payment_date,
    v_labor_ids,
    v_key,
    v_fingerprint,
    jsonb_build_object('canonical_boundary','receipt-v1',
      'project_id', p_project_id,
      'labor_entry_ids', to_jsonb(v_labor_ids),
      'reimbursement_ids', to_jsonb(v_reimbursement_ids),
      'advance_ids', to_jsonb(v_advance_ids),
      'gross_amount', v_expected_total,
      'cash_amount', p_amount,
      'advance_deduction_amount', p_advance_deduction_amount,
      'request_fingerprint', v_fingerprint,
      'status', 'pending'
    )
  )
  returning id into v_payment_id;

  if cardinality(v_labor_ids) > 0 then
    update public.labor_entries
    set worker_payment_id = v_payment_id
    where worker_id = p_worker_id
      and id = any(v_labor_ids)
      and worker_payment_id is null;
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_labor_ids) then
      raise exception using errcode = '23514', message = 'Could not link all labor entries to payment.';
    end if;
  end if;

  if cardinality(v_reimbursement_ids) > 0 then
    update public.worker_reimbursements
    set
      status = 'paid',
      paid_at = clock_timestamp(),
      payment_id = v_payment_id
    where worker_id = p_worker_id
      and id = any(v_reimbursement_ids)
      and payment_id is null
      and lower(btrim(coalesce(status, ''))) = 'pending';
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_reimbursement_ids) then
      raise exception using errcode = '23514', message = 'Could not settle all reimbursements.';
    end if;
  end if;

  if cardinality(v_advance_ids) > 0 then
    update public.worker_advances
    set status = 'deducted'
    where worker_id = p_worker_id
      and id = any(v_advance_ids)
      and lower(btrim(coalesce(status, ''))) = 'pending';
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_advance_ids) then
      raise exception using errcode = '23514', message = 'Could not deduct all advances.';
    end if;
  end if;

  v_completed_at := clock_timestamp();
  update public.worker_payments
  set
    settlement_completed_at = v_completed_at,
    settlement_metadata = settlement_metadata || jsonb_build_object(
      'status', 'completed',
      'completed_at', v_completed_at
    )
  where id = v_payment_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Payroll settlement metadata was not completed.';
  end if;

  return jsonb_build_object('payment_id', v_payment_id, 'reused', false);
end;
$$;

-- Deferred evidence validation uses the same canonical decimal amounts as the producer.
create or replace function private.check_worker_reimbursement_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.worker_reimbursements%rowtype; p public.worker_payments%rowtype;
begin
  select * into o from public.worker_reimbursements where id=new.id;
  if not found then return null; end if;
  if (o.status in ('pending','approved','paid','reimbursed','settled')) is not true then
    raise exception 'Unknown reimbursement lifecycle state.';
  end if;
  if lower(btrim(coalesce(o.status,''))) in ('reimbursed','settled') then
    if tg_op='INSERT' or old.status is distinct from new.status then
      raise exception 'Use the payment transaction to settle reimbursement.';
    end if;
    return null;
  end if;
  if o.payment_id is null and lower(btrim(coalesce(o.status,''))) <> 'paid' then
    if tg_op='UPDATE' and old.payment_id is not null
      and exists(select 1 from public.worker_payments where id=old.payment_id) then
      raise exception 'Payment must be reversed before reopening its obligation.';
    end if;
    return null;
  end if;
  if tg_op='UPDATE' and old.payment_id is not distinct from new.payment_id
    and old.status is not distinct from new.status then return null; end if;
  select * into p from public.worker_payments where id=o.payment_id;
  if p.id is null or o.status is distinct from 'paid' or p.worker_id is distinct from o.worker_id
    or nullif(btrim(p.idempotency_key),'') is null or nullif(btrim(p.request_fingerprint),'') is null or p.settlement_completed_at is null
    or p.settlement_metadata->>'status' is distinct from 'completed'
    or not coalesce(p.settlement_metadata->'reimbursement_ids' @> jsonb_build_array(o.id),false)
    or p.total_amount is null or p.total_amount<=0 or p.total_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='23514',message='Reimbursement payment evidence is incomplete.';
  end if;
  perform private.validate_worker_reimbursement_sources(array[o.id],o.worker_id);
  -- RPCs lock sources first. Direct transitions must pass the same source check.
  -- No locks here: receipt-derived identity is immutable; completed RPC metadata is required.
  if o.source_worker_receipt_id is not null and not exists(select 1 from public.worker_receipts r
    where r.id=o.source_worker_receipt_id and r.status='Approved' and r.reimbursement_id=o.id
      and r.worker_id=o.worker_id and r.amount=o.amount) then raise exception 'Invalid receipt payment source.'; end if;
  if p.settlement_metadata->>'type'='reimbursement_payment' then
    if p.total_amount is distinct from (select sum(amount) from public.worker_reimbursements where payment_id=p.id)
      or coalesce(cardinality(p.labor_entry_ids),0)<>0 then
      raise exception 'Reimbursement payment total does not match obligations.';
    end if;
  elsif not (p.settlement_metadata ? 'type')
    and p.settlement_metadata ?& array['gross_amount','cash_amount','advance_deduction_amount','advance_ids','labor_entry_ids'] then
    if (p.settlement_metadata->>'cash_amount')::numeric is distinct from p.total_amount
      or (p.settlement_metadata->>'gross_amount')::numeric is distinct from
        round(coalesce((select sum(amount) from public.worker_reimbursements where payment_id=p.id),0)
        + coalesce((select sum(coalesce(labor_cost_snapshot,amount_snapshot,cost_amount,0))
          from public.labor_entries where worker_payment_id=p.id and worker_id=p.worker_id),0),2)
      or (p.settlement_metadata->>'advance_deduction_amount')::numeric is null
      or (p.settlement_metadata->>'advance_deduction_amount')::numeric<0
      or (p.settlement_metadata->>'advance_deduction_amount')::text in ('NaN','Infinity','-Infinity')
      or (p.settlement_metadata->>'gross_amount')::numeric is distinct from
        (p.total_amount+(p.settlement_metadata->>'advance_deduction_amount')::numeric)
      or (p.settlement_metadata->>'advance_deduction_amount')::numeric is distinct from round(coalesce((select sum(a.amount)
        from public.worker_advances a where a.worker_id=p.worker_id and lower(btrim(a.status))='deducted'
          and a.id::text in (select jsonb_array_elements_text(p.settlement_metadata->'advance_ids'))),0),2) then
      raise exception 'Payroll reimbursement payment amounts do not reconcile.';
    end if;
  else
    raise exception 'Unknown reimbursement payment settlement identity.';
  end if;
  return null;
end;
$$;

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
  v_ids uuid[];
  v_worker uuid;
  v_locked_snapshot jsonb;
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
    if v_existing.payment_snapshot->'settlement_metadata'->>'canonical_boundary' is distinct from 'receipt-v1' then
      raise exception 'LEGACY_UNVERIFIED: reversal replay is read-only.';
    end if;
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
  where payment.id = p_payment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Payment not found.';
  end if;

  if v_snapshot->'settlement_metadata'->>'canonical_boundary' is distinct from 'receipt-v1' then
    raise exception 'LEGACY_UNVERIFIED: reversal is blocked.';
  end if;
  -- ponytail: block advance reversals until per-advance restoration has verified lifecycle evidence.
  if coalesce(v_snapshot->'settlement_metadata'->'advance_ids','[]'::jsonb) is distinct from '[]'::jsonb
    or coalesce((v_snapshot->'settlement_metadata'->>'advance_deduction_amount')::numeric,0) <> 0 then
    raise exception using errcode='23514',
      message='Payroll payment with advances cannot be reversed until per-advance restoration is supported.';
  end if;
  -- Same identity lock in payment, payroll and reversal closes delete/reinsert races.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'hh:worker-payment-identity:' || coalesce(v_snapshot->>'idempotency_key',''),0));
  v_worker := (v_snapshot->>'worker_id')::uuid;
  if v_worker is null or v_snapshot->>'settlement_completed_at' is null
    or v_snapshot->'settlement_metadata'->>'status' is distinct from 'completed'
    or nullif(btrim(v_snapshot->>'idempotency_key'),'') is null
    or nullif(btrim(v_snapshot->>'request_fingerprint'),'') is null then
    raise exception 'Cannot reverse unknown or incomplete payment lifecycle state.';
  end if;
  select coalesce(array_agg(id order by id),array[]::uuid[]) into v_ids
  from public.worker_reimbursements where payment_id=p_payment_id;
  perform private.lock_worker_reimbursement_sources(v_ids,v_worker);
  perform 1 from public.workers where id=v_worker for update;
  perform 1 from public.labor_entries
    where worker_payment_id=p_payment_id or id in
      (select jsonb_array_elements_text(coalesce(v_snapshot->'labor_entry_ids','[]'))::uuid)
    order by id for update;
  perform 1 from public.worker_advances where id in
    (select jsonb_array_elements_text(coalesce(v_snapshot->'settlement_metadata'->'advance_ids','[]'))::uuid)
    order by id for update;
  select to_jsonb(p) into v_locked_snapshot from public.worker_payments p
    where id=p_payment_id for update;
  if v_locked_snapshot is distinct from v_snapshot then
    raise exception 'Payment changed while acquiring canonical locks.';
  end if;
  if to_jsonb(v_ids) is distinct from (select coalesce(jsonb_agg(x order by x),'[]'::jsonb)
    from jsonb_array_elements_text(v_snapshot->'settlement_metadata'->'reimbursement_ids') x)
    or exists(select 1 from public.worker_reimbursements where id=any(v_ids)
      and (status is distinct from 'paid' or worker_id is distinct from v_worker)) then
    raise exception 'Payment reimbursement evidence does not match its obligations.';
  end if;

  insert into public.worker_payment_reversals (
    idempotency_key,
    payment_id,
    payment_snapshot
  )
  values (v_key, p_payment_id, v_snapshot);

  -- Only the trusted reversal of this exact live payment may reopen its Expense.
  -- The existing ledger stores the original payment ID, key, metadata and actor.
  select count(*) into v_count from public.expenses e
    where e.source='worker_reimbursement' and e.source_id::text=any(select x::text from unnest(v_ids) x)
      and e.status='paid';
  if v_count <> cardinality(v_ids) then raise exception 'Missing paid Expense reversal evidence.'; end if;
  update public.expenses e set status='approved'
    where e.source='worker_reimbursement' and e.source_id::text=any(select x::text from unnest(v_ids) x)
      and e.status='paid';

  delete from public.worker_payments payment
  where payment.id = p_payment_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Worker payment reversal did not delete exactly one payment.';
  end if;

  return pg_catalog.jsonb_build_object('payment_id', p_payment_id, 'reused', false);
end;
$function$;

-- Privileged RPCs provide a narrow write boundary; keep existing actor checks and
-- service-only payment EXECUTE grants. Do not rely on caller-set GUC flags.

notify pgrst,'reload schema';
