-- T3 C: retain existing payment algorithms; validate and lock provenance in both RPCs.
set lock_timeout = '5s';
set statement_timeout = '60s';

create function private.validate_worker_reimbursement_sources(p_ids uuid[],p_worker_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare o public.worker_reimbursements%rowtype; v_count integer;
begin
  select count(*) into v_count from public.worker_reimbursements where id=any(p_ids);
  if v_count <> cardinality(p_ids) then raise exception 'Missing reimbursement source.'; end if;
  for o in select * from public.worker_reimbursements where id=any(p_ids) loop
    if o.worker_id is distinct from p_worker_id or o.amount is null or o.amount<=0
      or o.amount::text in ('NaN','Infinity','-Infinity') then
      raise exception using errcode='23514',message='Invalid reimbursement worker or amount.';
    end if;
    if o.source_worker_receipt_id is not null then
      if not exists(select 1 from public.worker_receipts r
        where r.id=o.source_worker_receipt_id and r.reimbursement_id=o.id and r.status='Approved'
          and r.worker_id=o.worker_id and r.amount=o.amount and r.project_id is not distinct from o.project_id) then
        raise exception using errcode='23514',message='Reimbursement requires its matching Approved Receipt.';
      end if;
    elsif exists(select 1 from public.worker_receipts r where r.reimbursement_id=o.id) then
      -- Explicit pre-migration reverse link; validate without backfilling/reclassifying it.
      if not exists(select 1 from public.worker_receipts r where r.reimbursement_id=o.id
        and r.status='Approved' and r.worker_id=o.worker_id and r.amount=o.amount
        and r.project_id is not distinct from o.project_id) then
        raise exception using errcode='23514',message='Legacy receipt provenance mismatch.';
      end if;
    else
      -- NULL alone is never authority. The existing Expense bridge writes this explicit link.
      select count(*) into v_count from public.expenses e
      where e.source='worker_reimbursement' and e.source_id::text=o.id::text;
      if v_count<>1 or not exists(select 1 from public.expenses e
        where e.source='worker_reimbursement' and e.source_id::text=o.id::text
          and e.source_type='reimbursement' and lower(e.status) in ('approved','paid')
          and (lower(e.status)='approved' or o.payment_id is not null)
          and e.worker_id=o.worker_id and e.project_id is not distinct from o.project_id
          and e.amount=o.amount and e.total=o.amount
          and (select count(*) from public.expense_lines el where el.expense_id=e.id)=1
          and exists(select 1 from public.expense_lines el where el.expense_id=e.id
            and el.amount=o.amount and el.project_id is not distinct from o.project_id)) then
        raise exception using errcode='23514',message='Non-receipt reimbursement requires one matching approved Expense source.';
      end if;
    end if;
  end loop;
end;
$$;
revoke all on function private.validate_worker_reimbursement_sources(uuid[],uuid) from public,anon,authenticated;
grant execute on function private.validate_worker_reimbursement_sources(uuid[],uuid) to service_role;

create function private.lock_worker_reimbursement_sources(p_ids uuid[], p_worker_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare o public.worker_reimbursements%rowtype; v_count integer;
begin
  if coalesce(cardinality(p_ids),0)=0 then return; end if;
  -- Consistent lock order: receipt / Expense source, worker, obligations. No source writes.
  perform 1 from public.worker_receipts r where r.reimbursement_id=any(p_ids)
    or r.id in (select source_worker_receipt_id from public.worker_reimbursements where id=any(p_ids))
    order by r.id for update;
  perform 1 from public.expenses e where e.source='worker_reimbursement'
    and e.source_id::text=any(select x::text from unnest(p_ids) x) order by e.id for update;
  perform 1 from public.workers where id=p_worker_id for update;
  perform 1 from public.worker_reimbursements where id=any(p_ids) order by id for update;
  perform private.validate_worker_reimbursement_sources(p_ids,p_worker_id);
end;
$$;
revoke all on function private.lock_worker_reimbursement_sources(uuid[],uuid) from public,anon,authenticated;
grant execute on function private.lock_worker_reimbursement_sources(uuid[],uuid) to service_role;

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
security invoker
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
    pg_catalog.hashtextextended('hh:worker-reimbursement:' || v_key, 0)
  );

  select wp.*
  into v_existing
  from public.worker_payments wp
  where wp.idempotency_key = v_key
  for update;

  if found then
    perform private.lock_worker_reimbursement_sources(v_ids,p_worker_id);
    if v_existing.settlement_completed_at is null then
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

  perform private.lock_worker_reimbursement_sources(v_ids,p_worker_id);

  perform 1
  from public.workers w
  where w.id = p_worker_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Worker not found.';
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
    jsonb_build_object(
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
security invoker
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
  if p_worker_id is null or p_amount is null or p_amount <= 0 or p_payment_date is null then
    raise exception using errcode = '22023', message = 'Invalid payroll settlement request.';
  end if;
  if v_method is null then
    raise exception using errcode = '22023', message = 'Payment method is required.';
  end if;
  if p_advance_deduction_amount is null or p_advance_deduction_amount < 0 then
    raise exception using errcode = '22023', message = 'Advance deduction must be non-negative.';
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
    pg_catalog.hashtextextended('hh:worker-payroll:' || v_key, 0)
  );

  select wp.*
  into v_existing
  from public.worker_payments wp
  where wp.idempotency_key = v_key
  for update;

  if found then
    perform private.lock_worker_reimbursement_sources(v_reimbursement_ids,p_worker_id);
    if v_existing.settlement_completed_at is null then
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

  perform private.lock_worker_reimbursement_sources(v_reimbursement_ids,p_worker_id);

  perform 1
  from public.workers w
  where w.id = p_worker_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Worker not found.';
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

  if abs(v_advance_total - p_advance_deduction_amount) > 0.02 then
    raise exception using errcode = '23514', message = 'Advance deduction must match whole open advance records.';
  end if;

  v_expected_total := v_labor_total + v_reimbursement_total;
  if abs(v_expected_total - (p_amount + p_advance_deduction_amount)) > 0.02 then
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
    jsonb_build_object(
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

create or replace function public.create_paid_reimbursement_expense()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.worker_payments%rowtype;
  v_expense_id uuid;
  v_source_id public.expenses.source_id%type;
  v_line_count integer := 0;
  v_vendor text;
  v_notes text;
begin
  if lower(btrim(coalesce(new.status, ''))) <> 'paid' or new.payment_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and lower(btrim(coalesce(old.status, ''))) = 'paid'
    and old.payment_id is not distinct from new.payment_id
  then
    return new;
  end if;

  select wp.*
  into v_payment
  from public.worker_payments wp
  where wp.id = new.payment_id;
  if not found then
    raise exception using errcode = '23514', message = 'Reimbursement worker payment is missing.';
  end if;

  select e.id
  into v_expense_id
  from public.expenses e
  where e.source = 'worker_reimbursement'
    and e.source_id::text = new.id::text
  for update;

  if found then
    if not exists (
      select 1
      from public.expenses e
      where e.id = v_expense_id
        and e.source_type = 'reimbursement'
        and lower(btrim(coalesce(e.status, ''))) in ('approved','paid')
        and e.worker_id is not distinct from new.worker_id
        and e.project_id is not distinct from new.project_id
        and e.amount is not distinct from new.amount
        and e.total is not distinct from new.amount
    ) then
      raise exception using errcode = '23514', message = 'Existing reimbursement expense does not match the reimbursement.';
    end if;
    select count(*) into v_line_count
    from public.expense_lines el
    where el.expense_id = v_expense_id
      and el.project_id is not distinct from new.project_id
      and el.amount is not distinct from new.amount;
    if v_line_count <> 1 or (select count(*) from public.expense_lines where expense_id=v_expense_id) <> 1 then
      raise exception using errcode = '23514', message = 'Existing reimbursement expense line is incomplete.';
    end if;
    update public.expenses set status='paid',payment_method=v_payment.payment_method
    where id=v_expense_id and lower(btrim(status))='approved';
    return new;
  end if;

  v_source_id := new.id;
  v_vendor := coalesce(nullif(btrim(coalesce(new.vendor, '')), ''), 'Worker Reimbursement');
  v_notes := coalesce(
    nullif(btrim(coalesce(v_payment.note, '')), ''),
    nullif(btrim(coalesce(new.description, '')), '')
  );

  insert into public.expenses (
    expense_date,
    vendor_name,
    vendor,
    payment_method,
    reference_no,
    notes,
    total,
    amount,
    line_count,
    status,
    source,
    source_id,
    source_type,
    worker_id,
    project_id
  )
  values (
    coalesce(v_payment.payment_date, current_date),
    v_vendor,
    v_vendor,
    coalesce(nullif(btrim(coalesce(v_payment.payment_method, '')), ''), '—'),
    'REIM-' || new.id::text,
    v_notes,
    new.amount,
    new.amount,
    1,
    'paid',
    'worker_reimbursement',
    v_source_id,
    'reimbursement',
    new.worker_id,
    new.project_id
  )
  returning id into v_expense_id;

  insert into public.expense_lines (expense_id, project_id, amount, total)
  values (v_expense_id, new.project_id, new.amount, new.amount);

  return new;
end;
$$;


-- Guard direct table shortcuts too. Completion is checked at transaction end, after RPC metadata.
create function private.check_worker_reimbursement_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.worker_reimbursements%rowtype; p public.worker_payments%rowtype;
begin
  select * into o from public.worker_reimbursements where id=new.id;
  if not found then return null; end if;
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
  if p.id is null or o.status<>'paid' or p.worker_id is distinct from o.worker_id
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
        (coalesce((select sum(amount) from public.worker_reimbursements where payment_id=p.id),0)
        + coalesce((select sum(coalesce(labor_cost_snapshot,amount_snapshot,cost_amount,0))
          from public.labor_entries where worker_payment_id=p.id and worker_id=p.worker_id),0))
      or (p.settlement_metadata->>'advance_deduction_amount')::numeric is null
      or (p.settlement_metadata->>'advance_deduction_amount')::numeric<0
      or (p.settlement_metadata->>'advance_deduction_amount')::text in ('NaN','Infinity','-Infinity')
      or abs((p.settlement_metadata->>'gross_amount')::numeric -
        (p.total_amount+(p.settlement_metadata->>'advance_deduction_amount')::numeric))>0.02
      or abs((p.settlement_metadata->>'advance_deduction_amount')::numeric - coalesce((select sum(a.amount)
        from public.worker_advances a where a.worker_id=p.worker_id and lower(btrim(a.status))='deducted'
          and a.id::text in (select jsonb_array_elements_text(p.settlement_metadata->'advance_ids'))),0))>0.02 then
      raise exception 'Payroll reimbursement payment amounts do not reconcile.';
    end if;
  else
    raise exception 'Unknown reimbursement payment settlement identity.';
  end if;
  return null;
end;
$$;
revoke all on function private.check_worker_reimbursement_payment() from public,anon,authenticated,service_role;
create constraint trigger worker_reimbursement_payment_evidence after insert or update on public.worker_reimbursements
  deferrable initially deferred for each row execute function private.check_worker_reimbursement_payment();
notify pgrst, 'reload schema';

create function private.guard_worker_payment_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name='worker_payments' then
    if old.settlement_completed_at is not null and row(new.worker_id,new.total_amount,new.idempotency_key,
      new.request_fingerprint,new.settlement_metadata,new.settlement_completed_at,new.payment_date,new.payment_method)
      is distinct from row(old.worker_id,old.total_amount,old.idempotency_key,
      old.request_fingerprint,old.settlement_metadata,old.settlement_completed_at,old.payment_date,old.payment_method) then
      raise exception 'Completed worker payment is immutable; use reversal.';
    end if;
  elsif old.payment_id is not null and
    row(new.payment_id,new.status) is distinct from row(old.payment_id,old.status) then
    if new.payment_id is not null or new.status<>'pending'
      then
      raise exception 'Paid obligation must use payment reversal before another payment.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_worker_payment_identity() from public,anon,authenticated,service_role;
create trigger worker_payment_identity before update on public.worker_payments
for each row execute function private.guard_worker_payment_identity();
create trigger worker_obligation_payment_identity before update on public.worker_reimbursements
for each row execute function private.guard_worker_payment_identity();
