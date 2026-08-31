set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.payments_received
  add column if not exists idempotency_key text,
  add column if not exists idempotency_fingerprint text,
  add column if not exists atomic_completed_at timestamptz;

create or replace function pg_temp.financial_unique_index_ready(
  p_index regclass,
  p_table regclass,
  p_columns text[],
  p_predicate text
)
returns boolean
language sql
stable
as $$
  select coalesce((
    select i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = p_table
      and (
        select pg_catalog.array_agg(a.attname::text order by keys.ordinality)
        from pg_catalog.unnest(i.indkey::smallint[]) with ordinality keys(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid and a.attnum = keys.attnum
        where keys.ordinality <= i.indnkeyatts
      ) = p_columns
      and pg_catalog.regexp_replace(
        pg_catalog.replace(pg_catalog.lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)), '::text', ''),
        '[()[:space:]]',
        '',
        'g'
      ) = p_predicate
    from pg_catalog.pg_index i
    where i.indexrelid = p_index
  ), false);
$$;

set statement_timeout = '0';

do $$
begin
  if to_regclass('public.idx_payments_received_idempotency_key') is not null
    and not pg_temp.financial_unique_index_ready(
      to_regclass('public.idx_payments_received_idempotency_key'),
      to_regclass('public.payments_received'),
      array['idempotency_key'],
      'idempotency_keyisnotnull'
    )
  then
    execute 'drop index public.idx_payments_received_idempotency_key';
  end if;
end;
$$;

create unique index concurrently if not exists idx_payments_received_idempotency_key
  on public.payments_received (idempotency_key)
  where idempotency_key is not null;

do $$
begin
  if not pg_temp.financial_unique_index_ready(
    to_regclass('public.idx_payments_received_idempotency_key'),
    to_regclass('public.payments_received'),
    array['idempotency_key'],
    'idempotency_keyisnotnull'
  ) then
    raise exception 'Financial unique index idx_payments_received_idempotency_key is not valid and ready.';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.idx_invoice_payments_payment_received_id_unique') is not null
    and not pg_temp.financial_unique_index_ready(
      to_regclass('public.idx_invoice_payments_payment_received_id_unique'),
      to_regclass('public.invoice_payments'),
      array['payment_received_id'],
      'payment_received_idisnotnull'
    )
  then
    execute 'drop index public.idx_invoice_payments_payment_received_id_unique';
  end if;
end;
$$;

create unique index concurrently if not exists idx_invoice_payments_payment_received_id_unique
  on public.invoice_payments (payment_received_id)
  where payment_received_id is not null;

do $$
begin
  if not pg_temp.financial_unique_index_ready(
    to_regclass('public.idx_invoice_payments_payment_received_id_unique'),
    to_regclass('public.invoice_payments'),
    array['payment_received_id'],
    'payment_received_idisnotnull'
  ) then
    raise exception 'Financial unique index idx_invoice_payments_payment_received_id_unique is not valid and ready.';
  end if;
end;
$$;

set statement_timeout = '60s';

create or replace function public.record_payment_received_atomic(
  p_idempotency_key text,
  p_invoice_id uuid,
  p_project_id uuid,
  p_customer_name text,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_deposit_account text,
  p_notes text,
  p_attachment_url text,
  p_attachments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_fingerprint text;
  v_existing public.payments_received%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_deposit_id uuid;
  v_allocation_id uuid;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_next_status text;
  v_count integer := 0;
begin
  if v_key = '' or length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Payment idempotency key is required.';
  end if;
  if p_invoice_id is null or p_payment_date is null or p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Invalid payment request.';
  end if;
  if v_method is null then
    raise exception using errcode = '22023', message = 'Payment method is required.';
  end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    raise exception using errcode = '22023', message = 'Payment attachments must be an array.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_attachments) a(value)
    where jsonb_typeof(a.value) <> 'object'
      or coalesce(a.value->>'file_type', '') not in ('image', 'pdf')
  ) then
    raise exception using errcode = '22023', message = 'Invalid payment attachment metadata.';
  end if;

  v_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'project_id', p_project_id,
      'customer_name', coalesce(p_customer_name, ''),
      'payment_date', p_payment_date,
      'amount', p_amount,
      'payment_method', v_method,
      'deposit_account', p_deposit_account,
      'notes', p_notes,
      'attachment_url', p_attachment_url,
      'attachments', p_attachments
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hh:payment-received:' || v_key, 0)
  );

  select p.*
  into v_existing
  from public.payments_received p
  where p.idempotency_key = v_key
  for update;

  if found then
    if v_existing.atomic_completed_at is null then
      raise exception using errcode = '23514', message = 'Existing payment idempotency record is incomplete.';
    end if;
    if v_existing.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'Payment idempotency key was reused with different content.';
    end if;
    if v_existing.invoice_id is distinct from p_invoice_id
      or v_existing.amount is distinct from p_amount
      or v_existing.payment_date::date is distinct from p_payment_date
      or nullif(btrim(coalesce(v_existing.payment_method, '')), '') is distinct from v_method
    then
      raise exception using errcode = '23514', message = 'Existing atomic payment no longer matches its request.';
    end if;

    select d.id
    into v_deposit_id
    from public.deposits d
    where d.payment_id = v_existing.id
      and coalesce(d.status, 'recorded') <> 'void'
      and d.invoice_id is not distinct from v_existing.invoice_id
      and d.amount is not distinct from v_existing.amount;
    if not found then
      raise exception using errcode = '23514', message = 'Existing atomic payment is missing its deposit.';
    end if;

    select ip.id
    into v_allocation_id
    from public.invoice_payments ip
    where ip.payment_received_id = v_existing.id
      and ip.invoice_id is not distinct from v_existing.invoice_id
      and ip.amount is not distinct from v_existing.amount
      and coalesce(ip.status, 'Posted') <> 'Voided';
    if not found then
      raise exception using errcode = '23514', message = 'Existing atomic payment is missing its allocation.';
    end if;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'deposit_id', v_deposit_id,
      'invoice_payment_id', v_allocation_id,
      'invoice_status', (select i.status from public.invoices i where i.id = v_existing.invoice_id),
      'reused', true
    );
  end if;

  select i.*
  into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;

  select coalesce(sum(ip.amount), 0)
  into v_paid
  from public.invoice_payments ip
  where ip.invoice_id = p_invoice_id
    and coalesce(ip.status, 'Posted') <> 'Voided';

  v_remaining := greatest(0, coalesce(v_invoice.total, 0) - v_paid);
  if v_remaining <= 0.0000001 then
    raise exception using errcode = '23514', message = 'Invoice already fully paid';
  end if;
  if p_amount - v_remaining > 0.0000001 then
    raise exception using errcode = '23514', message = 'Payment exceeds remaining balance';
  end if;

  insert into public.payments_received (
    invoice_id,
    project_id,
    customer_name,
    payment_date,
    amount,
    payment_method,
    deposit_account,
    notes,
    attachment_url,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    p_invoice_id,
    p_project_id,
    coalesce(p_customer_name, ''),
    p_payment_date,
    p_amount,
    v_method,
    p_deposit_account,
    p_notes,
    p_attachment_url,
    v_key,
    v_fingerprint
  )
  returning id into v_payment_id;

  select d.id
  into v_deposit_id
  from public.deposits d
  where d.payment_id = v_payment_id
    and coalesce(d.status, 'recorded') <> 'void';
  if not found then
    raise exception using errcode = '23514', message = 'Payment deposit was not created.';
  end if;

  insert into public.invoice_payments (
    invoice_id,
    paid_at,
    amount,
    method,
    memo,
    status,
    payment_received_id
  )
  values (
    p_invoice_id,
    p_payment_date,
    p_amount,
    v_method,
    coalesce(nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_deposit_account, '')), '')),
    'Posted',
    v_payment_id
  )
  returning id into v_allocation_id;

  if lower(btrim(coalesce(v_invoice.status, ''))) <> 'void' then
    v_next_status := case
      when v_paid + p_amount + 0.0000001 >= coalesce(v_invoice.total, 0) then 'Paid'
      when v_paid + p_amount > 0.0000001 then 'Partially Paid'
      when lower(btrim(coalesce(v_invoice.status, ''))) <> 'draft' then 'Sent'
      else 'Draft'
    end;
    update public.invoices
    set status = v_next_status
    where id = p_invoice_id;
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '23514', message = 'Invoice status was not updated.';
    end if;
  else
    v_next_status := v_invoice.status;
  end if;

  insert into public.payment_received_attachments (
    payment_id,
    file_url,
    file_name,
    mime_type,
    size_bytes,
    file_type
  )
  select
    v_payment_id,
    btrim(a.value->>'file_url'),
    btrim(a.value->>'file_name'),
    nullif(a.value->>'mime_type', ''),
    case
      when coalesce(a.value->>'size_bytes', '') ~ '^[0-9]+$' then (a.value->>'size_bytes')::bigint
      else null
    end,
    a.value->>'file_type'
  from jsonb_array_elements(p_attachments) a(value)
  where btrim(coalesce(a.value->>'file_url', '')) <> ''
    and btrim(coalesce(a.value->>'file_name', '')) <> '';

  update public.payments_received
  set atomic_completed_at = clock_timestamp()
  where id = v_payment_id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'deposit_id', v_deposit_id,
    'invoice_payment_id', v_allocation_id,
    'invoice_status', v_next_status,
    'reused', false
  );
end;
$$;

create or replace function public.update_payment_received_atomic(
  p_payment_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_deposit_account text,
  p_notes text,
  p_invoice_payment_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_payment public.payments_received%rowtype;
  v_invoice public.invoices%rowtype;
  v_allocation_id uuid;
  v_paid_excluding numeric := 0;
  v_next_status text;
  v_count integer := 0;
begin
  if p_payment_id is null or p_payment_date is null or p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Invalid payment update request.';
  end if;
  if v_method is null then
    raise exception using errcode = '22023', message = 'Payment method is required.';
  end if;

  select p.*
  into v_payment
  from public.payments_received p
  where p.id = p_payment_id
    and coalesce(p.status, 'completed') <> 'void'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Payment not found.';
  end if;

  select i.*
  into v_invoice
  from public.invoices i
  where i.id = v_payment.invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;

  select ip.id
  into v_allocation_id
  from public.invoice_payments ip
  where ip.invoice_id = v_payment.invoice_id
    and (
      ip.id = p_invoice_payment_id
      or (p_invoice_payment_id is null and ip.payment_received_id = p_payment_id)
    )
    and coalesce(ip.status, 'Posted') <> 'Voided'
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'Payment allocation is missing.';
  end if;

  select coalesce(sum(ip.amount), 0)
  into v_paid_excluding
  from public.invoice_payments ip
  where ip.invoice_id = v_payment.invoice_id
    and ip.id <> v_allocation_id
    and coalesce(ip.status, 'Posted') <> 'Voided';

  if p_amount - greatest(0, coalesce(v_invoice.total, 0) - v_paid_excluding) > 0.0000001 then
    raise exception using errcode = '23514', message = 'Payment exceeds the invoice balance available for this edit.';
  end if;

  update public.payments_received
  set
    payment_date = p_payment_date,
    amount = p_amount,
    payment_method = v_method,
    deposit_account = p_deposit_account,
    notes = p_notes
  where id = p_payment_id;

  update public.invoice_payments
  set
    paid_at = p_payment_date,
    amount = p_amount,
    method = v_method,
    memo = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_deposit_account, '')), '')),
    payment_received_id = p_payment_id
  where id = v_allocation_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Payment allocation was not updated.';
  end if;

  update public.deposits
  set
    amount = p_amount,
    deposit_date = p_payment_date,
    date = p_payment_date,
    deposit_account = p_deposit_account,
    account = p_deposit_account,
    payment_method = v_method,
    customer_name = v_payment.customer_name,
    project_id = v_payment.project_id,
    invoice_id = v_payment.invoice_id,
    status = 'recorded'
  where payment_id = p_payment_id
    and coalesce(status, 'recorded') <> 'void';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Payment deposit was not updated.';
  end if;

  if lower(btrim(coalesce(v_invoice.status, ''))) <> 'void' then
    v_next_status := case
      when v_paid_excluding + p_amount + 0.0000001 >= coalesce(v_invoice.total, 0) then 'Paid'
      when v_paid_excluding + p_amount > 0.0000001 then 'Partially Paid'
      when lower(btrim(coalesce(v_invoice.status, ''))) <> 'draft' then 'Sent'
      else 'Draft'
    end;
    update public.invoices
    set status = v_next_status
    where id = v_payment.invoice_id;
  else
    v_next_status := v_invoice.status;
  end if;

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'deposit_id', (select d.id from public.deposits d where d.payment_id = p_payment_id and coalesce(d.status, 'recorded') <> 'void'),
    'invoice_payment_id', v_allocation_id,
    'invoice_status', v_next_status,
    'reused', false
  );
end;
$$;

comment on function public.record_payment_received_atomic(text, uuid, uuid, text, date, numeric, text, text, text, text, jsonb)
  is 'Atomically records a Payment Received, trigger-created deposit, invoice allocation, invoice status, and attachment metadata with server-side idempotency.';

comment on function public.update_payment_received_atomic(uuid, date, numeric, text, text, text, uuid)
  is 'Atomically updates Payment Received financial fields, its deposit, invoice allocation, and invoice status.';

notify pgrst, 'reload schema';
