begin;
select no_plan();
-- Transaction-owned synthetic fixtures; canonical RPCs create every protected row.
insert into auth.users(id,email,raw_app_meta_data,is_anonymous) values
('20000000-0000-0000-0000-000000000001','operations-owner@example.invalid','{"role":"owner"}',false),
('20000000-0000-0000-0000-000000000002','operations-admin@example.invalid','{"role":"admin"}',false),
('20000000-0000-0000-0000-000000000003','operations-assistant@example.invalid','{"role":"assistant"}',false),
('20000000-0000-0000-0000-000000000004','operations-outsider@example.invalid','{"role":"admin"}',false);
insert into public.organization_memberships(organization_id,user_id,role,status)
select private.company_organization_id(),id,raw_app_meta_data->>'role','active'
from auth.users where id in ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003');
insert into public.workers(id,name,status) values('20000000-0000-0000-0000-000000000005','[E2E] Operations RLS','active');
insert into storage.objects(bucket_id,name) values('worker-receipts','uploads/20000000-0000-0000-0000-000000000006.jpg');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
select lives_ok($$select public.intake_worker_receipt_atomic('20000000-0000-0000-0000-000000000006','{"worker_id":"20000000-0000-0000-0000-000000000005","worker_name":"[E2E] Operations RLS","amount":12.34,"receipt_date":"2026-09-14","receipt_url":"uploads/20000000-0000-0000-0000-000000000006.jpg"}')$$,'owner canonical intake remains authorized');
select set_config('test.expense_id',(select id::text from public.expenses where source_worker_receipt_id='20000000-0000-0000-0000-000000000006'),true);
select lives_ok($$select public.transition_expense_operation(current_setting('test.expense_id')::uuid,0,'20000000-0000-0000-0000-000000000010','request_info','{"message":"Confirm project"}')$$,'owner Request Info remains authorized');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
select ok((select count(*) > 0 from public.expense_operations where expense_id=current_setting('test.expense_id')::uuid),'owner: expense_operations read allowed');
select ok((select count(*) > 0 from public.expense_source_links where expense_id=current_setting('test.expense_id')::uuid),'owner: expense_source_links read allowed');
select ok((select count(*) > 0 from public.expense_review_issues where expense_id=current_setting('test.expense_id')::uuid),'owner: expense_review_issues read allowed');
select ok((select count(*) > 0 from public.expense_operation_events where expense_id=current_setting('test.expense_id')::uuid),'owner: expense_operation_events read allowed');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select ok((select count(*) > 0 from public.expense_operations where expense_id=current_setting('test.expense_id')::uuid),'admin: expense_operations read allowed');
select ok((select count(*) > 0 from public.expense_source_links where expense_id=current_setting('test.expense_id')::uuid),'admin: expense_source_links read allowed');
select ok((select count(*) > 0 from public.expense_review_issues where expense_id=current_setting('test.expense_id')::uuid),'admin: expense_review_issues read allowed');
select ok((select count(*) > 0 from public.expense_operation_events where expense_id=current_setting('test.expense_id')::uuid),'admin: expense_operation_events read allowed');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"role":"assistant"}}',true);
select is((select count(*) from public.expense_operations where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant: expense_operations read denied');
select is((select count(*) from public.expense_source_links where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant: expense_source_links read denied');
select is((select count(*) from public.expense_review_issues where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant: expense_review_issues read denied');
select is((select count(*) from public.expense_operation_events where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant: expense_operation_events read denied');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select is((select count(*) from public.expense_operations where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'outsider: expense_operations read denied');
select is((select count(*) from public.expense_source_links where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'outsider: expense_source_links read denied');
select is((select count(*) from public.expense_review_issues where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'outsider: expense_review_issues read denied');
select is((select count(*) from public.expense_operation_events where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'outsider: expense_operation_events read denied');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"role":"owner"}}',true);
select is((select count(*) from public.expense_operations where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant with stale owner JWT: expense_operations read denied');
select is((select count(*) from public.expense_source_links where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant with stale owner JWT: expense_source_links read denied');
select is((select count(*) from public.expense_review_issues where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant with stale owner JWT: expense_review_issues read denied');
select is((select count(*) from public.expense_operation_events where expense_id=current_setting('test.expense_id')::uuid),0::bigint,'assistant with stale owner JWT: expense_operation_events read denied');
select throws_ok($$select public.transition_expense_operation(current_setting('test.expense_id')::uuid,1,'20000000-0000-0000-0000-000000000011','exception','{"message":"Denied"}')$$,'42501',null,'assistant mutation remains denied despite stale owner JWT');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select lives_ok($$select public.transition_expense_operation(current_setting('test.expense_id')::uuid,1,'20000000-0000-0000-0000-000000000012','exception','{"message":"Admin review"}')$$,'admin Request Info/exception workflow remains authorized');
select is((select revision from public.expense_operations where expense_id=current_setting('test.expense_id')::uuid),2::bigint,'authorized writes advance exactly once');
reset role;
select ok(has_table_privilege('authenticated','public.expense_operations','SELECT') and not has_table_privilege('authenticated','public.expense_operations','INSERT,UPDATE,DELETE'),'authenticated: expense_operations grants unchanged');
select ok(has_table_privilege('service_role','public.expense_operations','SELECT') and not has_table_privilege('service_role','public.expense_operations','INSERT,UPDATE,DELETE'),'service_role: expense_operations grants unchanged');
select ok(has_table_privilege('authenticated','public.expense_source_links','SELECT') and not has_table_privilege('authenticated','public.expense_source_links','INSERT,UPDATE,DELETE'),'authenticated: expense_source_links grants unchanged');
select ok(has_table_privilege('service_role','public.expense_source_links','SELECT') and not has_table_privilege('service_role','public.expense_source_links','INSERT,UPDATE,DELETE'),'service_role: expense_source_links grants unchanged');
select ok(has_table_privilege('authenticated','public.expense_review_issues','SELECT') and not has_table_privilege('authenticated','public.expense_review_issues','INSERT,UPDATE,DELETE'),'authenticated: expense_review_issues grants unchanged');
select ok(has_table_privilege('service_role','public.expense_review_issues','SELECT') and not has_table_privilege('service_role','public.expense_review_issues','INSERT,UPDATE,DELETE'),'service_role: expense_review_issues grants unchanged');
select ok(has_table_privilege('authenticated','public.expense_operation_events','SELECT') and not has_table_privilege('authenticated','public.expense_operation_events','INSERT,UPDATE,DELETE'),'authenticated: expense_operation_events grants unchanged');
select ok(has_table_privilege('service_role','public.expense_operation_events','SELECT') and not has_table_privilege('service_role','public.expense_operation_events','INSERT,UPDATE,DELETE'),'service_role: expense_operation_events grants unchanged');
select * from finish();
rollback;
