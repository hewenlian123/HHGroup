begin;
select plan(7);
insert into public.workers(id,name) values ('71717171-7171-4171-8171-717171717101','[E2E] Payroll Scope');
insert into public.projects(id,name) values
('71717171-7171-4171-8171-717171717102','[E2E] Payroll Scope A'),
('71717171-7171-4171-8171-717171717103','[E2E] Payroll Scope B');
insert into public.labor_entries(id,worker_id,project_id,work_date,labor_cost_snapshot,amount_snapshot,cost_amount,status)
values ('71717171-7171-4171-8171-717171717104','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717102','2026-09-06',100,100,100,'Approved');
insert into public.worker_reimbursements(id,worker_id,project_id,amount,status,reimbursement_date)
values ('71717171-7171-4171-8171-717171717105','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717102',25,'pending','2026-09-06');
select throws_ok($$
select public.record_worker_payroll_settlement('scope-wrong-labor','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717103',100,'Cash','2026-09-06',null,array['71717171-7171-4171-8171-717171717104']::uuid[],'{}'::uuid[],'{}'::uuid[],0)
$$,'23514',null,'Project B cannot label Project A labor as its payment');
select is((select count(*) from public.worker_payments where idempotency_key='scope-wrong-labor'),0::bigint,'Wrong labor scope leaves no payment');
select is((select worker_payment_id from public.labor_entries where id='71717171-7171-4171-8171-717171717104'),null::uuid,'Wrong labor scope leaves labor unpaid');
select throws_ok($$
select public.record_worker_payroll_settlement('scope-wrong-reimbursement','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717103',25,'Cash','2026-09-06',null,'{}'::uuid[],array['71717171-7171-4171-8171-717171717105']::uuid[],'{}'::uuid[],0)
$$,'23514',null,'Project B cannot label Project A reimbursement as its payment');
select lives_ok($$
select public.record_worker_payroll_settlement('scope-correct','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717102',100,'Cash','2026-09-06',null,array['71717171-7171-4171-8171-717171717104']::uuid[],'{}'::uuid[],'{}'::uuid[],0)
$$,'An explicitly matching project can settle labor');
select lives_ok($$
select public.record_worker_payroll_settlement('scope-correct','71717171-7171-4171-8171-717171717101','71717171-7171-4171-8171-717171717102',100,'Cash','2026-09-06',null,array['71717171-7171-4171-8171-717171717104']::uuid[],'{}'::uuid[],'{}'::uuid[],0)
$$,'Same project settlement retries remain idempotent');
select lives_ok($$
select public.record_worker_payroll_settlement('scope-global','71717171-7171-4171-8171-717171717101',null,25,'Cash','2026-09-06',null,'{}'::uuid[],array['71717171-7171-4171-8171-717171717105']::uuid[],'{}'::uuid[],0)
$$,'Global payment can settle a project reimbursement without assigning a project scope');
select * from finish();
rollback;
