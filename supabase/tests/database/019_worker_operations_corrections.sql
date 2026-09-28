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
insert into public.workers(id,name) values('19000000-0000-4000-8000-000000000001','[E2E] Coding Worker');
insert into public.projects(id,name) values('19000000-0000-4000-8000-000000000002','[E2E] Coding Project');
insert into storage.objects(bucket_id,name) values('worker-receipts','uploads/19000000-0000-4000-8000-000000000003.jpg');
select set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
select public.intake_worker_receipt_atomic('19000000-0000-4000-8000-000000000003','{"worker_id":"19000000-0000-4000-8000-000000000001","worker_name":"[E2E] Coding Worker","vendor":"[E2E] Actual merchant","amount":25,"receipt_date":"2026-09-01","receipt_url":"uploads/19000000-0000-4000-8000-000000000003.jpg"}');
insert into canonical_fixture(fixture_id,expense_id,line_id) select '19000000-0000-4000-8000-000000000003',e.id,l.id from public.expenses e join public.expense_lines l on l.expense_id=e.id where e.source_worker_receipt_id='19000000-0000-4000-8000-000000000003';
select lives_ok($$select public.code_provisional_worker_expense((select expense_id from canonical_fixture),0,'19000000-0000-4000-8000-000000000002','Materials','Confirmed project')$$,'missing project corrected atomically');
select is((select project_id from public.worker_receipts where id='19000000-0000-4000-8000-000000000003'),'19000000-0000-4000-8000-000000000002'::uuid,'receipt project corrected');
select is((select project_id from public.expenses where id=(select expense_id from canonical_fixture)),'19000000-0000-4000-8000-000000000002'::uuid,'same Expense project corrected');
select is((select project_id from public.expense_lines where id=(select line_id from canonical_fixture)),'19000000-0000-4000-8000-000000000002'::uuid,'same line project corrected');
select is((select status from public.expenses where id=(select expense_id from canonical_fixture)),'draft','coding does not recognize cost');
select throws_ok($$update public.expenses set vendor_name='Different merchant' where id=(select expense_id from canonical_fixture)$$,'P0001',null,'generated alias fix does not permit vendor mutation');
select is((select name from public.expenses where id=(select expense_id from canonical_fixture)),'[E2E] Actual merchant','generated merchant alias remains intact');
select throws_ok($$select public.code_provisional_worker_expense((select expense_id from canonical_fixture),0,null,'Materials','stale')$$,'40001',null,'stale coding rejected');
set local role authenticated;
select throws_ok($$update public.worker_receipts set project_id=null where id='19000000-0000-4000-8000-000000000003'$$,'P0001',null,'ordinary receipt edit cannot bypass atomic coding');
reset role;
update canonical_fixture set obligation_id=(public.approve_worker_expense_operation((select expense_id from canonical_fixture),1)->>'reimbursement_id')::uuid;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update canonical_fixture set payment_id=(public.record_worker_reimbursement_payment_atomic('coding-pay','19000000-0000-4000-8000-000000000001','ACH','2026-09-02',null,array[obligation_id])->>'payment_id')::uuid;
select set_config('request.jwt.claims','{"sub":"f1700000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
select lives_ok($$select public.transition_expense_operation((select expense_id from canonical_fixture),2,'19000000-0000-4000-8000-000000000004','request_info','{"message":"Follow up after payment"}')$$,'paid transaction can retain an unresolved issue');
select lives_ok($$select public.reverse_worker_payment_atomic((select payment_id from canonical_fixture),'coding-reverse')$$,'review issue cannot block trusted payment reversal');
select is((select status from public.expenses where id=(select expense_id from canonical_fixture)),'approved','reversal preserves accrued cost');
select is((select count(*) from public.expense_review_issues where expense_id=(select expense_id from canonical_fixture) and resolved_at is null),1::bigint,'reversal does not silently resolve issue');
select is((select count(*) from public.worker_payment_reversals where payment_id=(select payment_id from canonical_fixture)),1::bigint,'reversal evidence preserved');
set constraints all immediate;
select * from finish();
rollback;
