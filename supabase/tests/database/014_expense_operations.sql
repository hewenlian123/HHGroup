begin;
select no_plan();
select has_table('public','expense_operations','expense_operations exists');
select has_table('public','expense_source_links','expense_source_links exists');
select has_table('public','expense_review_issues','expense_review_issues exists');
select has_table('public','expense_operation_events','expense_operation_events exists');
select is(has_table_privilege('authenticated','public.expense_operation_events','INSERT'),false,'audit writes are RPC-only');
select is(has_function_privilege('anon','public.transition_expense_operation(uuid,integer,uuid,text,jsonb)','EXECUTE'),false,'anonymous operation denied');
select is(has_function_privilege('service_role','public.transition_expense_operation(uuid,integer,uuid,text,jsonb)','EXECUTE'),false,'operation requires end-user identity');

insert into auth.users(id,email,raw_app_meta_data,is_anonymous)
values('14000000-0000-0000-0000-000000000001','expense-operations-test@example.invalid','{"role":"owner"}',false);
insert into public.organization_memberships(organization_id,user_id,role,status)
values(private.company_organization_id(),'14000000-0000-0000-0000-000000000001','owner','active');
insert into public.workers(id,name,status) values('14000000-0000-0000-0000-000000000002','Expense Operations Test','active');
insert into storage.objects(bucket_id,name) values('worker-receipts','uploads/14000000-0000-0000-0000-000000000003.jpg');
select set_config('request.jwt.claims','{"sub":"14000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
create temp table ops_fixture(payload jsonb,expense_id uuid,line_id uuid,obligation_id uuid,payment_id uuid);
insert into ops_fixture(payload) values('{"worker_id":"14000000-0000-0000-0000-000000000002","worker_name":"Expense Operations Test","amount":25.50,"receipt_date":"2026-09-01","receipt_url":"uploads/14000000-0000-0000-0000-000000000003.jpg"}');
select lives_ok($$select public.intake_worker_receipt_atomic('14000000-0000-0000-0000-000000000003',(select payload from ops_fixture))$$,'Worker intake creates provisional identity atomically');
update ops_fixture set expense_id=(select id from public.expenses where source_worker_receipt_id='14000000-0000-0000-0000-000000000003');
update ops_fixture set line_id=(select id from public.expense_lines where expense_id=ops_fixture.expense_id);
select is((select status from public.expenses where id=(select expense_id from ops_fixture)),'draft','intake excludes project cost');
select is((select count(*) from public.expense_source_links where expense_id=(select expense_id from ops_fixture)),1::bigint,'receipt evidence persisted');
select lives_ok($$select public.intake_worker_receipt_atomic('14000000-0000-0000-0000-000000000003',(select payload from ops_fixture))$$,'intake replay succeeds');
select is((select count(*) from public.expenses where source_worker_receipt_id='14000000-0000-0000-0000-000000000003'),1::bigint,'replay does not duplicate Expense');
select throws_ok($$update public.worker_receipts set amount=30 where id='14000000-0000-0000-0000-000000000003'$$,'P0001',null,'independent amount edit rejected');
select lives_ok($$select public.transition_expense_operation((select expense_id from ops_fixture),0,'14000000-0000-0000-0000-000000000010','request_info','{"message":"Confirm project"}')$$,'Request Info persists');
select throws_ok($$select public.approve_worker_receipt_atomic('14000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000002',25.50,null)$$,'P0001',null,'open request blocks canonical approval');
select lives_ok($$select public.transition_expense_operation((select expense_id from ops_fixture),1,'14000000-0000-0000-0000-000000000011','resolve',jsonb_build_object('message','Confirmed no project assignment','issue_id',(select id from public.expense_review_issues where expense_id=(select expense_id from ops_fixture))))$$,'Request Info resolution retains evidence');
select lives_ok($$select public.approve_worker_receipt_atomic('14000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000002',25.50,null)$$,'canonical approval binds draft');
update ops_fixture set obligation_id=(select reimbursement_id from public.worker_receipts where id='14000000-0000-0000-0000-000000000003');
select is((select status from public.expenses where id=(select expense_id from ops_fixture)),'draft','approval does not advance reimbursement cost');
select lives_ok($$select public.approve_worker_receipt_atomic('14000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000002',25.50,null)$$,'approval replay preserves unique obligation');
select is((select count(*) from public.worker_reimbursements where source_worker_receipt_id='14000000-0000-0000-0000-000000000003'),1::bigint,'one obligation');
select lives_ok($$select public.transition_expense_operation((select expense_id from ops_fixture),3,'14000000-0000-0000-0000-000000000012','post')$$,'Post records independent evidence');
select is((select status from public.expenses where id=(select expense_id from ops_fixture)),'draft','Post does not change cost eligibility');
select lives_ok($$select public.transition_expense_operation((select expense_id from ops_fixture),3,'14000000-0000-0000-0000-000000000012','post')$$,'same request retry is idempotent');
select throws_ok($$select public.transition_expense_operation((select expense_id from ops_fixture),2,'14000000-0000-0000-0000-000000000013','post')$$,'40001',null,'stale operation rejected');

insert into public.expenses(id,expense_date,total,amount,status,source_type)
values('14000000-0000-0000-0000-000000000020',date '2026-09-01',1,1,'needs_review','company');
insert into public.expense_lines(expense_id,amount,total) values('14000000-0000-0000-0000-000000000020',1,1);
select is((select count(*) from public.expense_operations where expense_id='14000000-0000-0000-0000-000000000020'),0::bigint,'legacy state remains unknown without inference');
select throws_ok($$update public.expenses set source_worker_receipt_id='14000000-0000-0000-0000-000000000003' where id='14000000-0000-0000-0000-000000000020'$$,'P0001',null,'ordinary Expense cannot spoof permanent Worker identity');
select lives_ok($$select public.transition_expense_operation('14000000-0000-0000-0000-000000000020',0,'14000000-0000-0000-0000-000000000021','duplicate','{"message":"Manual duplicate review required"}')$$,'explicit duplicate quarantine persists');
select throws_ok($$update public.expenses set status='approved' where id='14000000-0000-0000-0000-000000000020'$$,'23514',null,'old approval projection cannot bypass quarantine');
select lives_ok($$select public.transition_expense_operation('14000000-0000-0000-0000-000000000020',1,'14000000-0000-0000-0000-000000000022','resolve',jsonb_build_object('message','Distinct transaction, no merge','issue_id',(select id from public.expense_review_issues where expense_id='14000000-0000-0000-0000-000000000020')))$$,'duplicate resolution retains Expense and audit');
select throws_ok($$select public.transition_expense_operation('14000000-0000-0000-0000-000000000020',2,'14000000-0000-0000-0000-000000000023','approve')$$,'23514',null,'missing project blocks approval');
select is((select revision from public.expense_operations where expense_id='14000000-0000-0000-0000-000000000020'),2::bigint,'failed approval does not partially advance revision');
select is((select count(*) from public.expense_review_issues where expense_id='14000000-0000-0000-0000-000000000020' and resolved_at is not null),1::bigint,'resolution preserves original issue');

-- Isolate amount integrity from issue/project/category gates using the canonical company workflow.
create temp table amount_guard_fixture as
select (public.create_expense_atomic('14000000-0000-0000-0000-000000000030',
  '{"expenseDate":"2026-09-01","vendorName":"[E2E] Amount guard","sourceType":"company","status":"needs_review","paymentMethod":"Other","groups":[{"projectId":null,"lines":[{"projectId":null,"category":"Other","amount":11.11}]}]}'::jsonb)->>'expense_id')::uuid as expense_id;
update public.expenses set total=12.11,amount=12.11 where id=(select expense_id from amount_guard_fixture);
alter table amount_guard_fixture add column revision integer;
update amount_guard_fixture set revision=coalesce((select revision from public.expense_operations where expense_id=amount_guard_fixture.expense_id),0);
select is((select count(*) from public.expense_review_issues where expense_id=(select expense_id from amount_guard_fixture) and resolved_at is null),0::bigint,'amount guard fixture has no open issue');
select throws_ok($$select public.transition_expense_operation((select expense_id from amount_guard_fixture),(select revision from amount_guard_fixture),'14000000-0000-0000-0000-000000000031','approve','{"cost_allocation":"overhead"}')$$,'23514','Valid amount, project and category coding required.','header-line mismatch independently blocks approval');
select is(coalesce((select revision from public.expense_operations where expense_id=(select expense_id from amount_guard_fixture)),0)::integer,(select revision from amount_guard_fixture),'failed amount approval preserves revision');
select is((select status from public.expenses where id=(select expense_id from amount_guard_fixture)),'needs_review','failed amount approval preserves status');
select is((select count(*) from public.expense_operation_events where expense_id=(select expense_id from amount_guard_fixture) and action='approve'),0::bigint,'failed amount approval creates no event');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select public.record_worker_reimbursement_payment_atomic('operations-first-pay','14000000-0000-0000-0000-000000000002','ACH',date '2026-09-10','fixture',array[(select obligation_id from ops_fixture)])$$,'payment reuses provisional Expense');
update ops_fixture set payment_id=(select payment_id from public.worker_reimbursements where id=ops_fixture.obligation_id);
select is((select status from public.expenses where id=(select expense_id from ops_fixture)),'paid','payment recognizes canonical cost');
select is((select expense_date from public.expenses where id=(select expense_id from ops_fixture)),date '2026-09-10','first recognition uses payment date');
select lives_ok($$select public.reverse_worker_payment_atomic((select payment_id from ops_fixture),'operations-reverse')$$,'reversal preserves canonical Expense');
select is((select status from public.expenses where id=(select expense_id from ops_fixture)),'approved','reversal retains existing accrued cost');
select lives_ok($$select public.record_worker_reimbursement_payment_atomic('operations-second-pay','14000000-0000-0000-0000-000000000002','ACH',date '2026-09-11','fixture',array[(select obligation_id from ops_fixture)])$$,'repayment succeeds');
select is((select expense_date from public.expenses where id=(select expense_id from ops_fixture)),date '2026-09-10','repayment preserves original expense date');
select is((select count(*) from public.expenses where source_worker_receipt_id='14000000-0000-0000-0000-000000000003'),1::bigint,'one ledger Expense after pay/reverse/repay');
select is((select id from public.expense_lines where expense_id=(select expense_id from ops_fixture)),(select line_id from ops_fixture),'same line identity retained');
select is((select receipt_url from public.worker_receipts where id='14000000-0000-0000-0000-000000000003'),'uploads/14000000-0000-0000-0000-000000000003.jpg','receipt evidence retained');
select throws_ok($$delete from public.expense_operation_events where expense_id=(select expense_id from ops_fixture)$$,'42501',null,'audit evidence cannot be deleted');
select throws_ok($$update public.expense_source_links set source_key='different' where expense_id=(select expense_id from ops_fixture)$$,'42501',null,'source evidence cannot be reassigned');
select * from finish();
rollback;
