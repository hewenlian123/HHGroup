set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.worker_payments
  add column if not exists payment_date date,
  add column if not exists labor_entry_ids uuid[],
  add column if not exists settlement_metadata jsonb,
  add column if not exists request_fingerprint text,
  add column if not exists settlement_completed_at timestamptz;

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
      and le.worker_id = p_worker_id
      and le.worker_payment_id = v_existing.id;
    if v_count <> cardinality(v_labor_ids) then
      raise exception using errcode = '23514', message = 'Existing completed payroll settlement has incomplete labor links.';
    end if;

    select count(*)
    into v_count
    from public.worker_reimbursements wr
    where wr.id = any(v_reimbursement_ids)
      and wr.worker_id = p_worker_id
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
      and le.worker_id = p_worker_id
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
      and wr.worker_id = p_worker_id
      and wr.payment_id is null
      and lower(btrim(coalesce(wr.status, ''))) <> 'paid';
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
      and lower(btrim(coalesce(status, ''))) <> 'paid';
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

comment on function public.record_worker_payroll_settlement(text, uuid, uuid, numeric, text, date, text, uuid[], uuid[], uuid[], numeric)
  is 'Atomically creates a worker payment and settles its labor, reimbursements, advances, and completion metadata with server-side idempotency.';

notify pgrst, 'reload schema';
