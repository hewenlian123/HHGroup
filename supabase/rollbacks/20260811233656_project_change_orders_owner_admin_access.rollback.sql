-- Manual emergency rollback for 20260811233656_project_change_orders_owner_admin_access.sql.
--
-- It restores authenticated application access while keeping the Receipt
-- Security contract intact: anonymous callers have only active, named
-- projects(id,name), never project/change-order table access.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  target_table text;
  target_tables text[] := array['projects', 'project_change_orders', 'project_change_order_items'];
begin
  if current_setting('hh.rollback_confirmation', true)
       is distinct from 'ROLLBACK_PROJECT_CHANGE_ORDERS_OWNER_ADMIN_ACCESS_20260811233656' then
    raise exception 'set hh.rollback_confirmation before running this rollback';
  end if;

  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null
       or not (select relrowsecurity from pg_class where oid = format('public.%I', target_table)::regclass) then
      raise exception 'project/change-order rollback requires RLS-protected public.%', target_table;
    end if;
  end loop;

  if (select array_agg(policyname::text order by policyname)
      from pg_policies
      where schemaname = 'public' and tablename = 'projects')
     is distinct from array[
       'project_change_order_owner_admin_projects',
       'worker_receipt_options_projects_anon_select'
     ] then
    raise exception 'project/change-order rollback stopped: projects policy fingerprint differs';
  end if;

  if has_table_privilege('anon', 'public.projects', 'select')
     or not has_column_privilege('anon', 'public.projects', 'id', 'select')
     or not has_column_privilege('anon', 'public.projects', 'name', 'select') then
    raise exception 'project/change-order rollback stopped: receipt project option grants differ';
  end if;
end
$$;

do $$
declare
  target_table text;
  target_policy record;
  target_tables text[] := array['projects', 'project_change_orders', 'project_change_order_items'];
begin
  foreach target_table in array target_tables loop
    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and roles && array['anon', 'authenticated', 'public']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', target_policy.policyname, target_table);
    end loop;

    execute format('revoke all privileges on table public.%I from public', target_table);
    execute format('revoke all privileges on table public.%I from anon', target_table);
    execute format('revoke all privileges on table public.%I from authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'project_change_order_authenticated_emergency_' || target_table,
      target_table
    );
  end loop;
end
$$;

grant select (id, name) on table public.projects to anon;

create policy worker_receipt_options_projects_anon_select
on public.projects
for select
to anon
using (
  lower(btrim(coalesce(status, ''))) = 'active'
  and btrim(coalesce(name, '')) <> ''
);

do $$
begin
  if has_table_privilege('anon', 'public.projects', 'select')
     or has_table_privilege('anon', 'public.project_change_orders', 'select')
     or has_table_privilege('anon', 'public.project_change_order_items', 'select') then
    raise exception 'project/change-order rollback must not restore anonymous table access';
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Intentionally no COMMIT. Inspect the authenticated-only policy fingerprint,
-- then explicitly COMMIT to retain this emergency rollback or ROLLBACK it.
