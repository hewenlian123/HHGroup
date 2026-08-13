-- Read-only Production preflight for 20260813002206_final_anonymous_crud_closure.
-- Operator-only. Do not run DDL or DML from this file.

select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('cost_allocations', 'material_selections', 'material_selection_items')
order by table_name, ordinal_position;

select
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as rls_forced,
  pg_get_userbyid(cls.relowner) as owner
from pg_class cls
join pg_namespace nsp on nsp.oid = cls.relnamespace
where nsp.nspname = 'public'
  and cls.relname in ('cost_allocations', 'material_selections', 'material_selection_items')
order by cls.relname;

-- Includes grants inherited through PUBLIC, unlike role_table_grants alone.
select
  cls.relname as table_name,
  case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_class cls
join pg_namespace nsp on nsp.oid = cls.relnamespace
cross join lateral aclexplode(coalesce(cls.relacl, acldefault('r', cls.relowner))) as acl
where nsp.nspname = 'public'
  and cls.relname in ('cost_allocations', 'material_selections', 'material_selection_items')
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
  and tablename in ('cost_allocations', 'material_selections', 'material_selection_items')
order by tablename, policyname;

select
  conrelid::regclass::text as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.cost_allocations'::regclass,
  'public.material_selections'::regclass,
  'public.material_selection_items'::regclass
)
order by conrelid::regclass::text, conname;

select
  tgrelid::regclass::text as table_name,
  tgname,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where not tgisinternal
  and tgrelid in (
    'public.cost_allocations'::regclass,
    'public.material_selections'::regclass,
    'public.material_selection_items'::regclass
  )
order by tgrelid::regclass::text, tgname;

select
  rolname,
  rolbypassrls
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role')
order by rolname;

-- Required state: all three tables exist with RLS enabled; only service_role
-- has table CRUD for the two material tables; no scoped RLS policies remain.
with expected(table_name, grantee, privilege_type) as (
  values
    ('material_selections', 'service_role', 'SELECT'),
    ('material_selections', 'service_role', 'INSERT'),
    ('material_selections', 'service_role', 'UPDATE'),
    ('material_selections', 'service_role', 'DELETE'),
    ('material_selection_items', 'service_role', 'SELECT'),
    ('material_selection_items', 'service_role', 'INSERT'),
    ('material_selection_items', 'service_role', 'UPDATE'),
    ('material_selection_items', 'service_role', 'DELETE')
), actual as (
  select
    cls.relname as table_name,
    case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type
  from pg_class cls
  join pg_namespace nsp on nsp.oid = cls.relnamespace
  cross join lateral aclexplode(coalesce(cls.relacl, acldefault('r', cls.relowner))) as acl
  where nsp.nspname = 'public'
    and cls.relname in ('cost_allocations', 'material_selections', 'material_selection_items')
    and (
      acl.grantee = 0
      or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated', 'service_role')
    )
)
select 'unexpected_grant' as finding, actual.*
from actual
left join expected using (table_name, grantee, privilege_type)
where expected.table_name is null
union all
select 'missing_required_grant', expected.*
from expected
left join actual using (table_name, grantee, privilege_type)
where actual.table_name is null
order by finding, table_name, grantee, privilege_type;
