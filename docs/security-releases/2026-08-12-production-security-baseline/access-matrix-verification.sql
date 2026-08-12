-- Execute after the forward migration as an authorized operator.
-- Every mutation probe is rolled back; this file makes no persistent data change.
-- Run each role section using a distinct, valid context. Do not place service-role credentials
-- in a browser or copy them into client-side tooling.

-- anon: no direct access to any scoped table.
begin;
set local role anon;
select
  has_table_privilege('public.audit_logs', 'select') as audit_select_denied,
  has_table_privilege('public.audit_logs', 'insert') as audit_insert_denied,
  has_table_privilege('public.tmp_backup_worker_advances_haijun', 'select') as backup_select_denied,
  has_table_privilege('public.tmp_backup_worker_advances_haijun', 'insert') as backup_insert_denied,
  has_table_privilege('public.labor_workers', 'select') as labor_workers_select_denied,
  has_table_privilege('public.labor_workers', 'insert') as labor_workers_insert_denied;
rollback;

-- authenticated non-owner: no evidence/history access, no labor_workers writes, and RLS sees zero rows.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"role":"member"}}',
  true
);
select
  has_table_privilege('public.audit_logs', 'select') as audit_select_denied,
  has_table_privilege('public.tmp_backup_worker_advances_haijun', 'select') as backup_select_denied,
  has_table_privilege('public.labor_workers', 'insert') as labor_workers_insert_denied,
  has_table_privilege('public.labor_workers', 'update') as labor_workers_update_denied,
  has_table_privilege('public.labor_workers', 'delete') as labor_workers_delete_denied,
  (select count(*) from public.labor_workers) as expected_zero_visible_rows;
rollback;

-- authenticated owner/admin: owner/admin may read the projection but still receives no table DML grant.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"role":"owner"}}',
  true
);
select
  has_table_privilege('public.labor_workers', 'select') as owner_select_granted,
  has_table_privilege('public.labor_workers', 'insert') as owner_insert_denied,
  has_table_privilege('public.labor_workers', 'update') as owner_update_denied,
  has_table_privilege('public.labor_workers', 'delete') as owner_delete_denied,
  (select count(*) from public.labor_workers) as owner_visible_rows;
rollback;

-- service_role: server-only projection maintenance remains available, with every probe rolled back.
begin;
set local role service_role;
select
  has_table_privilege('public.labor_workers', 'select') as service_select_granted,
  has_table_privilege('public.labor_workers', 'insert') as service_insert_granted,
  has_table_privilege('public.labor_workers', 'update') as service_update_granted,
  has_table_privilege('public.labor_workers', 'delete') as service_delete_granted,
  has_table_privilege('public.audit_logs', 'select') as audit_select_denied,
  has_table_privilege('public.tmp_backup_worker_advances_haijun', 'select') as backup_select_denied;
-- A worker insert/rename must atomically maintain the projection. If either
-- projection operation fails, the Worker statement fails and this transaction
-- remains rollback-only.
insert into public.workers (id, name)
values ('00000000-0000-0000-0000-000000000042'::uuid, '__security_probe__');
update public.workers
set name = '__security_probe_updated__'
where id = '00000000-0000-0000-0000-000000000042'::uuid;
select exists (
  select 1
  from public.labor_workers
  where id = '00000000-0000-0000-0000-000000000042'::uuid
    and name = '__security_probe_updated__'
) as atomic_worker_projection_verified;
rollback;
