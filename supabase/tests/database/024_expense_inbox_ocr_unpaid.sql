begin;
select no_plan();

insert into auth.users(id,email,raw_app_meta_data,is_anonymous)
values('24000000-0000-0000-0000-000000000001','inbox-ocr-unpaid@example.invalid','{"role":"owner"}',false);
insert into public.organization_memberships(organization_id,user_id,role,status)
values(private.company_organization_id(),'24000000-0000-0000-0000-000000000001','owner','active');
select set_config('request.jwt.claims','{"sub":"24000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);

select has_column('public','expenses','ocr_status','ocr status column exists');
select has_column('public','expenses','inbox_capture','inbox capture column exists');
select has_column('public','expenses','payment_status','payment status column exists');
select has_column('public','expenses','file_sha256','file fingerprint column exists');
select has_function('public','claim_expense_ocr_jobs',array['integer'],'ocr claim function exists');
select is(has_function_privilege('anon','public.claim_expense_ocr_jobs(integer)','EXECUTE'),false,'anonymous ocr claim denied');

create temp table inbox_unpaid as
select (public.create_expense_atomic('24000000-0000-0000-0000-000000000010',
  '{"expenseDate":"2026-09-28","vendorName":"PW Inbox Vendor","sourceType":"company","status":"draft","paymentMethod":"Other","referenceNo":"INBOX-UP-unpaid","groups":[{"projectId":null,"lines":[{"projectId":null,"category":"Materials","amount":42.50}]}]}'::jsonb)->>'expense_id')::uuid as expense_id;

select is((select inbox_capture from public.expenses where id=(select expense_id from inbox_unpaid)),false,'create does not backfill inbox capture');
update public.expenses
set ocr_status='done'
where inbox_capture and ocr_status in ('pending','processing') and id is distinct from (select expense_id from inbox_unpaid);
update public.expenses
set inbox_capture=true, ocr_status='pending'
where id=(select expense_id from inbox_unpaid);
select is((select expense_id::text from public.claim_expense_ocr_jobs(1)),(select expense_id::text from inbox_unpaid),'pending inbox row is claimed');
select is((select ocr_status from public.expenses where id=(select expense_id from inbox_unpaid)),'processing','claim marks the row processing');

select lives_ok($$select public.transition_expense_operation((select expense_id from inbox_unpaid),coalesce((select revision from public.expense_operations where expense_id=(select expense_id from inbox_unpaid)),0)::integer,'24000000-0000-0000-0000-000000000011','approve','{"cost_allocation":"overhead","settlement":"unpaid"}')$$,'inbox draft approves unpaid without a payment account');
select is((select status from public.expenses where id=(select expense_id from inbox_unpaid)),'approved','unpaid approval records the expense');
select is((select payment_status from public.expenses where id=(select expense_id from inbox_unpaid)),'unpaid','approval stores unpaid settlement');
select is((select payment_account_id from public.expenses where id=(select expense_id from inbox_unpaid)) is null,true,'unpaid approval leaves the payment account empty');
select is((select review_state from public.expense_operations where expense_id=(select expense_id from inbox_unpaid)),'approved','unpaid approval is a real review');

insert into public.payment_accounts(id,name,type)
values('24000000-0000-0000-0000-000000000012','PW Inbox Cash','cash');
update public.expenses
set payment_account_id='24000000-0000-0000-0000-000000000012',
    payment_status='paid',
    paid_on=date '2026-09-28'
where id=(select expense_id from inbox_unpaid);
select is((select review_state from public.expense_operations where expense_id=(select expense_id from inbox_unpaid)),'approved','marking paid later does not unapprove');
select is((select payment_status from public.expenses where id=(select expense_id from inbox_unpaid)),'paid','mark paid stores paid settlement');

create temp table inbox_paid_gate as
select (public.create_expense_atomic('24000000-0000-0000-0000-000000000020',
  '{"expenseDate":"2026-09-28","vendorName":"PW Inbox Vendor","sourceType":"company","status":"draft","paymentMethod":"Other","groups":[{"projectId":null,"lines":[{"projectId":null,"category":"Materials","amount":10}]}]}'::jsonb)->>'expense_id')::uuid as expense_id;
select throws_ok($$select public.transition_expense_operation((select expense_id from inbox_paid_gate),coalesce((select revision from public.expense_operations where expense_id=(select expense_id from inbox_paid_gate)),0)::integer,'24000000-0000-0000-0000-000000000021','approve','{"cost_allocation":"overhead","settlement":"paid"}')$$,'23514','Choose a payment account to mark this expense paid.','paid approval still requires an account');

create temp table inbox_mismatch as
select (public.create_expense_atomic('24000000-0000-0000-0000-000000000030',
  '{"expenseDate":"2026-09-28","vendorName":"PW Inbox Vendor","sourceType":"company","status":"draft","paymentMethod":"Other","groups":[{"projectId":null,"lines":[{"projectId":null,"category":"Materials","amount":11.11}]}]}'::jsonb)->>'expense_id')::uuid as expense_id;
update public.expenses set total=12.11,amount=12.11 where id=(select expense_id from inbox_mismatch);
select throws_ok($$select public.transition_expense_operation((select expense_id from inbox_mismatch),coalesce((select revision from public.expense_operations where expense_id=(select expense_id from inbox_mismatch)),0)::integer,'24000000-0000-0000-0000-000000000031','approve','{"cost_allocation":"overhead","settlement":"unpaid"}')$$,'23514','Valid amount, project and category coding required.','header total must still equal the lines');

select * from finish();
rollback;
