begin;

select plan(37);

select has_function(
  'public',
  'record_worker_reimbursement_payment_atomic',
  'atomic reimbursement payment RPC exists'
);

insert into public.workers (id, name)
values ('22222222-2222-2222-2222-222222222301', 'Atomic Reimbursement Worker')
on conflict (id) do update set name = excluded.name;

insert into public.projects (id, name)
values ('22222222-2222-2222-2222-222222222302', 'Atomic Reimbursement Project')
on conflict (id) do update set name = excluded.name;

insert into public.worker_reimbursements (id, worker_id, project_id, amount, vendor, description, status, reimbursement_date)
values
  ('22222222-2222-2222-2222-222222222311', '22222222-2222-2222-2222-222222222301', '22222222-2222-2222-2222-222222222302', 25, 'Atomic Vendor A', 'Atomic reimbursement A', 'pending', '2026-08-30'),
  ('22222222-2222-2222-2222-222222222312', '22222222-2222-2222-2222-222222222301', '22222222-2222-2222-2222-222222222302', 15, 'Atomic Vendor B', 'Atomic reimbursement B', 'pending', '2026-08-30'),
  ('22222222-2222-2222-2222-222222222321', '22222222-2222-2222-2222-222222222301', '22222222-2222-2222-2222-222222222302', 30, 'Header Failure Vendor', 'Header failure reimbursement', 'pending', '2026-08-30'),
  ('22222222-2222-2222-2222-222222222331', '22222222-2222-2222-2222-222222222301', '22222222-2222-2222-2222-222222222302', 40, 'Line Failure Vendor', 'Line failure reimbursement', 'pending', '2026-08-30'),
  ('22222222-2222-2222-2222-222222222351', '22222222-2222-2222-2222-222222222301', '22222222-2222-2222-2222-222222222302', 35, 'Completion Failure Vendor', 'Completion failure reimbursement', 'pending', '2026-08-30'),
  ('22222222-2222-2222-2222-222222222341', '22222222-2222-2222-2222-222222222301', '22222222-2222-2222-2222-222222222302', 45, 'Incomplete Replay Vendor', 'Incomplete replay reimbursement', 'pending', '2026-08-30'),
  ('22222222-2222-2222-2222-222222222342', '22222222-2222-2222-2222-222222222301', '22222222-2222-2222-2222-222222222302', 46, 'Missing Link Vendor', 'Missing payment link reimbursement', 'pending', '2026-08-30');

create temp table reimbursement_atomic_results (result jsonb);

insert into reimbursement_atomic_results (result)
select public.record_worker_reimbursement_payment_atomic(
  'reimbursement-key-success'::text,
  '22222222-2222-2222-2222-222222222301'::uuid,
  'ACH'::text,
  '2026-08-30'::date,
  'Atomic reimbursement payment'::text,
  array[
    '22222222-2222-2222-2222-222222222311',
    '22222222-2222-2222-2222-222222222312'
  ]::uuid[]
);

select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-success'), 1::bigint, 'success creates one worker payment');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222311'), 'paid', 'success marks first reimbursement paid');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222312'), 'paid', 'success marks second reimbursement paid');
select is((select payment_id::text from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222311'), (select result->>'payment_id' from reimbursement_atomic_results limit 1), 'success links first reimbursement to payment');
select is((select payment_id::text from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222312'), (select result->>'payment_id' from reimbursement_atomic_results limit 1), 'success links second reimbursement to payment');
select is((select count(*) from public.expenses where source = 'worker_reimbursement' and source_id in ('22222222-2222-2222-2222-222222222311', '22222222-2222-2222-2222-222222222312')), 2::bigint, 'success creates one reimbursement expense per reimbursement');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source = 'worker_reimbursement' and e.source_id in ('22222222-2222-2222-2222-222222222311', '22222222-2222-2222-2222-222222222312')), 2::bigint, 'success creates one expense line per reimbursement expense');
select ok((select count(*) = 2 from public.expenses where source = 'worker_reimbursement' and source_type = 'reimbursement' and status = 'paid' and reference_no in ('REIM-22222222-2222-2222-2222-222222222311', 'REIM-22222222-2222-2222-2222-222222222312')), 'success preserves reimbursement expense source and paid status');
select ok((select count(*) = 2 from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source = 'worker_reimbursement' and el.project_id = '22222222-2222-2222-2222-222222222302'::uuid and el.amount in (25, 15)), 'success preserves reimbursement expense-line project and amounts');

insert into reimbursement_atomic_results (result)
select public.record_worker_reimbursement_payment_atomic(
  'reimbursement-key-success'::text,
  '22222222-2222-2222-2222-222222222301'::uuid,
  'ACH'::text,
  '2026-08-30'::date,
  'Atomic reimbursement payment'::text,
  array[
    '22222222-2222-2222-2222-222222222311',
    '22222222-2222-2222-2222-222222222312'
  ]::uuid[]
);

select is((select result->>'payment_id' from reimbursement_atomic_results order by ctid limit 1), (select result->>'payment_id' from reimbursement_atomic_results order by ctid desc limit 1), 'same idempotency key returns the original payment');
select is((select (result->>'reused')::boolean from reimbursement_atomic_results order by ctid desc limit 1), true, 'same idempotency key reports reused');
select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-success'), 1::bigint, 'same idempotency key creates exactly one payment');
select is((select count(*) from public.expenses where source = 'worker_reimbursement' and source_id in ('22222222-2222-2222-2222-222222222311', '22222222-2222-2222-2222-222222222312')), 2::bigint, 'same idempotency key creates exactly two reimbursement expenses');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source = 'worker_reimbursement' and e.source_id in ('22222222-2222-2222-2222-222222222311', '22222222-2222-2222-2222-222222222312')), 2::bigint, 'same idempotency key creates exactly two reimbursement expense lines');

select throws_ok(
  $$
    select public.record_worker_reimbursement_payment_atomic(
      'reimbursement-key-success'::text,
      '22222222-2222-2222-2222-222222222301'::uuid,
      'Cash'::text,
      '2026-08-30'::date,
      'Atomic reimbursement payment'::text,
      array[
        '22222222-2222-2222-2222-222222222311',
        '22222222-2222-2222-2222-222222222312'
      ]::uuid[]
    )
  $$,
  '23505',
  'Reimbursement idempotency key was reused with different content.',
  'same idempotency key with changed payload is rejected'
);

insert into public.worker_payments (
  worker_id, total_amount, payment_method, payment_date, idempotency_key
)
values (
  '22222222-2222-2222-2222-222222222301', 45, 'ACH', '2026-08-30',
  'reimbursement-key-incomplete'
);
select throws_ok(
  $$
    select public.record_worker_reimbursement_payment_atomic(
      'reimbursement-key-incomplete'::text,
      '22222222-2222-2222-2222-222222222301'::uuid,
      'ACH'::text,
      '2026-08-30'::date,
      null::text,
      array['22222222-2222-2222-2222-222222222341']::uuid[]
    )
  $$,
  '23514',
  'Existing reimbursement idempotency record is incomplete.',
  'incomplete reimbursement payment is never returned as reused'
);

select throws_ok(
  $$
    update public.worker_reimbursements
    set status = 'paid'
    where id = '22222222-2222-2222-2222-222222222342'
  $$,
  '23514',
  'A paid reimbursement must be linked to a worker payment.',
  'paid transition without a worker payment link is rejected'
);
select is(
  (select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222342'),
  'pending',
  'failed paid transition preserves the pending reimbursement state'
);

create function pg_temp.fail_reimbursement_expense_header()
returns trigger language plpgsql as $$ begin raise exception 'injected reimbursement expense header failure'; end; $$;
create trigger reimbursement_atomic_fail_expense_header
before insert on public.expenses
for each row execute function pg_temp.fail_reimbursement_expense_header();
select throws_ok(
  $$
    select public.record_worker_reimbursement_payment_atomic(
      'reimbursement-key-header-fail'::text,
      '22222222-2222-2222-2222-222222222301'::uuid,
      'ACH'::text,
      '2026-08-30'::date,
      null::text,
      array['22222222-2222-2222-2222-222222222321']::uuid[]
    )
  $$,
  'P0001',
  'injected reimbursement expense header failure',
  'expense header failure aborts reimbursement settlement'
);
drop trigger reimbursement_atomic_fail_expense_header on public.expenses;
select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-header-fail'), 0::bigint, 'expense header failure rolls back worker payment');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222321'), 'pending', 'expense header failure preserves reimbursement status');
select is((select payment_id from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222321'), null::uuid, 'expense header failure preserves null reimbursement payment link');
select is((select count(*) from public.expenses where source_id = '22222222-2222-2222-2222-222222222321'), 0::bigint, 'expense header failure leaves no reimbursement expense');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source_id = '22222222-2222-2222-2222-222222222321'), 0::bigint, 'expense header failure leaves no reimbursement expense line');

create function pg_temp.fail_reimbursement_expense_line()
returns trigger language plpgsql as $$ begin raise exception 'injected reimbursement expense line failure'; end; $$;
create trigger reimbursement_atomic_fail_expense_line
before insert on public.expense_lines
for each row execute function pg_temp.fail_reimbursement_expense_line();
select throws_ok(
  $$
    select public.record_worker_reimbursement_payment_atomic(
      'reimbursement-key-line-fail'::text,
      '22222222-2222-2222-2222-222222222301'::uuid,
      'ACH'::text,
      '2026-08-30'::date,
      null::text,
      array['22222222-2222-2222-2222-222222222331']::uuid[]
    )
  $$,
  'P0001',
  'injected reimbursement expense line failure',
  'expense line failure aborts reimbursement settlement'
);
drop trigger reimbursement_atomic_fail_expense_line on public.expense_lines;
select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-line-fail'), 0::bigint, 'expense line failure rolls back worker payment');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222331'), 'pending', 'expense line failure preserves reimbursement status');
select is((select payment_id from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222331'), null::uuid, 'expense line failure preserves null reimbursement payment link');
select is((select count(*) from public.expenses where source_id = '22222222-2222-2222-2222-222222222331'), 0::bigint, 'expense line failure rolls back reimbursement expense header');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source_id = '22222222-2222-2222-2222-222222222331'), 0::bigint, 'expense line failure leaves no reimbursement expense line');

create function pg_temp.fail_reimbursement_completion_metadata()
returns trigger language plpgsql as $$
begin
  if new.idempotency_key = 'reimbursement-key-completion-fail'
    and new.settlement_completed_at is not null
  then
    raise exception 'injected reimbursement completion metadata failure';
  end if;
  return new;
end;
$$;
create trigger reimbursement_atomic_fail_completion_metadata
before update on public.worker_payments
for each row execute function pg_temp.fail_reimbursement_completion_metadata();
select throws_ok(
  $$
    select public.record_worker_reimbursement_payment_atomic(
      'reimbursement-key-completion-fail'::text,
      '22222222-2222-2222-2222-222222222301'::uuid,
      'ACH'::text,
      '2026-08-30'::date,
      null::text,
      array['22222222-2222-2222-2222-222222222351']::uuid[]
    )
  $$,
  'P0001',
  'injected reimbursement completion metadata failure',
  'completion metadata failure aborts reimbursement settlement'
);
drop trigger reimbursement_atomic_fail_completion_metadata on public.worker_payments;
select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-completion-fail'), 0::bigint, 'completion metadata failure rolls back worker payment');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222351'), 'pending', 'completion metadata failure preserves reimbursement status');
select is((select payment_id from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222351'), null::uuid, 'completion metadata failure preserves null reimbursement payment link');
select is((select count(*) from public.expenses where source_id = '22222222-2222-2222-2222-222222222351'), 0::bigint, 'completion metadata failure rolls back reimbursement expense');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source_id = '22222222-2222-2222-2222-222222222351'), 0::bigint, 'completion metadata failure rolls back reimbursement expense line');

select * from finish();

rollback;
