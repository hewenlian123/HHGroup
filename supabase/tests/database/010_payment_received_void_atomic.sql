begin;

select no_plan();

select has_function(
  'public',
  'void_payment_received_atomic',
  array['uuid'],
  'atomic Payment Received void RPC exists'
);

insert into public.invoices (
  id,
  invoice_no,
  client_name,
  status,
  total,
  paid_total,
  balance_due
)
values
  ('11111111-1111-1111-1111-111111111201', 'ATOMIC-VOID-1', 'Void Customer', 'Sent', 100, 0, 100),
  ('11111111-1111-1111-1111-111111111202', 'ATOMIC-VOID-2', 'Void Customer', 'Sent', 100, 0, 100),
  ('11111111-1111-1111-1111-111111111203', 'ATOMIC-VOID-3', 'Void Customer', 'Sent', 100, 0, 100),
  ('11111111-1111-1111-1111-111111111204', 'ATOMIC-VOID-4', 'Void Customer', 'Sent', 100, 0, 100),
  ('11111111-1111-1111-1111-111111111205', 'ATOMIC-VOID-5', 'Void Customer', 'Sent', 100, 0, 100),
  ('11111111-1111-1111-1111-111111111206', 'ATOMIC-VOID-6', 'Void Customer', 'Sent', 100, 0, 100),
  ('11111111-1111-1111-1111-111111111207', 'ATOMIC-VOID-7', 'Void Customer', 'Sent', 100, 0, 100),
  ('11111111-1111-1111-1111-111111111208', 'ATOMIC-VOID-8', 'Void Customer', 'Sent', 100, 0, 100);

-- Success fixture: a direct target, a second direct payment, and an unlinked
-- legacy row with the same amount/date/memo as the target. Only the exact
-- payment_received_id relation may be voided.
select public.record_payment_received_atomic(
  'payment-void-success-target',
  '11111111-1111-1111-1111-111111111201',
  null,
  'Void Customer',
  '2026-09-01',
  40,
  'ACH',
  'Operating',
  'Same memo',
  null
);
select public.record_payment_received_atomic(
  'payment-void-success-other',
  '11111111-1111-1111-1111-111111111201',
  null,
  'Void Customer',
  '2026-09-01',
  10,
  'ACH',
  'Operating',
  'Other payment',
  null
);
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
  '11111111-1111-1111-1111-111111111201',
  '2026-09-01',
  40,
  'ACH',
  'Same memo',
  'Posted',
  null
);

create temp table payment_void_results (result jsonb);
insert into payment_void_results (result)
select public.void_payment_received_atomic(
  (select id from public.payments_received where idempotency_key = 'payment-void-success-target')
);

select is(
  (select status from public.payments_received where idempotency_key = 'payment-void-success-target'),
  'void',
  'success voids the Payment Received record'
);
select is(
  (select amount from public.payments_received where idempotency_key = 'payment-void-success-target'),
  40::numeric,
  'success preserves the original Payment amount'
);
select is(
  (select invoice_id from public.payments_received where idempotency_key = 'payment-void-success-target'),
  '11111111-1111-1111-1111-111111111201'::uuid,
  'success preserves the Payment to Invoice association'
);
select is(
  (
    select d.status
    from public.deposits d
    join public.payments_received p on p.id = d.payment_id
    where p.idempotency_key = 'payment-void-success-target'
  ),
  'void',
  'success voids the linked Deposit'
);
select is(
  (
    select d.amount
    from public.deposits d
    join public.payments_received p on p.id = d.payment_id
    where p.idempotency_key = 'payment-void-success-target'
  ),
  40::numeric,
  'success preserves the original Deposit amount'
);
select is(
  (
    select ip.status
    from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-void-success-target'
  ),
  'Voided',
  'success voids the exact linked Invoice allocation'
);
select is(
  (
    select ip.amount
    from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-void-success-target'
  ),
  40::numeric,
  'success preserves the original allocation amount'
);
select is(
  (
    select ip.status
    from public.invoice_payments ip
    where ip.invoice_id = '11111111-1111-1111-1111-111111111201'
      and ip.payment_received_id is null
      and ip.amount = 40
      and ip.memo = 'Same memo'
  ),
  'Posted',
  'success does not touch a fuzzy-matched legacy allocation'
);
select is(
  (
    select ip.status
    from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-void-success-other'
  ),
  'Posted',
  'success does not touch another directly linked payment'
);
select is(
  (select paid_total from public.invoices where id = '11111111-1111-1111-1111-111111111201'),
  50::numeric,
  'success reconciles Invoice paid total from remaining Posted allocations'
);
select is(
  (select balance_due from public.invoices where id = '11111111-1111-1111-1111-111111111201'),
  50::numeric,
  'success reconciles Invoice balance from remaining Posted allocations'
);
select is(
  (select status from public.invoices where id = '11111111-1111-1111-1111-111111111201'),
  'Partially Paid',
  'success reconciles Invoice status from remaining Posted allocations'
);
select is(
  (select (result->>'paid_total')::numeric from payment_void_results order by ctid limit 1),
  50::numeric,
  'success returns the canonical Invoice paid total'
);
select is(
  (select (result->>'balance_due')::numeric from payment_void_results order by ctid limit 1),
  50::numeric,
  'success returns the canonical Invoice balance'
);
select is(
  (select (result->>'reused')::boolean from payment_void_results order by ctid limit 1),
  false,
  'first success is not reported as reused'
);

insert into payment_void_results (result)
select public.void_payment_received_atomic(
  (select id from public.payments_received where idempotency_key = 'payment-void-success-target')
);
select is(
  (select (result->>'reused')::boolean from payment_void_results order by ctid desc limit 1),
  true,
  'duplicate retry returns the already committed Void result'
);
select is(
  (select count(*) from public.invoice_payments where invoice_id = '11111111-1111-1111-1111-111111111201' and status = 'Voided'),
  1::bigint,
  'duplicate retry does not create or widen the Void effect'
);

-- Missing direct linkage must fail closed. A legacy fuzzy match is not write
-- authority for this operation.
select public.record_payment_received_atomic(
  'payment-void-missing-link',
  '11111111-1111-1111-1111-111111111202',
  null,
  'Void Customer',
  '2026-09-01',
  25,
  'Check',
  'Operating',
  'Missing direct link',
  null
);
update public.invoice_payments
set payment_received_id = null
where payment_received_id = (
  select id from public.payments_received where idempotency_key = 'payment-void-missing-link'
);
select throws_ok(
  $$
    select public.void_payment_received_atomic(
      (select id from public.payments_received where idempotency_key = 'payment-void-missing-link')
    )
  $$,
  '23514',
  'Payment allocation is missing or ambiguous.',
  'missing direct allocation fails closed'
);
select is(
  (select status from public.payments_received where idempotency_key = 'payment-void-missing-link'),
  'completed',
  'missing direct allocation preserves Payment status'
);
select is(
  (
    select d.status from public.deposits d
    join public.payments_received p on p.id = d.payment_id
    where p.idempotency_key = 'payment-void-missing-link'
  ),
  'recorded',
  'missing direct allocation preserves Deposit status'
);

-- Mismatched Deposit ownership must fail before any write.
select public.record_payment_received_atomic(
  'payment-void-bad-deposit',
  '11111111-1111-1111-1111-111111111203',
  null,
  'Void Customer',
  '2026-09-01',
  30,
  'Wire',
  'Operating',
  'Bad deposit association',
  null
);
update public.deposits
set invoice_id = '11111111-1111-1111-1111-111111111204'
where payment_id = (
  select id from public.payments_received where idempotency_key = 'payment-void-bad-deposit'
);
select throws_ok(
  $$
    select public.void_payment_received_atomic(
      (select id from public.payments_received where idempotency_key = 'payment-void-bad-deposit')
    )
  $$,
  '23514',
  'Payment deposit association is inconsistent.',
  'mismatched Deposit association fails closed'
);
select is(
  (select status from public.payments_received where idempotency_key = 'payment-void-bad-deposit'),
  'completed',
  'mismatched Deposit association preserves Payment status'
);
select is(
  (
    select ip.status from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-void-bad-deposit'
  ),
  'Posted',
  'mismatched Deposit association preserves allocation status'
);

-- Failure injection fixtures. Every downstream error must roll the complete
-- operation back to the pre-call snapshot.
select public.record_payment_received_atomic(
  'payment-void-fail-deposit',
  '11111111-1111-1111-1111-111111111205',
  null,
  'Void Customer',
  '2026-09-01',
  20,
  'ACH',
  'Operating',
  'Deposit failure',
  null
);
create function pg_temp.fail_void_deposit_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected Void deposit failure';
end;
$$;
create trigger payment_void_fail_deposit
before update on public.deposits
for each row execute function pg_temp.fail_void_deposit_update();
select throws_ok(
  $$
    select public.void_payment_received_atomic(
      (select id from public.payments_received where idempotency_key = 'payment-void-fail-deposit')
    )
  $$,
  'P0001',
  'injected Void deposit failure',
  'Deposit failure aborts the atomic Void'
);
drop trigger payment_void_fail_deposit on public.deposits;
select is(
  (select status from public.payments_received where idempotency_key = 'payment-void-fail-deposit'),
  'completed',
  'Deposit failure preserves Payment status'
);
select is(
  (
    select ip.status from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-void-fail-deposit'
  ),
  'Posted',
  'Deposit failure preserves allocation status'
);

select public.record_payment_received_atomic(
  'payment-void-fail-allocation',
  '11111111-1111-1111-1111-111111111206',
  null,
  'Void Customer',
  '2026-09-01',
  20,
  'ACH',
  'Operating',
  'Allocation failure',
  null
);
create function pg_temp.fail_void_allocation_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected Void allocation failure';
end;
$$;
create trigger payment_void_fail_allocation
before update on public.invoice_payments
for each row execute function pg_temp.fail_void_allocation_update();
select throws_ok(
  $$
    select public.void_payment_received_atomic(
      (select id from public.payments_received where idempotency_key = 'payment-void-fail-allocation')
    )
  $$,
  'P0001',
  'injected Void allocation failure',
  'allocation failure aborts the atomic Void'
);
drop trigger payment_void_fail_allocation on public.invoice_payments;
select is(
  (
    select d.status from public.deposits d
    join public.payments_received p on p.id = d.payment_id
    where p.idempotency_key = 'payment-void-fail-allocation'
  ),
  'recorded',
  'allocation failure rolls the Deposit back'
);
select is(
  (select status from public.payments_received where idempotency_key = 'payment-void-fail-allocation'),
  'completed',
  'allocation failure preserves Payment status'
);

select public.record_payment_received_atomic(
  'payment-void-fail-payment',
  '11111111-1111-1111-1111-111111111207',
  null,
  'Void Customer',
  '2026-09-01',
  20,
  'ACH',
  'Operating',
  'Payment failure',
  null
);
create function pg_temp.fail_void_payment_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected Void payment failure';
end;
$$;
create trigger payment_void_fail_payment
before update on public.payments_received
for each row execute function pg_temp.fail_void_payment_update();
select throws_ok(
  $$
    select public.void_payment_received_atomic(
      (select id from public.payments_received where idempotency_key = 'payment-void-fail-payment')
    )
  $$,
  'P0001',
  'injected Void payment failure',
  'Payment failure aborts the atomic Void'
);
drop trigger payment_void_fail_payment on public.payments_received;
select is(
  (
    select d.status from public.deposits d
    join public.payments_received p on p.id = d.payment_id
    where p.idempotency_key = 'payment-void-fail-payment'
  ),
  'recorded',
  'Payment failure rolls the Deposit back'
);
select is(
  (
    select ip.status from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-void-fail-payment'
  ),
  'Posted',
  'Payment failure rolls the allocation back'
);

select public.record_payment_received_atomic(
  'payment-void-fail-invoice',
  '11111111-1111-1111-1111-111111111208',
  null,
  'Void Customer',
  '2026-09-01',
  20,
  'ACH',
  'Operating',
  'Invoice failure',
  null
);
create function pg_temp.fail_void_invoice_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected Void invoice failure';
end;
$$;
create trigger payment_void_fail_invoice
before update on public.invoices
for each row execute function pg_temp.fail_void_invoice_update();
select throws_ok(
  $$
    select public.void_payment_received_atomic(
      (select id from public.payments_received where idempotency_key = 'payment-void-fail-invoice')
    )
  $$,
  'P0001',
  'injected Void invoice failure',
  'Invoice reconciliation failure aborts the atomic Void'
);
drop trigger payment_void_fail_invoice on public.invoices;
select is(
  (select status from public.payments_received where idempotency_key = 'payment-void-fail-invoice'),
  'completed',
  'Invoice failure rolls the Payment back'
);
select is(
  (
    select d.status from public.deposits d
    join public.payments_received p on p.id = d.payment_id
    where p.idempotency_key = 'payment-void-fail-invoice'
  ),
  'recorded',
  'Invoice failure rolls the Deposit back'
);
select is(
  (
    select ip.status from public.invoice_payments ip
    join public.payments_received p on p.id = ip.payment_received_id
    where p.idempotency_key = 'payment-void-fail-invoice'
  ),
  'Posted',
  'Invoice failure rolls the allocation back'
);

select * from finish();

rollback;
