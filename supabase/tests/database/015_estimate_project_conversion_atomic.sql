begin;
select no_plan();
select has_function('public', 'convert_estimate_to_project_atomic', 'conversion transaction exists');
select ok(not has_function_privilege('anon', 'public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text)', 'execute'), 'anonymous cannot call conversion');
select ok(not has_function_privilege('authenticated', 'public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text)', 'execute'), 'browser cannot submit project pricing');
select ok(has_function_privilege('service_role', 'public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text)', 'execute'), 'verified server can call conversion');

insert into auth.users (id, aud, role, email, raw_app_meta_data, is_anonymous)
values ('15151515-1515-4151-8151-151515151501', 'authenticated', 'authenticated',
  'conversion-atomic@example.test', '{"role":"owner"}', false);
insert into public.organization_memberships(organization_id,user_id,role,status)
select id, '15151515-1515-4151-8151-151515151501', 'owner', 'active'
from public.organizations where legacy_company_profile_id is not null;
insert into public.customers(id,name) values ('15151515-1515-4151-8151-151515151502','[E2E] Conversion customer');
insert into public.estimates(id,number,status,customer_id) values
('15151515-1515-4151-8151-151515151503','[E2E] Conversion success','Approved','15151515-1515-4151-8151-151515151502'),
('15151515-1515-4151-8151-151515151504','[E2E] Conversion rollback','Approved','15151515-1515-4151-8151-151515151502');
create temp table conversion_result(result jsonb);
grant insert,select on conversion_result to service_role;
-- Exercise the real application RPC role, not the fixture-provisioning database owner.
set local role service_role;
insert into conversion_result select public.convert_estimate_to_project_atomic(
 '15151515-1515-4151-8151-151515151503',
 '{"name":"[E2E] Converted project","budget":1000,"snapshotRevenue":1000,"snapshotBudgetCost":800,"snapshotBreakdown":{"materials":300,"labor":300,"vendor":200,"other":0}}',
 '15151515-1515-4151-8151-151515151501', 'Verified owner');
reset role;
select is((select status from public.estimates where id='15151515-1515-4151-8151-151515151503'), 'Converted', 'lifecycle committed');
select is((select customer_id from public.projects where source_estimate_id='15151515-1515-4151-8151-151515151503'), '15151515-1515-4151-8151-151515151502'::uuid, 'customer linkage preserved');
select is((select budget from public.projects where source_estimate_id='15151515-1515-4151-8151-151515151503'), 1000::numeric, 'contract amount preserved');
select is((select snapshot_budget_cost from public.projects where source_estimate_id='15151515-1515-4151-8151-151515151503'), 800::numeric, 'cost snapshot preserved');
select is((select count(*) from public.estimate_activity_events where estimate_id='15151515-1515-4151-8151-151515151503' and event_type='converted_to_project'), 1::bigint, 'one activity committed');
select is(public.convert_estimate_to_project_atomic(
 '15151515-1515-4151-8151-151515151503', '{}',
 '15151515-1515-4151-8151-151515151501', 'Verified owner'),
 (select result from conversion_result), 'retry returns exact committed result');
select is((select count(*) from public.projects where source_estimate_id='15151515-1515-4151-8151-151515151503'), 1::bigint, 'retry creates no duplicate project');
select is((select count(*) from public.estimate_activity_events where estimate_id='15151515-1515-4151-8151-151515151503' and event_type='converted_to_project'), 1::bigint, 'retry creates no duplicate activity');

create function pg_temp.reject_conversion_activity() returns trigger language plpgsql as $$
begin raise exception 'injected conversion activity failure'; end $$;
create trigger test_reject_conversion_activity before insert on public.estimate_activity_events
for each row when (new.estimate_id='15151515-1515-4151-8151-151515151504')
execute function pg_temp.reject_conversion_activity();
select throws_ok($query$select public.convert_estimate_to_project_atomic(
 '15151515-1515-4151-8151-151515151504',
 '{"name":"[E2E] Rollback project","budget":1000,"snapshotRevenue":1000,"snapshotBudgetCost":800,"snapshotBreakdown":{"materials":300,"labor":300,"vendor":200,"other":0}}',
 '15151515-1515-4151-8151-151515151501', 'Verified owner')$query$,
 'P0001', 'injected conversion activity failure', 'activity failure rejects entire transaction');
select is((select count(*) from public.projects where source_estimate_id='15151515-1515-4151-8151-151515151504'), 0::bigint, 'failed transaction leaves no project');
select is((select status from public.estimates where id='15151515-1515-4151-8151-151515151504'), 'Approved', 'failed transaction restores estimate lifecycle');
update public.organization_memberships set status='inactive' where user_id='15151515-1515-4151-8151-151515151501';
select throws_ok($query$select public.convert_estimate_to_project_atomic(
 '15151515-1515-4151-8151-151515151503', '{}',
 '15151515-1515-4151-8151-151515151501', 'Verified owner')$query$,
 '42501', 'Company administrator authorization required', 'revoked membership cannot retry or convert');
select * from finish();
rollback;
