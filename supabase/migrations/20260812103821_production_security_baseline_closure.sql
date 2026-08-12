-- HH Group Production Security Baseline Closure
-- Scope: secure retained security/history tables and establish the canonical
-- labor_workers projection contract. This migration neither deletes nor rewrites data.

begin;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'audit_logs',
    'tmp_backup_worker_advances_haijun',
    'labor_workers',
    'workers'
  ] loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'production security baseline closure requires public.%', target_table;
    end if;
  end loop;

  if to_regprocedure('public.is_owner_or_admin()') is null then
    raise exception 'production security baseline closure requires public.is_owner_or_admin()';
  end if;

  if position('app_metadata' in pg_get_functiondef('public.is_owner_or_admin()'::regprocedure)) = 0 then
    raise exception 'production security baseline closure requires is_owner_or_admin() to derive role from trusted app_metadata';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.is_owner_or_admin()'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'production security baseline closure requires authenticated to execute public.is_owner_or_admin()';
  end if;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'service_role'
      and rolbypassrls
  ) then
    raise exception 'production security baseline closure requires the server-only service_role to bypass RLS';
  end if;

  -- Runtime projection maintenance uses INSERT ... ON CONFLICT (id). Require a
  -- non-partial unique key on exactly labor_workers.id before changing access.
  if not exists (
    select 1
    from pg_index idx
    where idx.indrelid = 'public.labor_workers'::regclass
      and idx.indisunique
      and idx.indisvalid
      and idx.indisready
      and idx.indimmediate
      and idx.indpred is null
      and idx.indnkeyatts = 1
      and array(
        select key_attnum
        from unnest(idx.indkey) with ordinality as key_columns(key_attnum, position)
        where key_columns.position <= idx.indnkeyatts
      ) = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.labor_workers'::regclass
            and attname = 'id'
            and not attisdropped
        )
      ]
  ) then
    raise exception 'production security baseline closure requires a valid, ready, immediate, non-partial unique key on public.labor_workers(id)';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.workers'::regclass
      and attname in ('id', 'name')
      and not attisdropped
    group by attrelid
    having count(*) = 2
  ) then
    raise exception 'production security baseline closure requires public.workers(id, name) for the atomic labor_workers projection';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('audit_logs', 'tmp_backup_worker_advances_haijun')
  ) then
    raise exception 'production security baseline closure found unexpected audit/history RLS policies; classify before apply';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'labor_workers'
      and policyname not in (
        'dev full access',
        'allow authenticated delete',
        'allow authenticated insert',
        'allow authenticated read',
        'allow authenticated update',
        'labor_workers_owner_admin_select'
      )
  ) then
    raise exception 'production security baseline closure found an unknown labor_workers policy; classify before apply';
  end if;
end
$$;

-- Preserve both retained tables and all historical rows. Their canonical contract is no
-- direct Data API access: no role grant plus RLS with no policy fails closed.
alter table public.audit_logs enable row level security;
revoke all privileges on table public.audit_logs from public, anon, authenticated, service_role;

alter table public.tmp_backup_worker_advances_haijun enable row level security;
revoke all privileges on table public.tmp_backup_worker_advances_haijun
  from public, anon, authenticated, service_role;

-- labor_workers is a live internal projection for labor foreign keys. Browsers can only
-- read it through the owner/admin RLS policy; browser writes have no grant or policy.
alter table public.labor_workers enable row level security;
revoke all privileges on table public.labor_workers from public, anon, authenticated, service_role;
grant select on table public.labor_workers to authenticated;

-- This narrow DML grant is required for server-only projection-maintenance paths that run
-- only after requireSupabaseOwnerOrAdmin. service_role is never browser-visible.
grant select, insert, update, delete on table public.labor_workers to service_role;

-- Worker and projection are one transaction. Any projection failure aborts the
-- Worker INSERT/rename, rather than leaving drift or allowing a retry duplicate.
create or replace function public.hh_sync_worker_to_labor_workers_projection()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.labor_workers (id, name)
  values (new.id, new.name)
  on conflict (id) do update set name = excluded.name
  where public.labor_workers.name is distinct from excluded.name;
  return new;
end;
$$;

revoke all on function public.hh_sync_worker_to_labor_workers_projection()
  from public, anon, authenticated, service_role;

drop trigger if exists hh_sync_worker_to_labor_workers_projection_trigger on public.workers;
create trigger hh_sync_worker_to_labor_workers_projection_trigger
after insert or update of name on public.workers
for each row execute function public.hh_sync_worker_to_labor_workers_projection();

-- Establish one initial consistent projection without deleting history or rows.
insert into public.labor_workers (id, name)
select id, name
from public.workers
on conflict (id) do update set name = excluded.name
where public.labor_workers.name is distinct from excluded.name;

drop policy if exists "dev full access" on public.labor_workers;
drop policy if exists "allow authenticated delete" on public.labor_workers;
drop policy if exists "allow authenticated insert" on public.labor_workers;
drop policy if exists "allow authenticated read" on public.labor_workers;
drop policy if exists "allow authenticated update" on public.labor_workers;
drop policy if exists labor_workers_owner_admin_select on public.labor_workers;

create policy labor_workers_owner_admin_select
on public.labor_workers
for select
to authenticated
using ((select public.is_owner_or_admin()));

commit;
