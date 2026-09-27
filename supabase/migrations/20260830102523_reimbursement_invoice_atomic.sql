set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.invoices
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
  if to_regclass('public.idx_invoices_idempotency_key') is not null
    and not pg_temp.financial_unique_index_ready(
      to_regclass('public.idx_invoices_idempotency_key'),
      to_regclass('public.invoices'),
      array['idempotency_key'],
      'idempotency_keyisnotnull'
    )
  then
    execute 'drop index public.idx_invoices_idempotency_key';
  end if;
end;
$$;

create unique index concurrently if not exists idx_invoices_idempotency_key
  on public.invoices (idempotency_key)
  where idempotency_key is not null;

do $$
begin
  if not pg_temp.financial_unique_index_ready(
    to_regclass('public.idx_invoices_idempotency_key'),
    to_regclass('public.invoices'),
    array['idempotency_key'],
    'idempotency_keyisnotnull'
  ) then
    raise exception 'Financial unique index idx_invoices_idempotency_key is not valid and ready.';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.idx_expenses_worker_reimbursement_source') is not null
    and not pg_temp.financial_unique_index_ready(
      to_regclass('public.idx_expenses_worker_reimbursement_source'),
      to_regclass('public.expenses'),
      array['source', 'source_id'],
      'source=''worker_reimbursement''andsource_idisnotnull'
    )
  then
    execute 'drop index public.idx_expenses_worker_reimbursement_source';
  end if;
end;
$$;

create unique index concurrently if not exists idx_expenses_worker_reimbursement_source
  on public.expenses (source, source_id)
  where source = 'worker_reimbursement' and source_id is not null;

do $$
begin
  if not pg_temp.financial_unique_index_ready(
    to_regclass('public.idx_expenses_worker_reimbursement_source'),
    to_regclass('public.expenses'),
    array['source', 'source_id'],
    'source=''worker_reimbursement''andsource_idisnotnull'
  ) then
    raise exception 'Financial unique index idx_expenses_worker_reimbursement_source is not valid and ready.';
  end if;
end;
$$;

set statement_timeout = '60s';

create or replace function public.require_paid_reimbursement_payment_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if lower(btrim(coalesce(new.status, ''))) = 'paid'
    and new.payment_id is null
    and (
      tg_op = 'INSERT'
      or lower(btrim(coalesce(old.status, ''))) <> 'paid'
      or old.payment_id is distinct from new.payment_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'A paid reimbursement must be linked to a worker payment.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_paid_reimbursement_payment_link
  on public.worker_reimbursements;
create trigger trg_require_paid_reimbursement_payment_link
before insert or update of status, payment_id on public.worker_reimbursements
for each row execute function public.require_paid_reimbursement_payment_link();

create or replace function public.create_paid_reimbursement_expense()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.worker_payments%rowtype;
  v_expense_id uuid;
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
    and e.source_id = new.id::text
  for update;

  if found then
    if not exists (
      select 1
      from public.expenses e
      where e.id = v_expense_id
        and e.source_type = 'reimbursement'
        and lower(btrim(coalesce(e.status, ''))) = 'paid'
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
    if v_line_count <> 1 then
      raise exception using errcode = '23514', message = 'Existing reimbursement expense line is incomplete.';
    end if;
    return new;
  end if;

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
    new.id::text,
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

drop trigger if exists trg_create_paid_reimbursement_expense
  on public.worker_reimbursements;
create trigger trg_create_paid_reimbursement_expense
after insert or update of status, payment_id on public.worker_reimbursements
for each row execute function public.create_paid_reimbursement_expense();

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
          and e.source_id = wr.id::text
          and e.source_type = 'reimbursement'
          and lower(btrim(coalesce(e.status, ''))) = 'paid'
          and e.amount is not distinct from wr.amount
          and (select count(*) from public.expense_lines el where el.expense_id = e.id and el.amount is not distinct from wr.amount) = 1
      );
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'Existing completed reimbursement payment is incomplete.';
    end if;
    return jsonb_build_object(
      'payment_id', v_existing.id,
      'updated_count', cardinality(v_ids),
      'reused', true
    );
  end if;

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

create or replace function public.create_invoice_atomic(
  p_idempotency_key text,
  p_header jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_invoice_no text;
  v_project_id uuid;
  v_customer_id uuid;
  v_client_name text;
  v_issue_date date;
  v_due_date date;
  v_notes text;
  v_tax_pct numeric := 0;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_fingerprint text;
  v_existing public.invoices%rowtype;
  v_invoice_id uuid;
  v_count integer := 0;
begin
  if v_key = '' or length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Invoice idempotency key is required.';
  end if;
  if p_header is null or jsonb_typeof(p_header) <> 'object'
    or p_items is null or jsonb_typeof(p_items) <> 'array'
  then
    raise exception using errcode = '22023', message = 'Invalid invoice create request.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'Invoice items must be objects.';
  end if;

  v_invoice_no := nullif(btrim(coalesce(p_header->>'invoice_no', '')), '');
  v_project_id := nullif(btrim(coalesce(p_header->>'project_id', '')), '')::uuid;
  v_customer_id := nullif(btrim(coalesce(p_header->>'customer_id', '')), '')::uuid;
  v_client_name := btrim(coalesce(p_header->>'client_name', ''));
  v_issue_date := nullif(btrim(coalesce(p_header->>'issue_date', '')), '')::date;
  v_due_date := nullif(btrim(coalesce(p_header->>'due_date', '')), '')::date;
  v_notes := nullif(p_header->>'notes', '');
  v_tax_pct := greatest(0, coalesce(nullif(p_header->>'tax_pct', '')::numeric, 0));
  if v_issue_date is null or v_due_date is null then
    raise exception using errcode = '22023', message = 'Invoice issue and due dates are required.';
  end if;

  -- Preserve the existing application formula: non-negative qty * unit price,
  -- tax rounded to cents, and total = subtotal + tax.
  select coalesce(sum(
    greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
      * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0))
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) item(value);
  v_tax_amount := pg_catalog.round(v_subtotal * (v_tax_pct / 100), 2);
  v_total := v_subtotal + v_tax_amount;

  v_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'invoice_no', v_invoice_no,
      'project_id', v_project_id,
      'customer_id', v_customer_id,
      'client_name', v_client_name,
      'issue_date', v_issue_date,
      'due_date', v_due_date,
      'status', 'Draft',
      'notes', v_notes,
      'tax_pct', v_tax_pct,
      'items', p_items
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hh:invoice-create:' || v_key, 0)
  );

  select i.*
  into v_existing
  from public.invoices i
  where i.idempotency_key = v_key
  for update;
  if found then
    if v_existing.atomic_completed_at is null then
      raise exception using errcode = '23514', message = 'Existing invoice idempotency record is incomplete.';
    end if;
    if v_existing.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'Invoice idempotency key was reused with different content.';
    end if;
    select count(*) into v_count
    from public.invoice_items ii
    where ii.invoice_id = v_existing.id;
    if v_count <> jsonb_array_length(p_items)
      or v_existing.subtotal is distinct from v_subtotal
      or v_existing.tax_pct is distinct from v_tax_pct
      or v_existing.tax_amount is distinct from v_tax_amount
      or v_existing.total is distinct from v_total
    then
      raise exception using errcode = '23514', message = 'Existing completed invoice is incomplete.';
    end if;
    return jsonb_build_object('invoice_id', v_existing.id, 'reused', true);
  end if;

  if v_invoice_no is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('hh:invoice-number', 0)
    );
    select 'INV-' || pg_catalog.lpad((count(*) + 1)::text, 4, '0')
    into v_invoice_no
    from public.invoices;
  end if;

  insert into public.invoices (
    invoice_no,
    project_id,
    customer_id,
    client_name,
    issue_date,
    due_date,
    status,
    notes,
    tax_pct,
    subtotal,
    tax_amount,
    total,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    v_invoice_no,
    v_project_id,
    v_customer_id,
    v_client_name,
    v_issue_date,
    v_due_date,
    'Draft',
    v_notes,
    v_tax_pct,
    v_subtotal,
    v_tax_amount,
    v_total,
    v_key,
    v_fingerprint
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, description, qty, unit_price, amount)
  select
    v_invoice_id,
    coalesce(item.value->>'description', ''),
    greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0)),
    greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0)),
    greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
      * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0))
  from jsonb_array_elements(p_items) item(value);

  update public.invoices
  set atomic_completed_at = clock_timestamp()
  where id = v_invoice_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'Invoice completion metadata was not recorded.';
  end if;

  return jsonb_build_object('invoice_id', v_invoice_id, 'reused', false);
end;
$$;

create or replace function public.update_invoice_atomic(
  p_invoice_id uuid,
  p_header jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_invoice_no text;
  v_project_id uuid;
  v_customer_id uuid;
  v_client_name text;
  v_issue_date date;
  v_due_date date;
  v_notes text;
  v_tax_pct numeric := 0;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
begin
  if p_invoice_id is null
    or p_header is null or jsonb_typeof(p_header) <> 'object'
    or (p_items is not null and jsonb_typeof(p_items) <> 'array')
  then
    raise exception using errcode = '22023', message = 'Invalid invoice update request.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'Invoice items must be objects.';
  end if;

  select i.*
  into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;
  if lower(btrim(coalesce(v_invoice.status, ''))) <> 'draft' then
    raise exception using errcode = '23514', message = 'Only draft invoices can be edited.';
  end if;

  v_invoice_no := case
    when p_header ? 'invoice_no' then coalesce(nullif(btrim(coalesce(p_header->>'invoice_no', '')), ''), v_invoice.invoice_no)
    else v_invoice.invoice_no
  end;
  v_project_id := case
    when p_header ? 'project_id' then nullif(btrim(coalesce(p_header->>'project_id', '')), '')::uuid
    else v_invoice.project_id
  end;
  v_customer_id := case
    when p_header ? 'customer_id' then nullif(btrim(coalesce(p_header->>'customer_id', '')), '')::uuid
    else v_invoice.customer_id
  end;
  v_client_name := case
    when p_header ? 'client_name' then btrim(coalesce(p_header->>'client_name', ''))
    else v_invoice.client_name
  end;
  v_issue_date := case
    when p_header ? 'issue_date' then nullif(btrim(coalesce(p_header->>'issue_date', '')), '')::date
    else v_invoice.issue_date
  end;
  v_due_date := case
    when p_header ? 'due_date' then nullif(btrim(coalesce(p_header->>'due_date', '')), '')::date
    else v_invoice.due_date
  end;
  v_notes := case
    when p_header ? 'notes' then nullif(p_header->>'notes', '')
    else v_invoice.notes
  end;
  v_tax_pct := case
    when p_header ? 'tax_pct' then greatest(0, coalesce(nullif(p_header->>'tax_pct', '')::numeric, 0))
    else greatest(0, coalesce(v_invoice.tax_pct, 0))
  end;

  if p_items is null then
    select coalesce(sum(
      greatest(0, coalesce(item.qty, 0))
        * greatest(0, coalesce(item.unit_price, 0))
    ), 0)
    into v_subtotal
    from public.invoice_items item
    where item.invoice_id = p_invoice_id;
  else
    select coalesce(sum(
      greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
        * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0))
    ), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) item(value);
  end if;
  v_tax_amount := pg_catalog.round(v_subtotal * (v_tax_pct / 100), 2);
  v_total := v_subtotal + v_tax_amount;

  update public.invoices
  set
    invoice_no = v_invoice_no,
    project_id = v_project_id,
    customer_id = v_customer_id,
    client_name = v_client_name,
    issue_date = v_issue_date,
    due_date = v_due_date,
    notes = v_notes,
    tax_pct = v_tax_pct,
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total = v_total,
    updated_at = clock_timestamp()
  where id = p_invoice_id;

  if p_items is not null then
    delete from public.invoice_items
    where invoice_id = p_invoice_id;

    insert into public.invoice_items (invoice_id, description, qty, unit_price, amount)
    select
      p_invoice_id,
      coalesce(item.value->>'description', ''),
      greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0)),
      greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0)),
      greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
        * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0))
    from jsonb_array_elements(p_items) item(value);
  end if;

  return jsonb_build_object('invoice_id', p_invoice_id, 'reused', false);
end;
$$;

comment on function public.record_worker_reimbursement_payment_atomic(text, uuid, text, date, text, uuid[])
  is 'Atomically creates a worker payment, paid reimbursement links, and reimbursement expense headers and lines with server-side idempotency.';
comment on function public.create_invoice_atomic(text, jsonb, jsonb)
  is 'Atomically creates an invoice header and all invoice items with server-side idempotency.';
comment on function public.update_invoice_atomic(uuid, jsonb, jsonb)
  is 'Atomically updates a draft invoice header and optionally replaces its item set.';

notify pgrst, 'reload schema';
