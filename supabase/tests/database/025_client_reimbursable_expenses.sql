begin;
select no_plan();

insert into auth.users(id,email,raw_app_meta_data,is_anonymous)
values('25000000-0000-0000-0000-000000000001','client-reimbursement@example.invalid','{"role":"owner"}',false);
insert into public.organization_memberships(organization_id,user_id,role,status)
values(private.company_organization_id(),'25000000-0000-0000-0000-000000000001','owner','active');
select set_config('request.jwt.claims','{"sub":"25000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);

select has_column('public','expense_lines','client_reimbursable','client reimbursable column exists');
select has_column('public','expense_lines','client_reimbursement_status','client reimbursement status exists');
select has_function('public','reserve_client_reimbursement_request',array['uuid[]','date'],'reserve request exists');
select is(has_function_privilege('anon','public.reserve_client_reimbursement_request(uuid[],date)','EXECUTE'),false,'anonymous reserve denied');
select is(has_function_privilege('anon','public.settle_client_reimbursement(uuid[],date,numeric,uuid)','EXECUTE'),false,'anonymous settle denied');

insert into public.projects(id,name,address,client_name,organization_id,status)
values('25000000-0000-0000-0000-000000000002','PW Reimbursement Project','100 Waialae Ave','Aloha Client',private.company_organization_id(),'active');

create temp table client_reimb as
select (public.create_expense_atomic('25000000-0000-0000-0000-000000000010',
  '{"expenseDate":"2026-09-18","vendorName":"Island Hardware","sourceType":"company","status":"draft","paymentMethod":"Other","referenceNo":"INV-2201","groups":[{"projectId":"25000000-0000-0000-0000-000000000002","lines":[{"projectId":"25000000-0000-0000-0000-000000000002","category":"Materials","amount":126.40}]}]}'::jsonb)->>'expense_id')::uuid as expense_id;

select is((select client_reimbursable from public.expense_lines where expense_id=(select expense_id from client_reimb)),false,'new lines are not client reimbursable');
select lives_ok($$select public.transition_expense_operation((select expense_id from client_reimb),coalesce((select revision from public.expense_operations where expense_id=(select expense_id from client_reimb)),0)::integer,'25000000-0000-0000-0000-000000000011','approve','{"settlement":"unpaid"}')$$,'project expense approves');
select lives_ok($$select public.set_expense_line_client_reimbursable((select expense_id from client_reimb),null,true)$$,'line can be marked reimbursable');
select is((select review_state from public.expense_operations where expense_id=(select expense_id from client_reimb)),'approved','reimbursable flag does not unapprove');
select is((select amount from public.expense_lines where expense_id=(select expense_id from client_reimb)),126.40::numeric,'flag does not change the line amount');

insert into public.documents(id,file_name,file_path,file_type,project_id,organization_id)
values(
  '25000000-0000-0000-0000-000000000020',
  'CR.pdf',
  'organizations/' || private.company_organization_id()::text || '/projects/25000000-0000-0000-0000-000000000002/documents/25000000-0000-0000-0000-000000000020/CR.pdf',
  'Invoice',
  '25000000-0000-0000-0000-000000000002',
  private.company_organization_id()
);

create temp table client_reimb_request as
select public.reserve_client_reimbursement_request(
  array(select id from public.expense_lines where expense_id=(select expense_id from client_reimb)),
  date '2026-09-29'
) as payload;

select ok((select payload->>'request_no' from client_reimb_request) like 'CR-20260929-%','request number uses the request date');
select lives_ok($$select public.attach_client_reimbursement_document(
  (select (payload->>'request_id')::uuid from client_reimb_request),
  array(select id from public.expense_lines where expense_id=(select expense_id from client_reimb)),
  '25000000-0000-0000-0000-000000000020')$$,'pdf attach marks the line requested');
select is((select client_reimbursement_status from public.expense_lines where expense_id=(select expense_id from client_reimb)),'requested','status is requested');
select is((select review_state from public.expense_operations where expense_id=(select expense_id from client_reimb)),'approved','request does not unapprove');
select is((select amount from public.expense_lines where expense_id=(select expense_id from client_reimb)),126.40::numeric,'request does not change job-cost amount');

select lives_ok($$select public.settle_client_reimbursement(
  array(select id from public.expense_lines where expense_id=(select expense_id from client_reimb)),
  date '2026-09-29',
  126.40,
  null)$$,'line can be marked reimbursed');
select is((select client_reimbursement_status from public.expense_lines where expense_id=(select expense_id from client_reimb)),'reimbursed','status is reimbursed');
select is((select amount from public.expense_lines where expense_id=(select expense_id from client_reimb)),126.40::numeric,'reimbursement does not remove the expense from cost');
select is((select review_state from public.expense_operations where expense_id=(select expense_id from client_reimb)),'approved','reimbursement does not unapprove');
select throws_ok($$select public.settle_client_reimbursement(
  array(select id from public.expense_lines where expense_id=(select expense_id from client_reimb)),
  date '2026-09-29',
  10,
  null)$$,'23514','Only open client-reimbursable lines can be marked reimbursed.','a reimbursed line cannot be settled again');

select * from finish();
rollback;
