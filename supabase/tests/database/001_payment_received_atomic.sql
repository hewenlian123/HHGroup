begin;

select plan(35);

select has_function(
  'public',
  'record_payment_received_atomic',
  'atomic Payment Received create RPC exists'
);
select has_function(
  'public',
  'update_payment_received_atomic',
  'atomic Payment Received update RPC exists'
);

insert into public.invoices (id, invoice_no, client_name, status, total)
values
  ('11111111-1111-1111-1111-111111111101', 'ATOMIC-PAY-1', 'Atomic Customer', 'Sent', 100),
  ('11111111-1111-1111-1111-111111111102', 'ATOMIC-PAY-2', 'Atomic Customer', 'Sent', 100),
  ('11111111-1111-1111-1111-111111111103', 'ATOMIC-PAY-3', 'Atomic Customer', 'Sent', 100),
  ('11111111-1111-1111-1111-111111111104', 'ATOMIC-PAY-4', 'Atomic Customer', 'Sent', 100),
  ('11111111-1111-1111-1111-111111111105', 'ATOMIC-PAY-5', 'Atomic Customer', 'Sent', 100),
  ('11111111-1111-1111-1111-111111111106', 'ATOMIC-PAY-6', 'Atomic Customer', 'Sent', 100);

create temp table payment_atomic_results (result jsonb);

insert into payment_atomic_results (result)
select public.record_payment_received_atomic(
  'payment-key-success',
  '11111111-1111-1111-1111-111111111101',
  null,
  'Atomic Customer',
  '2026-08-29',
  40,
  'ACH',
  'Operating',
  'Atomic payment',
  null
);

select is(
  (select count(*) from public.payments_received where idempotency_key = 'payment-key-success'),
  1::bigint,
  'success creates one payment'
);
select is(
  (
    select count(*)
    from public.deposits d
    join public.payments_received p on p.id = d.payment_id
    where p.idempotency_key = 'payment-key-success'
      and coalesce(d.status, 'recorded') <> 'void'
  ),
  1::bigint,
  'success creates one deposit'
);
select is(
  (
    select count(*)
    from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-key-success'
  ),
  1::bigint,
  'success creates one allocation'
);
select is(
  (select status from public.invoices where id = '11111111-1111-1111-1111-111111111101'),
  'Partially Paid',
  'success updates invoice status'
);

insert into payment_atomic_results (result)
select public.record_payment_received_atomic(
  'payment-key-success',
  '11111111-1111-1111-1111-111111111101',
  null,
  'Atomic Customer',
  '2026-08-29',
  40,
  'ACH',
  'Operating',
  'Atomic payment',
  null
);

select is(
  (select result->>'payment_id' from payment_atomic_results order by ctid limit 1),
  (select result->>'payment_id' from payment_atomic_results order by ctid desc limit 1),
  'same key and payload returns the same payment'
);
select is(
  (select (result->>'reused')::boolean from payment_atomic_results order by ctid desc limit 1),
  true,
  'same key and payload is reported as reused'
);
select is(
  (select count(*) from public.payments_received where idempotency_key = 'payment-key-success'),
  1::bigint,
  'same key and payload remains exactly once'
);
select throws_ok(
  $$
    select public.record_payment_received_atomic(
      'payment-key-success',
      '11111111-1111-1111-1111-111111111101',
      null,
      'Atomic Customer',
      '2026-08-29',
      41,
      'ACH',
      'Operating',
      'Atomic payment',
      null
    )
  $$,
  '23505',
  'Payment idempotency key was reused with different content.',
  'same key with changed content is rejected'
);

insert into public.payments_received (
  invoice_id, customer_name, payment_date, amount, payment_method, idempotency_key
)
values (
  '11111111-1111-1111-1111-111111111106', 'Atomic Customer', '2026-08-29', 10, 'ACH',
  'payment-key-incomplete'
);
select throws_ok(
  $$
    select public.record_payment_received_atomic(
      'payment-key-incomplete',
      '11111111-1111-1111-1111-111111111106',
      null,
      'Atomic Customer',
      '2026-08-29',
      10,
      'ACH',
      null,
      null,
      null
    )
  $$,
  '23514',
  'Existing payment idempotency record is incomplete.',
  'incomplete payment is never returned as reused'
);

create function pg_temp.fail_deposit_write()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected deposit failure';
end;
$$;
create trigger payment_atomic_fail_deposit
before insert on public.deposits
for each row execute function pg_temp.fail_deposit_write();

select throws_ok(
  $$
    select public.record_payment_received_atomic(
      'payment-key-deposit-fail',
      '11111111-1111-1111-1111-111111111102',
      null,
      'Atomic Customer',
      '2026-08-29',
      25,
      'ACH',
      'Operating',
      null,
      null
    )
  $$,
  'P0001',
  'injected deposit failure',
  'deposit failure aborts the RPC'
);
drop trigger payment_atomic_fail_deposit on public.deposits;

select is((select count(*) from public.payments_received where idempotency_key = 'payment-key-deposit-fail'), 0::bigint, 'deposit failure rolls back payment');
select is((select count(*) from public.deposits where invoice_id = '11111111-1111-1111-1111-111111111102'), 0::bigint, 'deposit failure leaves no deposit');
select is((select count(*) from public.invoice_payments where invoice_id = '11111111-1111-1111-1111-111111111102'), 0::bigint, 'deposit failure leaves no allocation');
select is((select status from public.invoices where id = '11111111-1111-1111-1111-111111111102'), 'Sent', 'deposit failure preserves invoice status');

create function pg_temp.fail_allocation_write()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected allocation failure';
end;
$$;
create trigger payment_atomic_fail_allocation
before insert on public.invoice_payments
for each row execute function pg_temp.fail_allocation_write();

select throws_ok(
  $$
    select public.record_payment_received_atomic(
      'payment-key-allocation-fail',
      '11111111-1111-1111-1111-111111111103',
      null,
      'Atomic Customer',
      '2026-08-29',
      25,
      'ACH',
      'Operating',
      null,
      null
    )
  $$,
  'P0001',
  'injected allocation failure',
  'allocation failure aborts the RPC'
);
drop trigger payment_atomic_fail_allocation on public.invoice_payments;

select is((select count(*) from public.payments_received where idempotency_key = 'payment-key-allocation-fail'), 0::bigint, 'allocation failure rolls back payment');
select is((select count(*) from public.deposits where invoice_id = '11111111-1111-1111-1111-111111111103'), 0::bigint, 'allocation failure rolls back deposit');
select is((select count(*) from public.invoice_payments where invoice_id = '11111111-1111-1111-1111-111111111103'), 0::bigint, 'allocation failure leaves no allocation');
select is((select status from public.invoices where id = '11111111-1111-1111-1111-111111111103'), 'Sent', 'allocation failure preserves invoice status');

create function pg_temp.fail_invoice_status_write()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected invoice status failure';
end;
$$;
create trigger payment_atomic_fail_invoice_status
before update on public.invoices
for each row execute function pg_temp.fail_invoice_status_write();

select throws_ok(
  $$
    select public.record_payment_received_atomic(
      'payment-key-status-fail',
      '11111111-1111-1111-1111-111111111104',
      null,
      'Atomic Customer',
      '2026-08-29',
      25,
      'ACH',
      'Operating',
      null,
      null
    )
  $$,
  'P0001',
  'injected invoice status failure',
  'invoice status failure aborts the RPC'
);
drop trigger payment_atomic_fail_invoice_status on public.invoices;

select is((select count(*) from public.payments_received where idempotency_key = 'payment-key-status-fail'), 0::bigint, 'status failure rolls back payment');
select is((select count(*) from public.deposits where invoice_id = '11111111-1111-1111-1111-111111111104'), 0::bigint, 'status failure rolls back deposit');
select is((select count(*) from public.invoice_payments where invoice_id = '11111111-1111-1111-1111-111111111104'), 0::bigint, 'status failure rolls back allocation');
select is((select status from public.invoices where id = '11111111-1111-1111-1111-111111111104'), 'Sent', 'status failure preserves invoice status');

select public.record_payment_received_atomic(
  'payment-key-update',
  '11111111-1111-1111-1111-111111111105',
  null,
  'Atomic Customer',
  '2026-08-29',
  50,
  'ACH',
  'Operating',
  'Before update',
  null
);

select public.update_payment_received_atomic(
  (select id from public.payments_received where idempotency_key = 'payment-key-update'),
  '2026-08-30',
  60,
  'Check',
  'Savings',
  'After update'
);

select is((select amount from public.payments_received where idempotency_key = 'payment-key-update'), 60::numeric, 'update changes payment amount');
select is((select d.amount from public.deposits d join public.payments_received p on p.id = d.payment_id where p.idempotency_key = 'payment-key-update'), 60::numeric, 'update changes deposit amount');
select is((select ip.amount from public.invoice_payments ip join public.payments_received p on p.id = ip.payment_received_id where p.idempotency_key = 'payment-key-update'), 60::numeric, 'update changes allocation amount');
select is((select status from public.invoices where id = '11111111-1111-1111-1111-111111111105'), 'Partially Paid', 'update reconciles invoice status');

create function pg_temp.fail_deposit_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected deposit update failure';
end;
$$;
create trigger payment_atomic_fail_deposit_update
before update on public.deposits
for each row execute function pg_temp.fail_deposit_update();

select throws_ok(
  $$
    select public.update_payment_received_atomic(
      (select id from public.payments_received where idempotency_key = 'payment-key-update'),
      '2026-08-31',
      70,
      'Wire',
      'Operating',
      'Must roll back'
    )
  $$,
  'P0001',
  'injected deposit update failure',
  'update downstream failure aborts the RPC'
);
drop trigger payment_atomic_fail_deposit_update on public.deposits;

select is((select amount from public.payments_received where idempotency_key = 'payment-key-update'), 60::numeric, 'failed update rolls back payment');
select is((select d.amount from public.deposits d join public.payments_received p on p.id = d.payment_id where p.idempotency_key = 'payment-key-update'), 60::numeric, 'failed update preserves deposit');
select is((select ip.amount from public.invoice_payments ip join public.payments_received p on p.id = ip.payment_received_id where p.idempotency_key = 'payment-key-update'), 60::numeric, 'failed update preserves allocation');
select is((select status from public.invoices where id = '11111111-1111-1111-1111-111111111105'), 'Partially Paid', 'failed update preserves invoice status');

select * from finish();

rollback;
