begin;

select plan(33);

select has_function(
  'public',
  'record_worker_payroll_settlement',
  'atomic payroll settlement RPC exists'
);

insert into public.workers (id, name)
values ('22222222-2222-2222-2222-222222222201', 'Atomic Worker')
on conflict (id) do update set name = excluded.name;
insert into public.labor_workers (id, name)
values ('22222222-2222-2222-2222-222222222201', 'Atomic Worker')
on conflict (id) do update set name = excluded.name;

insert into public.projects (id, name)
values ('22222222-2222-2222-2222-222222222202', 'Atomic Payroll Project')
on conflict (id) do update set name = excluded.name;

insert into public.labor_entries (
  id, worker_id, project_id, work_date, labor_cost_snapshot, amount_snapshot, cost_amount, status
)
values
  ('22222222-2222-2222-2222-222222222211', '22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222202', '2026-08-29', 100, 100, 100, 'Approved'),
  ('22222222-2222-2222-2222-222222222212', '22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222202', '2026-08-29', 50, 50, 50, 'Approved'),
  ('22222222-2222-2222-2222-222222222213', '22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222202', '2026-08-29', 60, 60, 60, 'Approved'),
  ('22222222-2222-2222-2222-222222222214', '22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222202', '2026-08-29', 70, 70, 70, 'Approved'),
  ('22222222-2222-2222-2222-222222222215', '22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222202', '2026-08-29', 90, 90, 90, 'Approved');

insert into public.worker_reimbursements (id, worker_id, amount, status, reimbursement_date)
values
  ('22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222201', 25, 'pending', '2026-08-29'),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222201', 15, 'pending', '2026-08-29'),
  ('22222222-2222-2222-2222-222222222223', '22222222-2222-2222-2222-222222222201', 16, 'pending', '2026-08-29'),
  ('22222222-2222-2222-2222-222222222224', '22222222-2222-2222-2222-222222222201', 17, 'pending', '2026-08-29'),
  ('22222222-2222-2222-2222-222222222225', '22222222-2222-2222-2222-222222222201', 18, 'pending', '2026-08-29');

insert into public.worker_advances (id, worker_id, amount, advance_date, status)
values
  ('22222222-2222-2222-2222-222222222231', '22222222-2222-2222-2222-222222222201', 10, '2026-08-01', 'pending'),
  ('22222222-2222-2222-2222-222222222232', '22222222-2222-2222-2222-222222222201', 5, '2026-08-01', 'pending'),
  ('22222222-2222-2222-2222-222222222233', '22222222-2222-2222-2222-222222222201', 6, '2026-08-01', 'pending'),
  ('22222222-2222-2222-2222-222222222234', '22222222-2222-2222-2222-222222222201', 7, '2026-08-01', 'pending'),
  ('22222222-2222-2222-2222-222222222235', '22222222-2222-2222-2222-222222222201', 8, '2026-08-01', 'pending');

create temp table payroll_atomic_results (result jsonb);

insert into payroll_atomic_results (result)
select public.record_worker_payroll_settlement(
  'payroll-key-success',
  '22222222-2222-2222-2222-222222222201',
  null,
  115,
  'ACH',
  '2026-08-29',
  'Atomic payroll',
  array['22222222-2222-2222-2222-222222222211']::uuid[],
  array['22222222-2222-2222-2222-222222222221']::uuid[],
  array['22222222-2222-2222-2222-222222222231']::uuid[],
  10
);

select is((select count(*) from public.worker_payments where idempotency_key = 'payroll-key-success'), 1::bigint, 'success creates one worker payment');
select is((select worker_payment_id::text from public.labor_entries where id = '22222222-2222-2222-2222-222222222211'), (select result->>'payment_id' from payroll_atomic_results limit 1), 'success links labor');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222221'), 'paid', 'success marks reimbursement paid');
select is((select payment_id::text from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222221'), (select result->>'payment_id' from payroll_atomic_results limit 1), 'success links reimbursement');
select is((select status from public.worker_advances where id = '22222222-2222-2222-2222-222222222231'), 'deducted', 'success deducts advance');
select ok((select settlement_completed_at is not null from public.worker_payments where idempotency_key = 'payroll-key-success'), 'success records completion metadata');

insert into payroll_atomic_results (result)
select public.record_worker_payroll_settlement(
  'payroll-key-success',
  '22222222-2222-2222-2222-222222222201',
  null,
  115,
  'ACH',
  '2026-08-29',
  'Atomic payroll',
  array['22222222-2222-2222-2222-222222222211']::uuid[],
  array['22222222-2222-2222-2222-222222222221']::uuid[],
  array['22222222-2222-2222-2222-222222222231']::uuid[],
  10
);

select is((select result->>'payment_id' from payroll_atomic_results order by ctid limit 1), (select result->>'payment_id' from payroll_atomic_results order by ctid desc limit 1), 'same payroll key returns same payment');
select is((select (result->>'reused')::boolean from payroll_atomic_results order by ctid desc limit 1), true, 'same payroll key reports reused');
select is((select count(*) from public.worker_payments where idempotency_key = 'payroll-key-success'), 1::bigint, 'same payroll key remains exactly once');
select throws_ok(
  $$
    select public.record_worker_payroll_settlement(
      'payroll-key-success',
      '22222222-2222-2222-2222-222222222201',
      null,
      114,
      'ACH',
      '2026-08-29',
      'Atomic payroll',
      array['22222222-2222-2222-2222-222222222211']::uuid[],
      array['22222222-2222-2222-2222-222222222221']::uuid[],
      array['22222222-2222-2222-2222-222222222231']::uuid[],
      10
    )
  $$,
  '23505',
  'Payroll idempotency key was reused with different content.',
  'same payroll key with changed content is rejected'
);

create function pg_temp.fail_labor_settlement()
returns trigger language plpgsql as $$ begin raise exception 'injected labor settlement failure'; end; $$;
create trigger payroll_atomic_fail_labor before update on public.labor_entries for each row execute function pg_temp.fail_labor_settlement();
select throws_ok(
  $$ select public.record_worker_payroll_settlement('payroll-key-labor-fail', '22222222-2222-2222-2222-222222222201', null, 60, 'ACH', '2026-08-29', null, array['22222222-2222-2222-2222-222222222212']::uuid[], array['22222222-2222-2222-2222-222222222222']::uuid[], array['22222222-2222-2222-2222-222222222232']::uuid[], 5) $$,
  'P0001', 'injected labor settlement failure', 'labor failure aborts payroll'
);
drop trigger payroll_atomic_fail_labor on public.labor_entries;
select is((select count(*) from public.worker_payments where idempotency_key = 'payroll-key-labor-fail'), 0::bigint, 'labor failure rolls back payment');
select is((select worker_payment_id from public.labor_entries where id = '22222222-2222-2222-2222-222222222212'), null::uuid, 'labor failure leaves labor unpaid');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222222'), 'pending', 'labor failure preserves reimbursement');
select is((select status from public.worker_advances where id = '22222222-2222-2222-2222-222222222232'), 'pending', 'labor failure preserves advance');

create function pg_temp.fail_reimbursement_settlement()
returns trigger language plpgsql as $$ begin raise exception 'injected reimbursement settlement failure'; end; $$;
create trigger payroll_atomic_fail_reimbursement before update on public.worker_reimbursements for each row execute function pg_temp.fail_reimbursement_settlement();
select throws_ok(
  $$ select public.record_worker_payroll_settlement('payroll-key-reimb-fail', '22222222-2222-2222-2222-222222222201', null, 70, 'ACH', '2026-08-29', null, array['22222222-2222-2222-2222-222222222213']::uuid[], array['22222222-2222-2222-2222-222222222223']::uuid[], array['22222222-2222-2222-2222-222222222233']::uuid[], 6) $$,
  'P0001', 'injected reimbursement settlement failure', 'reimbursement failure aborts payroll'
);
drop trigger payroll_atomic_fail_reimbursement on public.worker_reimbursements;
select is((select count(*) from public.worker_payments where idempotency_key = 'payroll-key-reimb-fail'), 0::bigint, 'reimbursement failure rolls back payment');
select is((select worker_payment_id from public.labor_entries where id = '22222222-2222-2222-2222-222222222213'), null::uuid, 'reimbursement failure rolls back labor link');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222223'), 'pending', 'reimbursement failure preserves reimbursement');
select is((select status from public.worker_advances where id = '22222222-2222-2222-2222-222222222233'), 'pending', 'reimbursement failure preserves advance');

create function pg_temp.fail_advance_settlement()
returns trigger language plpgsql as $$ begin raise exception 'injected advance settlement failure'; end; $$;
create trigger payroll_atomic_fail_advance before update on public.worker_advances for each row execute function pg_temp.fail_advance_settlement();
select throws_ok(
  $$ select public.record_worker_payroll_settlement('payroll-key-advance-fail', '22222222-2222-2222-2222-222222222201', null, 80, 'ACH', '2026-08-29', null, array['22222222-2222-2222-2222-222222222214']::uuid[], array['22222222-2222-2222-2222-222222222224']::uuid[], array['22222222-2222-2222-2222-222222222234']::uuid[], 7) $$,
  'P0001', 'injected advance settlement failure', 'advance failure aborts payroll'
);
drop trigger payroll_atomic_fail_advance on public.worker_advances;
select is((select count(*) from public.worker_payments where idempotency_key = 'payroll-key-advance-fail'), 0::bigint, 'advance failure rolls back payment');
select is((select worker_payment_id from public.labor_entries where id = '22222222-2222-2222-2222-222222222214'), null::uuid, 'advance failure rolls back labor link');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222224'), 'pending', 'advance failure rolls back reimbursement');
select is((select status from public.worker_advances where id = '22222222-2222-2222-2222-222222222234'), 'pending', 'advance failure preserves advance');

create function pg_temp.fail_payroll_completion_metadata()
returns trigger language plpgsql as $$
begin
  if old.settlement_completed_at is null
    and new.settlement_completed_at is not null
    and new.idempotency_key = 'payroll-key-metadata-fail'
  then
    raise exception 'injected settlement metadata failure';
  end if;
  return new;
end;
$$;
create trigger payroll_atomic_fail_completion_metadata
before update on public.worker_payments
for each row execute function pg_temp.fail_payroll_completion_metadata();
select throws_ok(
  $$ select public.record_worker_payroll_settlement('payroll-key-metadata-fail', '22222222-2222-2222-2222-222222222201', null, 100, 'ACH', '2026-08-29', null, array['22222222-2222-2222-2222-222222222215']::uuid[], array['22222222-2222-2222-2222-222222222225']::uuid[], array['22222222-2222-2222-2222-222222222235']::uuid[], 8) $$,
  'P0001', 'injected settlement metadata failure', 'completion metadata failure aborts payroll'
);
drop trigger payroll_atomic_fail_completion_metadata on public.worker_payments;
select is((select count(*) from public.worker_payments where idempotency_key = 'payroll-key-metadata-fail'), 0::bigint, 'metadata failure rolls back payment');
select is((select worker_payment_id from public.labor_entries where id = '22222222-2222-2222-2222-222222222215'), null::uuid, 'metadata failure rolls back labor link');
select is((select status from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222225'), 'pending', 'metadata failure rolls back reimbursement status');
select is((select payment_id from public.worker_reimbursements where id = '22222222-2222-2222-2222-222222222225'), null::uuid, 'metadata failure rolls back reimbursement link');
select is((select status from public.worker_advances where id = '22222222-2222-2222-2222-222222222235'), 'pending', 'metadata failure rolls back advance');

insert into public.worker_payments (worker_id, total_amount, payment_method, idempotency_key)
values ('22222222-2222-2222-2222-222222222201', 10, 'ACH', 'payroll-key-incomplete');
select throws_ok(
  $$ select public.record_worker_payroll_settlement('payroll-key-incomplete', '22222222-2222-2222-2222-222222222201', null, 10, 'ACH', '2026-08-29', null, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], 0) $$,
  '23514',
  'Existing payroll idempotency record is incomplete.',
  'incomplete payment is never returned as reused'
);

select * from finish();

rollback;
