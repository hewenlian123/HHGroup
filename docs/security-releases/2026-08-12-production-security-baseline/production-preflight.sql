-- Read-only Production preflight for 20260812103821_production_security_baseline_closure.
-- Run as an authorized operator before approval. Do not run DDL from this file.

select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('audit_logs', 'tmp_backup_worker_advances_haijun', 'labor_workers')
order by table_name, ordinal_position;

select
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as rls_forced,
  pg_get_userbyid(cls.relowner) as owner
from pg_class cls
join pg_namespace nsp on nsp.oid = cls.relnamespace
where nsp.nspname = 'public'
  and cls.relname in ('audit_logs', 'tmp_backup_worker_advances_haijun', 'labor_workers')
order by cls.relname;

-- This ACL query includes grants inherited through PUBLIC, unlike a role_table_grants-only view.
select
  cls.relname as table_name,
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_class cls
join pg_namespace nsp on nsp.oid = cls.relnamespace
cross join lateral aclexplode(coalesce(cls.relacl, acldefault('r', cls.relowner))) as acl
where nsp.nspname = 'public'
  and cls.relname in ('audit_logs', 'tmp_backup_worker_advances_haijun', 'labor_workers')
order by cls.relname, grantee, acl.privilege_type;

select
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('audit_logs', 'tmp_backup_worker_advances_haijun', 'labor_workers')
order by tablename, policyname;

select
  conrelid::regclass::text as child_table,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and (
    conrelid = 'public.labor_workers'::regclass
    or confrelid = 'public.labor_workers'::regclass
  )
order by conrelid::regclass::text, conname;

-- The guarded runtime projection uses UPSERT (id, name), so approval requires
-- a non-partial unique key on exactly labor_workers.id.
select
  idx.relname as index_name,
  ind.indisunique,
  ind.indisvalid,
  ind.indisready,
  ind.indimmediate,
  ind.indpred is null as is_non_partial,
  array(
    select att.attname
    from unnest(ind.indkey) with ordinality as key_columns(attnum, position)
    join pg_attribute att on att.attrelid = ind.indrelid and att.attnum = key_columns.attnum
    where key_columns.position <= ind.indnkeyatts
    order by key_columns.position
  ) as key_columns
from pg_index ind
join pg_class idx on idx.oid = ind.indexrelid
where ind.indrelid = 'public.labor_workers'::regclass
order by idx.relname;

select
  tgrelid::regclass::text as trigger_table,
  tgname,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where not tgisinternal
  and tgrelid = 'public.workers'::regclass
  and tgname in (
    'sync_worker_to_labor_workers_trigger',
    'hh_sync_worker_to_labor_workers_projection_trigger'
  );

select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace nsp on nsp.oid = p.pronamespace
where nsp.nspname = 'public'
  and p.oid = to_regprocedure('public.hh_sync_worker_to_labor_workers_projection()');

select
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
where p.oid = to_regprocedure('public.hh_sync_worker_to_labor_workers_projection()')
order by grantee, acl.privilege_type;

select
  rolname,
  rolbypassrls
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role')
order by rolname;

select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace nsp on nsp.oid = p.pronamespace
where nsp.nspname = 'public'
  and p.oid = 'public.is_owner_or_admin()'::regprocedure;

select
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
where p.oid = 'public.is_owner_or_admin()'::regprocedure
order by grantee, acl.privilege_type;

select 'audit_logs' as table_name, count(*)::bigint as exact_row_count from public.audit_logs
union all
select 'tmp_backup_worker_advances_haijun', count(*)::bigint from public.tmp_backup_worker_advances_haijun
union all
select 'labor_workers', count(*)::bigint from public.labor_workers
order by table_name;
