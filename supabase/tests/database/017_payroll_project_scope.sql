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

select plan(7);
insert into public.workers(id,name) values ('71717171-7171-4171-8171-717171717101','[E2E] Payroll Scope');
insert into public.projects(id,name) values
('71717171-7171-4171-8171-717171717102','[E2E] Payroll Scope A'),
('71717171-7171-4171-8171-717171717103','[E2E] Payroll Scope B');
insert into public.labor_entries(id,worker_id,project_id,work_date,labor_cost_snapshot,amount_snapshot,cost_amount,status)
values ('71717171-7171-4171-8171-717171717104','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717102','2026-09-06',100,100,100,'Approved');
select pg_temp.canonical_receipt('71717171-7171-4171-8171-717171717105','71717171-7171-4171-8171-717171717101',25,'71717171-7171-4171-8171-717171717102');
select throws_ok($$
select public.record_worker_payroll_settlement('scope-wrong-labor','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717103',100,'Cash','2026-09-06',null,array['71717171-7171-4171-8171-717171717104']::uuid[],'{}'::uuid[],'{}'::uuid[],0)
$$,'23514',null,'Project B cannot label Project A labor as its payment');
select is((select count(*) from public.worker_payments where idempotency_key='scope-wrong-labor'),0::bigint,'Wrong labor scope leaves no payment');
select is((select worker_payment_id from public.labor_entries where id='71717171-7171-4171-8171-717171717104'),null::uuid,'Wrong labor scope leaves labor unpaid');
select throws_ok($$
select public.record_worker_payroll_settlement('scope-wrong-reimbursement','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717103',25,'Cash','2026-09-06',null,'{}'::uuid[],array[pg_temp.obligation('71717171-7171-4171-8171-717171717105')]::uuid[],'{}'::uuid[],0)
$$,'23514',null,'Project B cannot label Project A reimbursement as its payment');
select lives_ok($$
select public.record_worker_payroll_settlement('scope-correct','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717102',100,'Cash','2026-09-06',null,array['71717171-7171-4171-8171-717171717104']::uuid[],'{}'::uuid[],'{}'::uuid[],0)
$$,'An explicitly matching project can settle labor');
select lives_ok($$
select public.record_worker_payroll_settlement('scope-correct','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717102',100,'Cash','2026-09-06',null,array['71717171-7171-4171-8171-717171717104']::uuid[],'{}'::uuid[],'{}'::uuid[],0)
$$,'Same project settlement retries remain idempotent');
select lives_ok($$
select public.record_worker_payroll_settlement('scope-global','71717171-7171-4171-8171-717171717101',null,25,'Cash','2026-09-06',null,'{}'::uuid[],array[pg_temp.obligation('71717171-7171-4171-8171-717171717105')]::uuid[],'{}'::uuid[],0)
$$,'Global payment can settle a project reimbursement without assigning a project scope');
select * from finish();
rollback;
