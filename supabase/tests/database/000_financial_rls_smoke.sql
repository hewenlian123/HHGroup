begin;

select plan(15);

select has_schema('public', 'public schema exists');

select has_table('public', 'estimates', 'estimates table exists');
select has_table('public', 'invoices', 'invoices table exists');
select has_table('public', 'payments_received', 'payments_received table exists');
select has_table('public', 'deposits', 'deposits table exists');
select has_table('public', 'expenses', 'expenses table exists');
select has_table('public', 'labor_payments', 'labor_payments table exists');
select has_table('public', 'worker_payments', 'worker_payments table exists');

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'estimates'
  ), false),
  'estimates has row level security enabled'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'invoices'
  ), false),
  'invoices has row level security enabled'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'payments_received'
  ), false),
  'payments_received has row level security enabled'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'deposits'
  ), false),
  'deposits has row level security enabled'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'expenses'
  ), false),
  'expenses has row level security enabled'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'labor_payments'
  ), false),
  'labor_payments has row level security enabled'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'worker_payments'
  ), false),
  'worker_payments has row level security enabled'
);

select * from finish();

rollback;
