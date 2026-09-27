-- Financial bug fixes:
-- 1. Invoice lines round to cents before they are summed (client and server match).
-- 2. Estimates can store a tax rate that recalculates after discount.
-- 3. Change-order approval no longer folds revenue into projects.budget.
--    Historical folds are reversed once.
-- 4. Workers regain default_ot_rate so overtime hours can be priced.

alter table public.estimate_meta
  add column if not exists tax_rate_pct numeric;

alter table public.workers
  add column if not exists default_ot_rate numeric default 0;

comment on column public.estimate_meta.tax_rate_pct is
  'Percent applied to (subtotal - discount). Null keeps a legacy fixed tax amount.';
comment on column public.workers.default_ot_rate is
  'Hourly overtime rate. Null or 0 uses 1.5x the daily rate divided by 8.';

create table if not exists public.change_order_budget_reversals (
  change_order_id uuid primary key,
  project_id uuid not null,
  reversed_amount numeric not null,
  reversed_at timestamptz not null default now()
);

-- Undo approve_change_order budget folds. Two mutually exclusive signals:
-- contract_amount still holds the base while budget equals base + approved COs,
-- or approved COs wrote project_budget_items (the old RPC). Never apply both.
do $$
declare
  r record;
  co_sum numeric;
  has_total_amount boolean;
  amount_sql text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_change_orders'
      and column_name = 'total_amount'
  ) into has_total_amount;
  amount_sql := case
    when has_total_amount then 'coalesce(c.total, c.total_amount, 0)'
    else 'coalesce(c.total, 0)'
  end;

  for r in
    select p.id, coalesce(p.budget, 0) as budget, p.contract_amount
    from public.projects p
  loop
    execute format(
      'select coalesce(sum(%s), 0) from public.project_change_orders c
       where c.project_id = $1 and c.status = ''Approved''
         and not exists (
           select 1 from public.change_order_budget_reversals rev
           where rev.change_order_id = c.id
         )',
      amount_sql
    ) into co_sum using r.id;

    if co_sum = 0 then
      continue;
    end if;

    if r.contract_amount is not null and r.contract_amount > 0
       and abs(r.budget - r.contract_amount - co_sum) < 0.05 then
      update public.projects
      set budget = r.contract_amount, updated_at = now()
      where id = r.id;
      execute format(
        'insert into public.change_order_budget_reversals (change_order_id, project_id, reversed_amount)
         select c.id, c.project_id, %s
         from public.project_change_orders c
         where c.project_id = $1 and c.status = ''Approved''
         on conflict (change_order_id) do nothing',
        amount_sql
      ) using r.id;
    elsif exists (
      select 1
      from public.project_budget_items i
      join public.project_change_orders c on c.id = i.change_order_id
      where c.project_id = r.id and c.status = 'Approved'
    ) then
      execute format(
        'select coalesce(sum(%s), 0)
         from public.project_change_orders c
         where c.project_id = $1 and c.status = ''Approved''
           and exists (
             select 1 from public.project_budget_items i where i.change_order_id = c.id
           )
           and not exists (
             select 1 from public.change_order_budget_reversals rev
             where rev.change_order_id = c.id
           )',
        amount_sql
      ) into co_sum using r.id;
      update public.projects
      set budget = greatest(0, coalesce(budget, 0) - co_sum), updated_at = now()
      where id = r.id;
      execute format(
        'insert into public.change_order_budget_reversals (change_order_id, project_id, reversed_amount)
         select c.id, c.project_id, %s
         from public.project_change_orders c
         where c.project_id = $1 and c.status = ''Approved''
           and exists (
             select 1 from public.project_budget_items i where i.change_order_id = c.id
           )
         on conflict (change_order_id) do nothing',
        amount_sql
      ) using r.id;
    end if;
  end loop;
end $$;

create or replace function public.approve_change_order(
  p_change_order_id uuid,
  p_approved_by text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_co record;
  v_item record;
begin
  select id, project_id, status, total
  into v_co
  from public.project_change_orders
  where id = p_change_order_id
  for update;

  if not found then
    raise exception 'Change order not found: %', p_change_order_id;
  end if;

  if v_co.status = 'Approved' then
    raise exception 'Change order already approved';
  end if;

  -- Revenue stays on the change order. projects.budget remains the base contract.
  for v_item in
    select cost_code, description, total
    from public.project_change_order_items
    where change_order_id = p_change_order_id
  loop
    insert into public.project_budget_items (
      project_id,
      change_order_id,
      cost_code,
      description,
      qty,
      unit,
      unit_price,
      total,
      budget_amount
    )
    values (
      v_co.project_id,
      p_change_order_id,
      coalesce(v_item.cost_code, ''),
      coalesce(v_item.description, ''),
      1,
      'EA',
      coalesce(v_item.total, 0),
      coalesce(v_item.total, 0),
      coalesce(v_item.total, 0)
    );
  end loop;

  update public.project_change_orders
  set status = 'Approved',
      approved_at = now(),
      approved_by = nullif(btrim(coalesce(p_approved_by, '')), '')::uuid
  where id = p_change_order_id;
end;
$$;

revoke all on function public.approve_change_order(uuid, text) from public, anon;
grant execute on function public.approve_change_order(uuid, text) to authenticated, service_role;

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
    pg_catalog.round(
      greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
      * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0)),
      2)
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
    pg_catalog.round(
      greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
      * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0)),
      2)
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
      pg_catalog.round(
      greatest(0, coalesce(item.qty, 0))
        * greatest(0, coalesce(item.unit_price, 0)),
      2)
    ), 0)
    into v_subtotal
    from public.invoice_items item
    where item.invoice_id = p_invoice_id;
  else
    select coalesce(sum(
      pg_catalog.round(
      greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
        * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0)),
      2)
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
      pg_catalog.round(
      greatest(0, coalesce(nullif(item.value->>'qty', '')::numeric, 0))
        * greatest(0, coalesce(nullif(item.value->>'unit_price', '')::numeric, 0)),
      2)
    from jsonb_array_elements(p_items) item(value);
  end if;

  return jsonb_build_object('invoice_id', p_invoice_id, 'reused', false);
end;
$$;


-- quantity is generated from qty and is null inside this BEFORE trigger, so the
-- old body used coalesce(quantity, 1) and stored unit_price instead of qty * price.
-- Round each line to cents (half away from zero) before it is summed.
create or replace function public.calc_invoice_item_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.amount := pg_catalog.round(
    coalesce(new.qty, 0) * coalesce(new.unit_price, 0),
    2
  );
  return new;
end;
$$;

-- Recompute stored invoice totals from cent-rounded line extensions.
update public.invoice_items
set amount = pg_catalog.round(coalesce(qty, 0) * coalesce(unit_price, 0), 2)
where amount is distinct from pg_catalog.round(coalesce(qty, 0) * coalesce(unit_price, 0), 2);

update public.invoices i
set
  subtotal = s.subtotal,
  tax_amount = pg_catalog.round(s.subtotal * coalesce(i.tax_pct, 0) / 100, 2),
  total = s.subtotal + pg_catalog.round(s.subtotal * coalesce(i.tax_pct, 0) / 100, 2)
from (
  select invoice_id, coalesce(sum(pg_catalog.round(coalesce(qty, 0) * coalesce(unit_price, 0), 2)), 0) as subtotal
  from public.invoice_items
  group by invoice_id
) s
where i.id = s.invoice_id
  and (
    i.subtotal is distinct from s.subtotal
    or i.tax_amount is distinct from pg_catalog.round(s.subtotal * coalesce(i.tax_pct, 0) / 100, 2)
    or i.total is distinct from s.subtotal + pg_catalog.round(s.subtotal * coalesce(i.tax_pct, 0) / 100, 2)
  );
