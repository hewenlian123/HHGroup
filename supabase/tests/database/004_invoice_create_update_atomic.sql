begin;

select plan(34);

select has_function(
  'public',
  'create_invoice_atomic',
  'atomic invoice create RPC exists'
);
select has_function(
  'public',
  'update_invoice_atomic',
  'atomic invoice update RPC exists'
);

create temp table invoice_atomic_results (result jsonb);

insert into invoice_atomic_results (result)
select public.create_invoice_atomic(
  'invoice-key-success',
  jsonb_build_object(
    'invoice_no', 'ATOMIC-INV-CREATE-001',
    'project_id', null,
    'customer_id', null,
    'client_name', 'Atomic Customer',
    'issue_date', '2026-08-30',
    'due_date', '2026-09-30',
    'status', 'Draft',
    'notes', 'Atomic invoice create',
    'tax_pct', 10
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Labor', 'qty', 2, 'unit_price', 20),
    jsonb_build_object('description', 'Materials', 'qty', 1, 'unit_price', 10)
  )
);

select is(
  (select count(*) from public.invoices where idempotency_key = 'invoice-key-success'),
  1::bigint,
  'create writes exactly one invoice header'
);
select is(
  (
    select count(*)
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.idempotency_key = 'invoice-key-success'
  ),
  2::bigint,
  'create writes every invoice item'
);
select is(
  (select subtotal from public.invoices where idempotency_key = 'invoice-key-success'),
  50::numeric,
  'create preserves subtotal formula'
);
select is(
  (select tax_amount from public.invoices where idempotency_key = 'invoice-key-success'),
  5::numeric,
  'create preserves tax formula'
);
select is(
  (select total from public.invoices where idempotency_key = 'invoice-key-success'),
  55::numeric,
  'create preserves total formula'
);
insert into invoice_atomic_results (result)
select public.create_invoice_atomic(
  'invoice-key-success',
  jsonb_build_object(
    'invoice_no', 'ATOMIC-INV-CREATE-001',
    'project_id', null,
    'customer_id', null,
    'client_name', 'Atomic Customer',
    'issue_date', '2026-08-30',
    'due_date', '2026-09-30',
    'status', 'Draft',
    'notes', 'Atomic invoice create',
    'tax_pct', 10
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Labor', 'qty', 2, 'unit_price', 20),
    jsonb_build_object('description', 'Materials', 'qty', 1, 'unit_price', 10)
  )
);

select is(
  (select result->>'invoice_id' from invoice_atomic_results order by ctid limit 1),
  (select result->>'invoice_id' from invoice_atomic_results order by ctid desc limit 1),
  'same create key returns the original invoice'
);
select is(
  (select (result->>'reused')::boolean from invoice_atomic_results order by ctid desc limit 1),
  true,
  'same create key reports reuse'
);
select is(
  (select count(*) from public.invoices where idempotency_key = 'invoice-key-success'),
  1::bigint,
  'same create key remains exactly once'
);
select is(
  (
    select count(*)
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.idempotency_key = 'invoice-key-success'
  ),
  2::bigint,
  'same create key does not duplicate invoice items'
);
select throws_ok(
  $$
    select public.create_invoice_atomic(
      'invoice-key-success',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-INV-CREATE-001',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Different Atomic Customer',
        'issue_date', '2026-08-30',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'notes', 'Atomic invoice create',
        'tax_pct', 10
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Labor', 'qty', 2, 'unit_price', 20),
        jsonb_build_object('description', 'Materials', 'qty', 1, 'unit_price', 10)
      )
    )
  $$,
  '23505',
  'Invoice idempotency key was reused with different content.',
  'same create key with changed payload is rejected'
);

insert into public.invoices (
  invoice_no, client_name, issue_date, due_date, status, total, idempotency_key
)
values (
  'ATOMIC-INV-INCOMPLETE-001', 'Atomic Customer', '2026-08-30', '2026-09-30',
  'Draft', 10, 'invoice-key-incomplete'
);
select throws_ok(
  $$
    select public.create_invoice_atomic(
      'invoice-key-incomplete',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-INV-INCOMPLETE-001',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Atomic Customer',
        'issue_date', '2026-08-30',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'notes', null,
        'tax_pct', 0
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Incomplete item', 'qty', 1, 'unit_price', 10)
      )
    )
  $$,
  '23514',
  'Existing invoice idempotency record is incomplete.',
  'incomplete invoice is never returned as an idempotent success'
);

create function pg_temp.fail_invoice_item_create()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected invoice item create failure';
end;
$$;
create trigger invoice_atomic_fail_item_create
before insert on public.invoice_items
for each row execute function pg_temp.fail_invoice_item_create();

select throws_ok(
  $$
    select public.create_invoice_atomic(
      'invoice-key-item-fail',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-INV-CREATE-FAIL-001',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Atomic Customer',
        'issue_date', '2026-08-30',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'notes', 'Injected item failure',
        'tax_pct', 0
      ),
      jsonb_build_array(jsonb_build_object('description', 'Failing item', 'qty', 1, 'unit_price', 25))
    )
  $$,
  'P0001',
  'injected invoice item create failure',
  'item failure aborts atomic invoice create'
);
drop trigger invoice_atomic_fail_item_create on public.invoice_items;

select is(
  (select count(*) from public.invoices where invoice_no = 'ATOMIC-INV-CREATE-FAIL-001'),
  0::bigint,
  'item failure rolls back invoice header'
);
select is(
  (
    select count(*)
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.invoice_no = 'ATOMIC-INV-CREATE-FAIL-001'
  ),
  0::bigint,
  'item failure leaves no invoice items'
);

create function pg_temp.fail_invoice_completion_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.idempotency_key = 'invoice-key-completion-fail'
    and new.atomic_completed_at is not null
  then
    raise exception 'injected invoice completion metadata failure';
  end if;
  return new;
end;
$$;
create trigger invoice_atomic_fail_completion_metadata
before update on public.invoices
for each row execute function pg_temp.fail_invoice_completion_metadata();
select throws_ok(
  $$
    select public.create_invoice_atomic(
      'invoice-key-completion-fail',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-INV-COMPLETION-FAIL-001',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Atomic Customer',
        'issue_date', '2026-08-30',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'notes', 'Injected completion failure',
        'tax_pct', 0
      ),
      jsonb_build_array(jsonb_build_object('description', 'Completion item', 'qty', 1, 'unit_price', 25))
    )
  $$,
  'P0001',
  'injected invoice completion metadata failure',
  'completion metadata failure aborts atomic invoice create'
);
drop trigger invoice_atomic_fail_completion_metadata on public.invoices;
select is(
  (select count(*) from public.invoices where invoice_no = 'ATOMIC-INV-COMPLETION-FAIL-001'),
  0::bigint,
  'completion metadata failure rolls back invoice header'
);
select is(
  (
    select count(*)
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.invoice_no = 'ATOMIC-INV-COMPLETION-FAIL-001'
  ),
  0::bigint,
  'completion metadata failure rolls back invoice items'
);

insert into public.invoices (
  id, invoice_no, client_name, issue_date, due_date, status, notes, tax_pct, subtotal, tax_amount, total
)
values (
  '44444444-4444-4444-4444-444444444401',
  'ATOMIC-INV-UPDATE-001',
  'Original Customer',
  '2026-08-01',
  '2026-09-01',
  'Draft',
  'Original notes',
  0,
  50,
  0,
  50
);
insert into public.invoice_items (id, invoice_id, description, qty, unit_price, amount)
values (
  '44444444-4444-4444-4444-444444444402',
  '44444444-4444-4444-4444-444444444401',
  'Original item',
  1,
  50,
  50
);

create function pg_temp.fail_invoice_item_replacement()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_id = '44444444-4444-4444-4444-444444444401'::uuid then
    raise exception 'injected invoice item replacement failure';
  end if;
  return new;
end;
$$;
create trigger invoice_atomic_fail_item_replacement
before insert on public.invoice_items
for each row execute function pg_temp.fail_invoice_item_replacement();

select throws_ok(
  $$
    select public.update_invoice_atomic(
      '44444444-4444-4444-4444-444444444401',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-INV-UPDATE-001',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Changed Customer',
        'issue_date', '2026-08-02',
        'due_date', '2026-09-02',
        'notes', 'Changed notes',
        'tax_pct', 10
      ),
      jsonb_build_array(jsonb_build_object('description', 'Replacement item', 'qty', 2, 'unit_price', 60))
    )
  $$,
  'P0001',
  'injected invoice item replacement failure',
  'replacement failure aborts atomic invoice update'
);
drop trigger invoice_atomic_fail_item_replacement on public.invoice_items;

select is(
  (select client_name from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  'Original Customer',
  'replacement failure preserves original header'
);
select is(
  (select total from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  50::numeric,
  'replacement failure preserves original total'
);
select is(
  (select description from public.invoice_items where id = '44444444-4444-4444-4444-444444444402'),
  'Original item',
  'replacement failure preserves original item'
);
select is(
  (select count(*) from public.invoice_items where invoice_id = '44444444-4444-4444-4444-444444444401'),
  1::bigint,
  'replacement failure does not leave an empty item set'
);

select public.update_invoice_atomic(
  '44444444-4444-4444-4444-444444444401',
  jsonb_build_object(
    'invoice_no', 'ATOMIC-INV-UPDATE-001',
    'project_id', null,
    'customer_id', null,
    'client_name', 'Changed Customer',
    'issue_date', '2026-08-02',
    'due_date', '2026-09-02',
    'notes', 'Changed notes',
    'tax_pct', 10
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Replacement labor', 'qty', 2, 'unit_price', 60),
    jsonb_build_object('description', 'Replacement materials', 'qty', 1, 'unit_price', 20)
  )
);

select is(
  (select client_name from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  'Changed Customer',
  'successful update writes replacement header'
);
select is(
  (select subtotal from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  140::numeric,
  'successful update writes replacement subtotal'
);
select is(
  (select tax_amount from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  14::numeric,
  'successful update writes replacement tax'
);
select is(
  (select total from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  154::numeric,
  'successful update writes replacement total'
);
select is(
  (select count(*) from public.invoice_items where invoice_id = '44444444-4444-4444-4444-444444444401'),
  2::bigint,
  'successful update writes replacement items once'
);

select public.update_invoice_atomic(
  '44444444-4444-4444-4444-444444444401',
  jsonb_build_object(
    'invoice_no', 'ATOMIC-INV-UPDATE-001',
    'project_id', null,
    'customer_id', null,
    'client_name', 'Changed Customer',
    'issue_date', '2026-08-02',
    'due_date', '2026-09-02',
    'notes', 'Changed notes',
    'tax_pct', 10
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Replacement labor', 'qty', 2, 'unit_price', 60),
    jsonb_build_object('description', 'Replacement materials', 'qty', 1, 'unit_price', 20)
  )
);

select is(
  (select count(*) from public.invoice_items where invoice_id = '44444444-4444-4444-4444-444444444401'),
  2::bigint,
  'retrying update does not duplicate replacement items'
);

create temp table invoice_header_only_item_identity as
select id, created_at
from public.invoice_items
where invoice_id = '44444444-4444-4444-4444-444444444401';

select public.update_invoice_atomic(
  '44444444-4444-4444-4444-444444444401',
  jsonb_build_object(
    'client_name', 'Header Only Customer',
    'notes', 'Header only update',
    'tax_pct', 12
  ),
  null
);

select is(
  (select client_name from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  'Header Only Customer',
  'header-only update writes header fields'
);
select is(
  (select subtotal from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  140::numeric,
  'header-only update derives subtotal from existing items'
);
select is(
  (select total from public.invoices where id = '44444444-4444-4444-4444-444444444401'),
  156.8::numeric,
  'header-only tax update preserves the total formula'
);
select is(
  (
    select array_agg(row(i.id, i.created_at)::text order by i.id)
    from public.invoice_items i
    where i.invoice_id = '44444444-4444-4444-4444-444444444401'
  ),
  (
    select array_agg(row(i.id, i.created_at)::text order by i.id)
    from invoice_header_only_item_identity i
  ),
  'header-only update preserves invoice item identity and creation time'
);

select * from finish();

rollback;
