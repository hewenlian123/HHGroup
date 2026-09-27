begin;
select no_plan();
insert into auth.users(id,email,raw_app_meta_data,is_anonymous) values('18000000-0000-4000-8000-000000000001','sources-test@example.invalid','{"role":"owner"}',false);
insert into public.organization_memberships(organization_id,user_id,role,status) values(private.company_organization_id(),'18000000-0000-4000-8000-000000000001','owner','active');
select set_config('request.jwt.claims','{"sub":"18000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
insert into public.receipt_queue(id,status,amount,expense_date,vendor_name,file_name,mime_type,storage_path)
values('18000000-0000-4000-8000-000000000002','pending','25.50','2026-09-01','[E2E] Receipt','receipt.jpg','image/jpeg','fixture/receipt.jpg');
create temp table source_fixture(expense_id uuid);
insert into source_fixture select (public.finalize_receipt_queue_operation('18000000-0000-4000-8000-000000000002')->>'expense_id')::uuid;
select is((select count(*) from public.receipt_queue where id='18000000-0000-4000-8000-000000000002'),0::bigint,'completed queue row moved atomically');
select is((select evidence->>'storage_path' from public.expense_source_links where source_key='18000000-0000-4000-8000-000000000002'),'fixture/receipt.jpg','original evidence retained after queue transfer');
select is((select file_path from public.attachments where id='18000000-0000-4000-8000-000000000002'),'fixture/receipt.jpg','attachment retained');
select is((select total from public.expenses where id=(select expense_id from source_fixture)),25.50::numeric,'receipt amount preserved');
select is((select count(*) from public.expense_intake_sources where expense_id=(select expense_id from source_fixture) and source_kind='upload'),1::bigint,'finalized receipt remains discoverable in Intake');
select is((public.finalize_receipt_queue_operation('18000000-0000-4000-8000-000000000002')->>'expense_id')::uuid,(select expense_id from source_fixture),'retry reuses canonical Expense');
insert into public.receipt_queue(id,status,amount,expense_date,vendor_name,file_name,mime_type)
values('18000000-0000-4000-8000-000000000003','pending','25.50','2026-09-01','[E2E] Second evidence','receipt.pdf','application/pdf');
select lives_ok($$select public.finalize_receipt_queue_operation('18000000-0000-4000-8000-000000000003',(select expense_id from source_fixture))$$,'explicit additional source links same Expense');
select is((select count(*) from public.expense_source_links where expense_id=(select expense_id from source_fixture)),2::bigint,'multiple sources retain one canonical identity');
select is((select count(*) from public.expenses where source_id in ('18000000-0000-4000-8000-000000000002','18000000-0000-4000-8000-000000000003')),1::bigint,'extra evidence does not add project cost');
insert into public.bank_transactions(id,txn_date,description,amount,status) values
('18000000-0000-4000-8000-000000000004','2026-09-01','[E2E] Bank',-25.50,'unmatched'),
('18000000-0000-4000-8000-000000000005','2026-09-01','[E2E] Bank second',-25.50,'unmatched'),
('18000000-0000-4000-8000-000000000006','2026-09-01','[E2E] Bank wrong amount',-26,'unmatched');
select throws_ok($$select public.match_bank_expense_operation('18000000-0000-4000-8000-000000000006',(select expense_id from source_fixture))$$,'23514',null,'wrong bank amount rejected');
select lives_ok($$select public.match_bank_expense_operation('18000000-0000-4000-8000-000000000004',(select expense_id from source_fixture))$$,'single bank match succeeds');
select lives_ok($$select public.match_bank_expense_operation('18000000-0000-4000-8000-000000000004',(select expense_id from source_fixture))$$,'bank match retries are idempotent');
select throws_ok($$select public.match_bank_expense_operation('18000000-0000-4000-8000-000000000005',(select expense_id from source_fixture))$$,'23505',null,'second bank transaction cannot match same Expense');
select is((select count(*) from public.expense_source_links where expense_id=(select expense_id from source_fixture) and source_kind='bank_transaction'),1::bigint,'only one bank source recorded');
select is((select total from public.expenses where id=(select expense_id from source_fixture)),25.50::numeric,'matching does not mutate cost');
insert into public.receipt_queue(id,status,amount,expense_date,vendor_name,file_name,mime_type)
values('18000000-0000-4000-8000-000000000007','pending','7','2026-09-01','[E2E] Failure','fail.jpg','image/jpeg');
create function pg_temp.fail_source_audit() returns trigger language plpgsql as $$begin raise exception 'injected source audit failure'; end$$;
create trigger source_audit_failure before insert on public.expense_operation_events for each row execute function pg_temp.fail_source_audit();
select throws_ok($$select public.finalize_receipt_queue_operation('18000000-0000-4000-8000-000000000007')$$,'P0001','injected source audit failure','audit failure aborts transfer');
drop trigger source_audit_failure on public.expense_operation_events;
select is((select count(*) from public.receipt_queue where id='18000000-0000-4000-8000-000000000007'),1::bigint,'failure preserves receipt');
select is((select count(*) from public.expenses where source_id='18000000-0000-4000-8000-000000000007'),0::bigint,'failure leaves no partial Expense');
select is(has_function_privilege('anon','public.finalize_receipt_queue_operation(uuid,uuid)','EXECUTE'),false,'anonymous transfer denied');
select is(has_function_privilege('service_role','public.match_bank_expense_operation(uuid,uuid)','EXECUTE'),false,'bank match requires authenticated actor');

select throws_ok($$update public.bank_transactions set amount=-26 where id='18000000-0000-4000-8000-000000000004'$$,'23514',null,'linked bank amount cannot invalidate match');
select throws_ok($$update public.expenses set total=26 where id=(select expense_id from source_fixture)$$,'23514',null,'linked Expense amount cannot invalidate match');
select throws_ok($$insert into public.bank_transactions(id,txn_date,description,amount,status,linked_expense_id) values('18000000-0000-4000-8000-000000000008','2026-09-01','duplicate linked insert',-25.50,'reconciled',(select expense_id from source_fixture))$$,'23505',null,'linked INSERT also enforces single bank match');
insert into public.expenses(id,expense_date,total,amount,status,source_type) values('18000000-0000-4000-8000-000000000009','2026-09-01',10,10,'needs_review','company');
insert into public.expense_lines(expense_id,amount,total,category) values('18000000-0000-4000-8000-000000000009',10,10,'Office');
select lives_ok($$select public.transition_expense_operation('18000000-0000-4000-8000-000000000009',0,'18000000-0000-4000-8000-000000000010','approve','{"cost_allocation":"overhead"}')$$,'explicit overhead preserves company approval contract');
select lives_ok($$select public.transition_expense_operation('18000000-0000-4000-8000-000000000009',1,'18000000-0000-4000-8000-000000000011','post')$$,'explicitly approved overhead can Post');
select throws_ok($$update public.expense_lines set expense_id=(select expense_id from source_fixture) where expense_id='18000000-0000-4000-8000-000000000009'$$,'23514',null,'posted source line cannot escape through reparenting');

select * from finish();
rollback;
