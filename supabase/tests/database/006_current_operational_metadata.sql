begin;

select plan(40);

-- labor_payments keeps the exact payroll period attached to a payment. The
-- physical columns stay nullable, while the validated check prevents partial
-- or reversed ranges.
select has_column('public', 'labor_payments', 'applied_start_date', 'labor payment has applied start date');
select col_type_is('public', 'labor_payments', 'applied_start_date', 'date', 'applied start date uses date semantics');
select col_is_null('public', 'labor_payments', 'applied_start_date', 'applied start date remains physically nullable');
select has_column('public', 'labor_payments', 'applied_end_date', 'labor payment has applied end date');
select col_type_is('public', 'labor_payments', 'applied_end_date', 'date', 'applied end date uses date semantics');
select col_is_null('public', 'labor_payments', 'applied_end_date', 'applied end date remains physically nullable');
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.labor_payments'::regclass
      and c.conname = 'labor_payments_applied_date_range_check'
      and c.contype = 'c'
      and c.convalidated
  ),
  'labor payment applied date range has a validated check'
);

insert into public.labor_workers (id, name)
values ('66666666-6666-4666-8666-666666666601', 'Operational Metadata Worker')
on conflict (id) do update set name = excluded.name;

select lives_ok(
  $$
    insert into public.labor_payments (
      id, worker_id, payment_date, amount, applied_start_date, applied_end_date
    ) values (
      '66666666-6666-4666-8666-666666666602',
      '66666666-6666-4666-8666-666666666601',
      '2026-08-30',
      100,
      null,
      null
    )
  $$,
  'labor payment accepts an unapplied period'
);
select lives_ok(
  $$
    insert into public.labor_payments (
      id, worker_id, payment_date, amount, applied_start_date, applied_end_date
    ) values (
      '66666666-6666-4666-8666-666666666603',
      '66666666-6666-4666-8666-666666666601',
      '2026-08-30',
      100,
      '2026-08-01',
      '2026-08-15'
    )
  $$,
  'labor payment accepts a complete ordered period'
);
select throws_ok(
  $$
    insert into public.labor_payments (
      id, worker_id, payment_date, amount, applied_start_date, applied_end_date
    ) values (
      '66666666-6666-4666-8666-666666666604',
      '66666666-6666-4666-8666-666666666601',
      '2026-08-30',
      100,
      '2026-08-01',
      null
    )
  $$,
  '23514',
  'new row for relation "labor_payments" violates check constraint "labor_payments_applied_date_range_check"',
  'labor payment rejects a missing applied end date'
);
select throws_ok(
  $$
    insert into public.labor_payments (
      id, worker_id, payment_date, amount, applied_start_date, applied_end_date
    ) values (
      '66666666-6666-4666-8666-666666666605',
      '66666666-6666-4666-8666-666666666601',
      '2026-08-30',
      100,
      null,
      '2026-08-15'
    )
  $$,
  '23514',
  'new row for relation "labor_payments" violates check constraint "labor_payments_applied_date_range_check"',
  'labor payment rejects a missing applied start date'
);
select throws_ok(
  $$
    insert into public.labor_payments (
      id, worker_id, payment_date, amount, applied_start_date, applied_end_date
    ) values (
      '66666666-6666-4666-8666-666666666606',
      '66666666-6666-4666-8666-666666666601',
      '2026-08-30',
      100,
      '2026-08-16',
      '2026-08-15'
    )
  $$,
  '23514',
  'new row for relation "labor_payments" violates check constraint "labor_payments_applied_date_range_check"',
  'labor payment rejects a reversed applied period'
);

-- Change-order descriptive/impact fields are nullable metadata. The existing
-- total/amount behavior remains untouched.
select has_column('public', 'project_change_orders', 'title', 'change order has title metadata');
select col_type_is('public', 'project_change_orders', 'title', 'text', 'change order title uses text');
select col_is_null('public', 'project_change_orders', 'title', 'change order title remains nullable');
select has_column('public', 'project_change_orders', 'description', 'change order has description metadata');
select col_type_is('public', 'project_change_orders', 'description', 'text', 'change order description uses text');
select col_is_null('public', 'project_change_orders', 'description', 'change order description remains nullable');
select has_column('public', 'project_change_orders', 'cost_impact', 'change order has cost impact metadata');
select col_type_is('public', 'project_change_orders', 'cost_impact', 'numeric', 'change order cost impact uses numeric');
select col_is_null('public', 'project_change_orders', 'cost_impact', 'change order cost impact remains nullable');
select has_column('public', 'project_change_orders', 'schedule_impact_days', 'change order has schedule impact metadata');
select col_type_is('public', 'project_change_orders', 'schedule_impact_days', 'bigint', 'change order schedule impact uses bigint');
select col_is_null('public', 'project_change_orders', 'schedule_impact_days', 'change order schedule impact remains nullable');

insert into public.projects (id, name)
values ('66666666-6666-4666-8666-666666666610', 'Operational Metadata Project')
on conflict (id) do update set name = excluded.name;

select lives_ok(
  $$
    insert into public.project_change_orders (
      id, project_id, number, title, description, cost_impact, schedule_impact_days
    ) values (
      '66666666-6666-4666-8666-666666666611',
      '66666666-6666-4666-8666-666666666610',
      'CO-META-001',
      'Current operational title',
      'Current operational description',
      125.50,
      3
    )
  $$,
  'change order persists current descriptive and impact metadata'
);
select is(
  (select title from public.project_change_orders where id = '66666666-6666-4666-8666-666666666611'),
  'Current operational title',
  'change order retains title'
);
select is(
  (select description from public.project_change_orders where id = '66666666-6666-4666-8666-666666666611'),
  'Current operational description',
  'change order retains description'
);
select is(
  (select cost_impact from public.project_change_orders where id = '66666666-6666-4666-8666-666666666611'),
  125.50::numeric,
  'change order retains cost impact without changing total formulas'
);
select is(
  (select schedule_impact_days from public.project_change_orders where id = '66666666-6666-4666-8666-666666666611'),
  3::bigint,
  'change order retains schedule impact days'
);

-- Vendor status must be durable, default active, and limited to the current
-- active/inactive lifecycle without a blocking SET NOT NULL rewrite.
select has_column('public', 'vendors', 'status', 'vendor has persisted status');
select col_type_is('public', 'vendors', 'status', 'text', 'vendor status uses text');
select col_is_null('public', 'vendors', 'status', 'vendor status avoids a physical not-null rewrite');
select col_default_is('public', 'vendors', 'status', 'active', 'vendor status defaults to active');
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.vendors'::regclass
      and c.conname = 'vendors_status_check'
      and c.contype = 'c'
      and c.convalidated
  ),
  'vendor status has a validated lifecycle check'
);
select lives_ok(
  $$
    insert into public.vendors (id, name)
    values ('66666666-6666-4666-8666-666666666620', 'Operational Metadata Vendor')
  $$,
  'vendor creation uses the current active default'
);
select is(
  (select status from public.vendors where id = '66666666-6666-4666-8666-666666666620'),
  'active',
  'vendor status persists active'
);
select lives_ok(
  $$
    update public.vendors
    set status = 'inactive'
    where id = '66666666-6666-4666-8666-666666666620'
  $$,
  'vendor status can transition to inactive'
);
select is(
  (select status from public.vendors where id = '66666666-6666-4666-8666-666666666620'),
  'inactive',
  'vendor status persists inactive'
);
select throws_ok(
  $$
    update public.vendors
    set status = null
    where id = '66666666-6666-4666-8666-666666666620'
  $$,
  '23514',
  'new row for relation "vendors" violates check constraint "vendors_status_check"',
  'vendor status rejects null without a physical not-null constraint'
);
select throws_ok(
  $$
    update public.vendors
    set status = 'archived'
    where id = '66666666-6666-4666-8666-666666666620'
  $$,
  '23514',
  'new row for relation "vendors" violates check constraint "vendors_status_check"',
  'vendor status rejects obsolete lifecycle values'
);

select * from finish();

rollback;
