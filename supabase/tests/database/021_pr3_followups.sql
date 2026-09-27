begin;

select plan(8);

select ok(
  (
    select a.attgenerated = ''
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'invoice_items'
      and a.attname = 'quantity'
      and not a.attisdropped
  ),
  'invoice_items.quantity is a plain column'
);

select public.create_invoice_atomic(
  'pr3-followup-qty',
  jsonb_build_object(
    'invoice_no', 'PR3-FOLLOWUP-QTY',
    'client_name', 'Followup Customer',
    'issue_date', '2026-09-27',
    'due_date', '2026-10-27',
    'tax_pct', 0
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Fractional line', 'qty', 2.5, 'unit_price', 19.99)
  )
);

select is(
  (
    select ii.quantity
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.idempotency_key = 'pr3-followup-qty'
  ),
  2.5::numeric,
  'create_invoice_atomic stores quantity equal to qty 2.5'
);

select is(
  (
    select ii.qty
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.idempotency_key = 'pr3-followup-qty'
  ),
  2.5::numeric,
  'create_invoice_atomic stores qty 2.5'
);

select is(
  (select total from public.invoices where idempotency_key = 'pr3-followup-qty'),
  49.98::numeric,
  'fractional line total is 49.98'
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'change_order_budget_reversals'
  ),
  'change_order_budget_reversals has row level security'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.change_order_budget_reversals', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.change_order_budget_reversals', 'insert'),
  'anon cannot read or write change_order_budget_reversals'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.change_order_budget_reversals', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.change_order_budget_reversals', 'insert'),
  'authenticated cannot read or write change_order_budget_reversals'
);

insert into public.projects (id, name, status, budget, contract_amount, organization_id)
values (
  '21212121-2121-4121-8121-212121212121',
  'Followup change order project',
  'active',
  1000,
  1000,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

insert into public.project_change_orders (id, project_id, number, sequence, status, total, total_amount)
values (
  '21212121-2121-4121-8121-212121212122',
  '21212121-2121-4121-8121-212121212121',
  'CO-FOLLOWUP',
  1,
  'Draft',
  80,
  80
);

insert into public.project_change_order_items (
  change_order_id, project_id, description, qty, unit, unit_price, total
)
values (
  '21212121-2121-4121-8121-212121212122',
  '21212121-2121-4121-8121-212121212121',
  'Extra work',
  1,
  'EA',
  80,
  80
);

select public.approve_change_order('21212121-2121-4121-8121-212121212122', null);

select is(
  (select status from public.project_change_orders where id = '21212121-2121-4121-8121-212121212122'),
  'Approved',
  'approve_change_order still approves after the reversal table is locked'
);

select * from finish();

rollback;
