begin;
-- Transaction-scoped fixtures: real intake/approval RPCs, never direct obligation/payment INSERTs.
insert into auth.users(id,email,raw_app_meta_data,is_anonymous)
values('f1700000-0000-4000-8000-000000000001','canonical-fixture@example.invalid','{"role":"owner"}',false);
insert into public.organization_memberships(organization_id,user_id,role,status)
values(private.company_organization_id(),'f1700000-0000-4000-8000-000000000001','owner','active');
create temp table canonical_fixture(fixture_id uuid primary key,obligation_id uuid,expense_id uuid,line_id uuid,payment_id uuid);
grant select on canonical_fixture to authenticated,service_role;
create function pg_temp.canonical_receipt(p_id uuid,p_worker uuid,p_amount numeric,p_project uuid default null)
returns void language plpgsql as $$
declare v_claims text:=current_setting('request.jwt.claims',true); v_result jsonb;
begin
  perform set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
  insert into storage.objects(bucket_id,name) values('worker-receipts','uploads/'||p_id||'.jpg');
  perform public.intake_worker_receipt_atomic(p_id,jsonb_build_object('worker_id',p_worker,
    'worker_name',(select name from public.workers where id=p_worker),'amount',p_amount,'project_id',p_project,
    'receipt_date','2026-08-29','receipt_url','uploads/'||p_id||'.jpg'));
  v_result:=public.approve_worker_receipt_atomic(p_id,'f1700000-0000-4000-8000-000000000001',p_worker,p_amount,p_project);
  insert into canonical_fixture(fixture_id,obligation_id,expense_id,line_id)
  select p_id,(v_result->>'reimbursement_id')::uuid,e.id,l.id
  from public.expenses e join public.expense_lines l on l.expense_id=e.id where e.source_worker_receipt_id=p_id;
  if not found then raise exception 'Canonical fixture missing provisional Expense.'; end if;
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
end $$;
create function pg_temp.obligation(p_id uuid) returns uuid language sql as $$
select obligation_id from canonical_fixture where fixture_id=p_id
$$;
create function pg_temp.fixture_payment(p_id uuid) returns uuid language sql as $$
select payment_id from canonical_fixture where fixture_id=p_id
$$;
select set_config('request.jwt.claims','{"role":"service_role"}',true);


select no_plan();

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

select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222311','22222222-2222-2222-2222-222222222301',25,'22222222-2222-2222-2222-222222222302');
select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222312','22222222-2222-2222-2222-222222222301',15,'22222222-2222-2222-2222-222222222302');
select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222321','22222222-2222-2222-2222-222222222301',30,'22222222-2222-2222-2222-222222222302');
select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222331','22222222-2222-2222-2222-222222222301',40,'22222222-2222-2222-2222-222222222302');
select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222351','22222222-2222-2222-2222-222222222301',35,'22222222-2222-2222-2222-222222222302');
select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222341','22222222-2222-2222-2222-222222222301',45,'22222222-2222-2222-2222-222222222302');
select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222342','22222222-2222-2222-2222-222222222301',46,'22222222-2222-2222-2222-222222222302');

create temp table reimbursement_atomic_results (result jsonb);

insert into reimbursement_atomic_results (result)
select public.record_worker_reimbursement_payment_atomic(
  'reimbursement-key-success'::text,
  '22222222-2222-2222-2222-222222222301'::uuid,
  'ACH'::text,
  '2026-08-30'::date,
  'Atomic reimbursement payment'::text,
  array[
    pg_temp.obligation('22222222-2222-2222-2222-222222222311'),
    pg_temp.obligation('22222222-2222-2222-2222-222222222312')
  ]::uuid[]
);

select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-success'), 1::bigint, 'success creates one worker payment');
select is((select status from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222311')), 'paid', 'success marks first reimbursement paid');
select is((select status from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222312')), 'paid', 'success marks second reimbursement paid');
select is((select payment_id::text from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222311')), (select result->>'payment_id' from reimbursement_atomic_results limit 1), 'success links first reimbursement to payment');
select is((select payment_id::text from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222312')), (select result->>'payment_id' from reimbursement_atomic_results limit 1), 'success links second reimbursement to payment');
select is((select count(*) from public.expenses where source = 'worker_reimbursement' and source_id in (pg_temp.obligation('22222222-2222-2222-2222-222222222311')::text, pg_temp.obligation('22222222-2222-2222-2222-222222222312')::text)), 2::bigint, 'success creates one reimbursement expense per reimbursement');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source = 'worker_reimbursement' and e.source_id in (pg_temp.obligation('22222222-2222-2222-2222-222222222311')::text, pg_temp.obligation('22222222-2222-2222-2222-222222222312')::text)), 2::bigint, 'success creates one expense line per reimbursement expense');
select ok((select count(*) = 2 from public.expenses where source = 'worker_reimbursement' and source_type = 'reimbursement' and status = 'paid' and id in (select expense_id from canonical_fixture where fixture_id in ('22222222-2222-2222-2222-222222222311','22222222-2222-2222-2222-222222222312'))), 'success preserves reimbursement expense source and paid status');
select ok((select count(*) = 2 from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source = 'worker_reimbursement' and el.project_id = '22222222-2222-2222-2222-222222222302'::uuid and el.amount in (25, 15)), 'success preserves reimbursement expense-line project and amounts');

insert into reimbursement_atomic_results (result)
select public.record_worker_reimbursement_payment_atomic(
  'reimbursement-key-success'::text,
  '22222222-2222-2222-2222-222222222301'::uuid,
  'ACH'::text,
  '2026-08-30'::date,
  'Atomic reimbursement payment'::text,
  array[
    pg_temp.obligation('22222222-2222-2222-2222-222222222311'),
    pg_temp.obligation('22222222-2222-2222-2222-222222222312')
  ]::uuid[]
);

select is((select result->>'payment_id' from reimbursement_atomic_results order by ctid limit 1), (select result->>'payment_id' from reimbursement_atomic_results order by ctid desc limit 1), 'same idempotency key returns the original payment');
select is((select (result->>'reused')::boolean from reimbursement_atomic_results order by ctid desc limit 1), true, 'same idempotency key reports reused');
select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-success'), 1::bigint, 'same idempotency key creates exactly one payment');
select is((select count(*) from public.expenses where source = 'worker_reimbursement' and source_id in (pg_temp.obligation('22222222-2222-2222-2222-222222222311')::text, pg_temp.obligation('22222222-2222-2222-2222-222222222312')::text)), 2::bigint, 'same idempotency key creates exactly two reimbursement expenses');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source = 'worker_reimbursement' and e.source_id in (pg_temp.obligation('22222222-2222-2222-2222-222222222311')::text, pg_temp.obligation('22222222-2222-2222-2222-222222222312')::text)), 2::bigint, 'same idempotency key creates exactly two reimbursement expense lines');

select throws_ok(
  $$
    select public.record_worker_reimbursement_payment_atomic(
      'reimbursement-key-success'::text,
      '22222222-2222-2222-2222-222222222301'::uuid,
      'Cash'::text,
      '2026-08-30'::date,
      'Atomic reimbursement payment'::text,
      array[
        pg_temp.obligation('22222222-2222-2222-2222-222222222311'),
        pg_temp.obligation('22222222-2222-2222-2222-222222222312')
      ]::uuid[]
    )
  $$,
  '23505',
  'Reimbursement idempotency key was reused with different content.',
  'same idempotency key with changed payload is rejected'
);

select throws_ok(
 $$insert into public.worker_payments(worker_id,total_amount,payment_method,payment_date,idempotency_key)
 values('22222222-2222-2222-2222-222222222301',45,'ACH','2026-08-30','reimbursement-key-incomplete')$$,
 'P0001','New Worker payment requires canonical generation evidence.',
 'incomplete payment cannot be created or returned as reused'
);

select throws_ok(
  $$
    update public.worker_reimbursements
    set status = 'paid'
    where id = pg_temp.obligation('22222222-2222-2222-2222-222222222342')
  $$,
  '23514',
  'A paid reimbursement must be linked to a worker payment.',
  'paid transition without a worker payment link is rejected'
);
select is(
  (select status from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222342')),
  'pending',
  'failed paid transition preserves the pending reimbursement state'
);

create function pg_temp.fail_reimbursement_expense_header()
returns trigger language plpgsql as $$ begin raise exception 'injected reimbursement expense header failure'; end; $$;
create trigger reimbursement_atomic_fail_expense_header
before update on public.expenses
for each row execute function pg_temp.fail_reimbursement_expense_header();
select throws_ok(
  $$
    select public.record_worker_reimbursement_payment_atomic(
      'reimbursement-key-header-fail'::text,
      '22222222-2222-2222-2222-222222222301'::uuid,
      'ACH'::text,
      '2026-08-30'::date,
      null::text,
      array[pg_temp.obligation('22222222-2222-2222-2222-222222222321')]::uuid[]
    )
  $$,
  'P0001',
  'injected reimbursement expense header failure',
  'expense header failure aborts reimbursement settlement'
);
drop trigger reimbursement_atomic_fail_expense_header on public.expenses;
select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-header-fail'), 0::bigint, 'expense header failure rolls back worker payment');
select is((select status from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222321')), 'pending', 'expense header failure preserves reimbursement status');
select is((select payment_id from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222321')), null::uuid, 'expense header failure preserves null reimbursement payment link');
select is((select count(*) from public.expenses where source_id = pg_temp.obligation('22222222-2222-2222-2222-222222222321')::text), 1::bigint, 'expense header failure preserves provisional reimbursement expense');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source_id = pg_temp.obligation('22222222-2222-2222-2222-222222222321')::text), 1::bigint, 'expense header failure preserves provisional reimbursement expense line');

-- Line creation moved to intake. Inject at its actual write boundary and prove full rollback.
create function pg_temp.fail_reimbursement_expense_line()
returns trigger language plpgsql as $$ begin raise exception 'injected reimbursement expense line failure'; end; $$;
create trigger reimbursement_atomic_fail_expense_line before insert on public.expense_lines
for each row execute function pg_temp.fail_reimbursement_expense_line();
select throws_ok($$select pg_temp.canonical_receipt('22222222-2222-2222-2222-222222222399','22222222-2222-2222-2222-222222222301',40,'22222222-2222-2222-2222-222222222302')$$,
'P0001','injected reimbursement expense line failure','line failure aborts canonical intake');
drop trigger reimbursement_atomic_fail_expense_line on public.expense_lines;
select is((select count(*) from public.worker_receipts where id='22222222-2222-2222-2222-222222222399'),0::bigint,'line failure rolls back receipt');
select is((select count(*) from public.expenses where source_worker_receipt_id='22222222-2222-2222-2222-222222222399'),0::bigint,'line failure rolls back provisional Expense');
select is((select count(*) from public.worker_reimbursements where source_worker_receipt_id='22222222-2222-2222-2222-222222222399'),0::bigint,'line failure leaves no obligation');
select is((select count(*) from storage.objects where name='uploads/22222222-2222-2222-2222-222222222399.jpg'),0::bigint,'failed fixture upload rolls back with intake');

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
      array[pg_temp.obligation('22222222-2222-2222-2222-222222222351')]::uuid[]
    )
  $$,
  'P0001',
  'injected reimbursement completion metadata failure',
  'completion metadata failure aborts reimbursement settlement'
);
drop trigger reimbursement_atomic_fail_completion_metadata on public.worker_payments;
select is((select count(*) from public.worker_payments where idempotency_key = 'reimbursement-key-completion-fail'), 0::bigint, 'completion metadata failure rolls back worker payment');
select is((select status from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222351')), 'pending', 'completion metadata failure preserves reimbursement status');
select is((select payment_id from public.worker_reimbursements where id = pg_temp.obligation('22222222-2222-2222-2222-222222222351')), null::uuid, 'completion metadata failure preserves null reimbursement payment link');
select is((select count(*) from public.expenses where source_id = pg_temp.obligation('22222222-2222-2222-2222-222222222351')::text), 1::bigint, 'completion metadata failure preserves provisional reimbursement expense');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source_id = pg_temp.obligation('22222222-2222-2222-2222-222222222351')::text), 1::bigint, 'completion metadata failure preserves provisional reimbursement expense line');

select ok((select bool_and(e.id=f.expense_id and l.id=f.line_id) from canonical_fixture f
 join public.expenses e on e.source_worker_receipt_id=f.fixture_id join public.expense_lines l on l.expense_id=e.id),
 'payment and failures retain every original Expense and line identity');
select ok((select bool_and(e.status='draft') from canonical_fixture f join public.expenses e on e.id=f.expense_id
 where f.fixture_id in ('22222222-2222-2222-2222-222222222321','22222222-2222-2222-2222-222222222351')),
 'failed settlement never promotes provisional cost');
select * from finish();

rollback;
