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


select plan(63);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array['project_tasks', 'punch_list', 'site_photos', 'inspection_log'])
  ),
  'Operations P0 tables keep RLS enabled'
);

select ok(
  (
    select bool_and(not pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), privilege_name))
    from unnest(array['project_tasks', 'punch_list', 'site_photos', 'inspection_log']) table_name
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
  ),
  'anon has no CRUD privilege on Operations P0 tables'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array['project_tasks', 'punch_list', 'site_photos', 'inspection_log'])
      and 'anon' = any(p.roles)
  ),
  'Operations P0 tables have no anon policy'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array['project_tasks', 'punch_list', 'site_photos', 'inspection_log'])
      and p.cmd = 'UPDATE'
      and p.permissive = 'PERMISSIVE'
      and 'authenticated' = any(p.roles)
      and p.qual like '%can_manage_project%'
      and p.with_check like '%can_manage_project%'
  ),
  4,
  'each Operations P0 table requires live project manager membership for updates'
);

select ok(
  (
    select bool_and(
      pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), privilege_name)
    )
    from unnest(array['project_tasks', 'punch_list', 'site_photos', 'inspection_log']) table_name
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
  ),
  'authenticated retains only RLS-filtered Operations CRUD capability'
);

select ok(
  pg_catalog.to_regprocedure('public.record_subcontract_payment(uuid,uuid,date,numeric,text,text)') is not null,
  'record_subcontract_payment exists with the production signature'
);
select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.record_subcontract_payment(uuid,uuid,date,numeric,text,text)'::regprocedure
  ),
  'record_subcontract_payment is security invoker'
);
select is(
  (
    select p.proconfig
    from pg_catalog.pg_proc p
    where p.oid = 'public.record_subcontract_payment(uuid,uuid,date,numeric,text,text)'::regprocedure
  ),
  array['search_path=""']::text[],
  'record_subcontract_payment has an empty controlled search_path'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.record_subcontract_payment(uuid,uuid,date,numeric,text,text)', 'EXECUTE'),
  'record_subcontract_payment denies PUBLIC and anon execution'
);
select ok(
  pg_catalog.has_function_privilege('authenticated', 'public.record_subcontract_payment(uuid,uuid,date,numeric,text,text)', 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', 'public.record_subcontract_payment(uuid,uuid,date,numeric,text,text)', 'EXECUTE'),
  'record_subcontract_payment allows only the existing authenticated and server roles'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array['worker_payments', 'ap_bills'])
  ),
  'financial destructive targets keep RLS enabled'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants grant_record
    where grant_record.table_schema = 'public'
      and grant_record.table_name = any(array['worker_payments', 'ap_bills'])
      and grant_record.grantee = 'PUBLIC'
      and grant_record.privilege_type = 'DELETE'
  ) and (
    select bool_and(
      not pg_catalog.has_table_privilege(role_name, pg_catalog.format('public.%I', table_name), 'DELETE')
    )
    from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array['worker_payments', 'ap_bills']) table_name
  ),
  'no API-facing role has direct DELETE privilege on financial destructive targets'
);

select ok(
  (
    select bool_and(
      (pg_catalog.has_table_privilege(role_name, pg_catalog.format('public.%I', table_name), privilege_name)
       = (table_name='ap_bills' or privilege_name='SELECT'))
    )
    from unnest(array['authenticated', 'service_role']) role_name
    cross join unnest(array['worker_payments', 'ap_bills']) table_name
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE']) privilege_name
  ),
  'Worker payment direct writes denied; AP access and Worker reads retain scoped grants'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array['worker_payments', 'ap_bills'])
      and p.cmd = any(array['DELETE', 'ALL'])
      and p.permissive = 'PERMISSIVE'
      and p.roles && array['public', 'anon', 'authenticated', 'service_role']::name[]
  ),
  'financial destructive targets expose no permissive DELETE or ALL policy to API roles'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants grant_record
    where grant_record.table_schema = 'public'
      and grant_record.table_name = any(array['worker_payment_reversals', 'ap_bill_deletions'])
      and grant_record.grantee = 'PUBLIC'
  ) and (
    select bool_and(
      not pg_catalog.has_table_privilege(role_name, pg_catalog.format('public.%I', table_name), 'INSERT')
    )
    from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array['worker_payment_reversals', 'ap_bill_deletions']) table_name
  ),
  'API roles cannot poison financial replay ledgers'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array['worker_payment_reversals', 'ap_bill_deletions'])
      and p.permissive = 'PERMISSIVE'
      and p.roles && array['public', 'anon', 'authenticated', 'service_role']::name[]
  ),
  'financial replay ledgers expose no permissive API policy'
);

select has_function('public', 'reverse_worker_payment_atomic', array['uuid', 'text']);
select function_returns('public', 'reverse_worker_payment_atomic', array['uuid', 'text'], 'jsonb');
select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure
  ),
  'worker payment reversal is security definer'
);
select is(
  (
    select p.proconfig
    from pg_catalog.pg_proc p
    where p.oid = 'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure
  ),
  array['search_path=""']::text[],
  'worker payment reversal has an empty controlled search_path'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.reverse_worker_payment_atomic(uuid,text)', 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', 'public.reverse_worker_payment_atomic(uuid,text)', 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', 'public.reverse_worker_payment_atomic(uuid,text)', 'EXECUTE'),
  'worker payment reversal denies anon and permits existing legal roles'
);

select has_function('public', 'delete_ap_bill_draft_atomic', array['uuid', 'text']);
select function_returns('public', 'delete_ap_bill_draft_atomic', array['uuid', 'text'], 'jsonb');
select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
  ),
  'Draft AP Bill delete is security definer'
);
select is(
  (
    select p.proconfig
    from pg_catalog.pg_proc p
    where p.oid = 'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
  ),
  array['search_path=""']::text[],
  'Draft AP Bill delete has an empty controlled search_path'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.delete_ap_bill_draft_atomic(uuid,text)', 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', 'public.delete_ap_bill_draft_atomic(uuid,text)', 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', 'public.delete_ap_bill_draft_atomic(uuid,text)', 'EXECUTE'),
  'Draft AP Bill delete denies anon and permits existing legal roles'
);

set local role authenticated;
set local "request.jwt.claims" = '{"app_metadata":{"role":"worker"}}';
select throws_ok(
  $$ select public.record_subcontract_payment(null, null, current_date, 1, null, null) $$,
  '42501',
  'Owner or admin role required.',
  'non-owner authenticated role cannot record subcontract payments'
);
select throws_ok(
  $$ select public.reverse_worker_payment_atomic('33333333-3333-3333-3333-333333333399', 'worker-payment-reversal:denied') $$,
  '42501',
  'Company administrator access required',
  'non-owner authenticated role cannot reverse worker payments'
);
select throws_ok(
  $$ select public.delete_ap_bill_draft_atomic('33333333-3333-3333-3333-333333333399', 'ap-bill-delete:denied') $$,
  '42501',
  'Company administrator access required',
  'non-owner authenticated role cannot delete Draft AP Bills'
);
reset role;
set local "request.jwt.claims" = '';

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated","app_metadata":{"role":"owner"}}';
select throws_ok(
  $$ delete from public.worker_payments where id is null $$,
  '42501',
  'permission denied for table worker_payments',
  'authenticated owner cannot directly delete worker payments'
);
select throws_ok(
  $$ delete from public.ap_bills where id is null $$,
  '42501',
  'permission denied for table ap_bills',
  'authenticated owner cannot directly delete AP Bills'
);
reset role;
set local "request.jwt.claims" = '';

set local role anon;
select throws_ok(
  $$ delete from public.worker_payments where id is null $$,
  '42501',
  'permission denied for table worker_payments',
  'anon cannot directly delete worker payments'
);
select throws_ok(
  $$ delete from public.ap_bills where id is null $$,
  '42501',
  'permission denied for table ap_bills',
  'anon cannot directly delete AP Bills'
);
reset role;

set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
select throws_ok(
  $$ delete from public.worker_payments where id is null $$,
  '42501',
  'permission denied for table worker_payments',
  'service role cannot bypass worker payment atomic reversal'
);
select throws_ok(
  $$ delete from public.ap_bills where id is null $$,
  '42501',
  'permission denied for table ap_bills',
  'service role cannot bypass Draft AP Bill dependency checks'
);
reset role;
set local "request.jwt.claims" = '';

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.fn_worker_payments_before_delete()'::regprocedure
  ),
  'worker payment delete trigger is security definer'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.fn_worker_payments_before_delete()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', 'public.fn_worker_payments_before_delete()', 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', 'public.fn_worker_payments_before_delete()', 'EXECUTE'),
  'worker payment delete trigger cannot be called as an API RPC'
);

select ok(
  (
    select bool_and(p.proowner = 'postgres'::regrole)
    from pg_catalog.pg_proc p
    where p.oid = any(array[
      'public.fn_worker_payments_before_delete()'::regprocedure,
      'public.reverse_worker_payment_atomic(uuid,text)'::regprocedure,
      'public.delete_ap_bill_draft_atomic(uuid,text)'::regprocedure
    ])
  ),
  'all privileged financial delete routines are owned by postgres'
);
select has_function(
  'public',
  'financial_delete_authority_predecessor_worker_policy_count',
  array[]::text[],
  'forward migration preserves its exact predecessor policy variant'
);
select ok(
  (
    select p.proowner = 'postgres'::regrole
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    from pg_catalog.pg_proc p
    where p.oid =
      'public.financial_delete_authority_predecessor_worker_policy_count()'::regprocedure
  ),
  'predecessor marker is postgres-owned and unavailable to API roles'
);

-- The legal owner fixture has a live membership in the canonical company.
insert into auth.users (id, email, raw_app_meta_data)
values ('33333333-3333-3333-3333-333333333301', 'financial-hardening-fixture@example.invalid', '{"role":"owner"}');
insert into public.organization_memberships(organization_id,user_id,role,status)
values (private.company_organization_id(),'33333333-3333-3333-3333-333333333301','owner','active');
insert into public.workers (id, name)
values ('33333333-3333-3333-3333-333333333301', 'Reversal Worker');
insert into public.projects (id, name)
values ('33333333-3333-3333-3333-333333333302', 'Reversal Project');
insert into public.labor_entries(id,worker_id,project_id,work_date,labor_cost_snapshot,status)
values('33333333-3333-3333-3333-333333333311','33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','2026-09-02',100,'Approved');
select pg_temp.canonical_receipt('33333333-3333-3333-3333-333333333312','33333333-3333-3333-3333-333333333301',25,'33333333-3333-3333-3333-333333333302');
update canonical_fixture set payment_id=(public.record_worker_payroll_settlement('canonical-reversal-one',
 '33333333-3333-3333-3333-333333333301',null,125,'ACH','2026-09-02',null,
 array['33333333-3333-3333-3333-333333333311']::uuid[],array[pg_temp.obligation('33333333-3333-3333-3333-333333333312')],array[]::uuid[],0)->>'payment_id')::uuid
where fixture_id='33333333-3333-3333-3333-333333333312';
insert into public.worker_advances (id, worker_id, amount, advance_date, status)
values (
  '33333333-3333-3333-3333-333333333313',
  '33333333-3333-3333-3333-333333333301',
  10,
  '2026-09-02',
  'deducted'
);

create temp table worker_reversal_results (result jsonb);
grant select, insert on worker_reversal_results to authenticated, service_role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333301","role":"authenticated","app_metadata":{"role":"owner"}}';
insert into worker_reversal_results (result)
select public.reverse_worker_payment_atomic(
  pg_temp.fixture_payment('33333333-3333-3333-3333-333333333312'),
  'worker-payment-reversal:33333333-3333-3333-3333-333333333310'
);
reset role;
set local "request.jwt.claims" = '';
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
insert into worker_reversal_results (result)
select public.reverse_worker_payment_atomic(
  pg_temp.fixture_payment('33333333-3333-3333-3333-333333333312'),
  'worker-payment-reversal:33333333-3333-3333-3333-333333333310'
);
reset role;
set local "request.jwt.claims" = '';

select is((select count(*) from public.worker_payments where id = pg_temp.fixture_payment('33333333-3333-3333-3333-333333333312')), 0::bigint, 'worker payment reversal removes the payment once');
select is((select count(*) from public.worker_payment_reversals where payment_id = pg_temp.fixture_payment('33333333-3333-3333-3333-333333333312')), 1::bigint, 'worker payment reversal writes one durable replay ledger row');
select is((select worker_payment_id from public.labor_entries where id = '33333333-3333-3333-3333-333333333311'), null::uuid, 'worker payment reversal unlinks labor');
select is((select status from public.labor_entries where id = '33333333-3333-3333-3333-333333333311'), 'Approved', 'worker payment reversal restores paid labor status');
select is((select status from public.worker_reimbursements where id = pg_temp.obligation('33333333-3333-3333-3333-333333333312')), 'pending', 'worker payment reversal reopens reimbursement');
select is((select payment_id from public.worker_reimbursements where id = pg_temp.obligation('33333333-3333-3333-3333-333333333312')), null::uuid, 'worker payment reversal unlinks reimbursement');
select is((select status from public.worker_advances where id = '33333333-3333-3333-3333-333333333313'), 'deducted', 'worker payment reversal preserves existing advance behavior');
select is((select (result->>'reused')::boolean from worker_reversal_results order by ctid limit 1), false, 'first worker reversal reports a new completion');
select is((select (result->>'reused')::boolean from worker_reversal_results order by ctid desc limit 1), true, 'duplicate worker reversal reports an authoritative replay');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.labor_entries(id,worker_id,project_id,work_date,labor_cost_snapshot,status)
values('33333333-3333-3333-3333-333333333315','33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','2026-09-02',100,'Approved');
select pg_temp.canonical_receipt('33333333-3333-3333-3333-333333333316','33333333-3333-3333-3333-333333333301',25,'33333333-3333-3333-3333-333333333302');
update canonical_fixture set payment_id=(public.record_worker_payroll_settlement('canonical-reversal-two',
 '33333333-3333-3333-3333-333333333301',null,125,'ACH','2026-09-02',null,
 array['33333333-3333-3333-3333-333333333315']::uuid[],array[pg_temp.obligation('33333333-3333-3333-3333-333333333316')],array[]::uuid[],0)->>'payment_id')::uuid
where fixture_id='33333333-3333-3333-3333-333333333316';
create function pg_temp.fail_worker_payment_reversal()
returns trigger
language plpgsql
as $$
begin
  raise exception 'injected reimbursement reversal failure';
end;
$$;
create trigger worker_payment_reversal_injected_failure
before update on public.worker_reimbursements
for each row
when (old.payment_id = pg_temp.fixture_payment('33333333-3333-3333-3333-333333333316')::uuid)
execute function pg_temp.fail_worker_payment_reversal();

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333301","role":"authenticated","app_metadata":{"role":"owner"}}';
select throws_ok(
  $$ select public.reverse_worker_payment_atomic(pg_temp.fixture_payment('33333333-3333-3333-3333-333333333316'), 'worker-payment-reversal:33333333-3333-3333-3333-333333333314') $$,
  'P0001',
  'injected reimbursement reversal failure',
  'worker reversal dependency-write failure aborts the transaction'
);
reset role;
set local "request.jwt.claims" = '';
drop trigger worker_payment_reversal_injected_failure on public.worker_reimbursements;
select is((select count(*) from public.worker_payments where id = pg_temp.fixture_payment('33333333-3333-3333-3333-333333333316')), 1::bigint, 'failed worker reversal preserves the payment');
select is((select worker_payment_id from public.labor_entries where id = '33333333-3333-3333-3333-333333333315'), pg_temp.fixture_payment('33333333-3333-3333-3333-333333333316')::uuid, 'failed worker reversal preserves the labor link');
select is((select status from public.labor_entries where id = '33333333-3333-3333-3333-333333333315'), 'Approved', 'failed worker reversal preserves original labor status');
select is((select payment_id from public.worker_reimbursements where id = pg_temp.obligation('33333333-3333-3333-3333-333333333316')), pg_temp.fixture_payment('33333333-3333-3333-3333-333333333316')::uuid, 'failed worker reversal preserves reimbursement link');
select is((select count(*) from public.worker_payment_reversals where payment_id = pg_temp.fixture_payment('33333333-3333-3333-3333-333333333316')), 0::bigint, 'failed worker reversal rolls back its replay ledger row');

insert into public.ap_bills (id, vendor_name, amount, paid_amount, balance_amount, status)
values ('33333333-3333-3333-3333-333333333320', 'Atomic Draft Vendor', 100, 0, 100, 'Draft');
create temp table ap_delete_results (result jsonb);
grant select, insert on ap_delete_results to authenticated, service_role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333301","role":"authenticated","app_metadata":{"role":"owner"}}';
insert into ap_delete_results (result)
select public.delete_ap_bill_draft_atomic(
  '33333333-3333-3333-3333-333333333320',
  'ap-bill-delete:33333333-3333-3333-3333-333333333320'
);
reset role;
set local "request.jwt.claims" = '';
set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role"}';
insert into ap_delete_results (result)
select public.delete_ap_bill_draft_atomic(
  '33333333-3333-3333-3333-333333333320',
  'ap-bill-delete:33333333-3333-3333-3333-333333333320'
);
reset role;
set local "request.jwt.claims" = '';
select is((select count(*) from public.ap_bills where id = '33333333-3333-3333-3333-333333333320'), 0::bigint, 'atomic Draft AP Bill delete removes one bill');
select is((select count(*) from public.ap_bill_deletions where bill_id = '33333333-3333-3333-3333-333333333320'), 1::bigint, 'atomic Draft AP Bill delete records one replay ledger row');
select is((select (result->>'reused')::boolean from ap_delete_results order by ctid desc limit 1), true, 'duplicate Draft AP Bill delete reports an authoritative replay');

insert into public.ap_bills (id, vendor_name, amount, paid_amount, balance_amount, status)
values ('33333333-3333-3333-3333-333333333321', 'Paid Draft Vendor', 100, 0, 100, 'Pending');
insert into public.ap_bill_payments (id, bill_id, payment_date, amount)
values ('33333333-3333-3333-3333-333333333322', '33333333-3333-3333-3333-333333333321', '2026-09-02', 10);
-- Simulate a legacy inconsistent Draft header to exercise the dependency guard.
alter table public.ap_bills disable trigger guard_ap_bill_header;
update public.ap_bills
set status = 'Draft'
where id = '33333333-3333-3333-3333-333333333321';
alter table public.ap_bills enable trigger guard_ap_bill_header;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333301","role":"authenticated","app_metadata":{"role":"owner"}}';
select throws_ok(
  $$ select public.delete_ap_bill_draft_atomic('33333333-3333-3333-3333-333333333321', 'ap-bill-delete:33333333-3333-3333-3333-333333333321') $$,
  '23514',
  'Cannot delete a bill with payments',
  'Draft AP Bill delete rejects an existing payment dependency'
);
reset role;
set local "request.jwt.claims" = '';
select is((select count(*) from public.ap_bills where id = '33333333-3333-3333-3333-333333333321'), 1::bigint, 'failed Draft AP Bill dependency check preserves the bill');
select is((select count(*) from public.ap_bill_payments where bill_id = '33333333-3333-3333-3333-333333333321'), 1::bigint, 'failed Draft AP Bill dependency check preserves payments');

insert into public.ap_bills (id, vendor_name, amount, paid_amount, balance_amount, status)
values ('33333333-3333-3333-3333-333333333323', 'Pending Bill Vendor', 100, 0, 100, 'Pending');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333301","role":"authenticated","app_metadata":{"role":"owner"}}';
select throws_ok(
  $$ select public.delete_ap_bill_draft_atomic('33333333-3333-3333-3333-333333333323', 'ap-bill-delete:33333333-3333-3333-3333-333333333323') $$,
  '23514',
  'Only Draft bills can be deleted',
  'atomic AP Bill delete rejects a non-Draft bill'
);
reset role;
set local "request.jwt.claims" = '';
select is(
  (select count(*) from public.ap_bills where id = '33333333-3333-3333-3333-333333333323'),
  1::bigint,
  'failed non-Draft AP Bill delete preserves the bill'
);

select * from finish();

rollback;
