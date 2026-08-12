-- Production access repair for projects and Change Orders.
-- The public Worker Receipt intake retains its exact, column-limited active
-- project option contract: anon may select only projects.id and projects.name.

do $$
declare
  target_table text;
  target_policy record;
  required_column text;
  target_tables text[] := array[
    'projects',
    'project_change_orders',
    'project_change_order_items'
  ];
begin
  if to_regprocedure('public.is_owner_or_admin()') is null then
    raise exception 'project/change-order access repair requires public.is_owner_or_admin()';
  end if;

  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'project/change-order access repair requires public.%', target_table;
    end if;

    if not (
      select relrowsecurity
      from pg_class
      where oid = format('public.%I', target_table)::regclass
    ) then
      raise exception 'project/change-order access repair requires RLS on public.%', target_table;
    end if;
  end loop;

  foreach required_column in array array['id', 'name', 'status'] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'projects'
        and column_name = required_column
    ) then
      raise exception 'project/change-order access repair requires public.projects.%', required_column;
    end if;
  end loop;

  foreach target_table in array target_tables loop
    execute format('revoke all privileges on table public.%I from public', target_table);
    execute format('revoke all privileges on table public.%I from anon', target_table);
    execute format('revoke all privileges on table public.%I from authenticated', target_table);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      target_table
    );
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      target_table
    );

    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and roles && array['anon', 'authenticated', 'public']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', target_policy.policyname, target_table);
    end loop;

    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_owner_or_admin())) with check ((select public.is_owner_or_admin()))',
      'project_change_order_owner_admin_' || target_table,
      target_table
    );
  end loop;
end
$$;

-- Re-establish the receipt bridge's narrow column grant only after the broader
-- anonymous grants and policies have been removed.
grant select (id, name) on table public.projects to anon;

create policy worker_receipt_options_projects_anon_select
on public.projects
for select
to anon
using (
  lower(btrim(coalesce(status, ''))) = 'active'
  and btrim(coalesce(name, '')) <> ''
);

notify pgrst, 'reload schema';
