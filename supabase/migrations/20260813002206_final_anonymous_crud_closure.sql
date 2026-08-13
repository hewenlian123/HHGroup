-- HH Group Final Anonymous CRUD Closure
-- Scope: close direct Data API access only for cost_allocations,
-- material_selections, and material_selection_items. No data is changed.
-- Transaction ownership belongs to the certified operator procedure so this
-- file can run atomically with its migration-ledger record.

do $$
declare
  target_table text;
  unexpected_policy record;
begin
  foreach target_table in array array[
    'cost_allocations',
    'material_selections',
    'material_selection_items'
  ] loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'final anonymous CRUD closure requires public.%', target_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'service_role'
      and rolbypassrls
  ) then
    raise exception 'final anonymous CRUD closure requires server-only service_role with BYPASSRLS';
  end if;

  select policyname, tablename
  into unexpected_policy
  from pg_policies
  where schemaname = 'public'
    and (
      (tablename = 'cost_allocations' and policyname not in (
        'allow authenticated delete',
        'allow authenticated insert',
        'allow authenticated read',
        'allow authenticated update',
        'cost_allocations_delete_all',
        'cost_allocations_insert_all',
        'cost_allocations_select_all',
        'cost_allocations_update_all'
      ))
      or (tablename = 'material_selections' and policyname not in (
        'allow authenticated delete',
        'allow authenticated insert',
        'allow authenticated read',
        'allow authenticated update',
        'material_selections_delete_all',
        'material_selections_insert_all',
        'material_selections_select_all',
        'material_selections_update_all'
      ))
      or (tablename = 'material_selection_items' and policyname not in (
        'material_selection_items_delete_all',
        'material_selection_items_insert_all',
        'material_selection_items_select_all',
        'material_selection_items_update_all'
      ))
    )
  limit 1;

  if found then
    raise exception 'final anonymous CRUD closure found unexpected scoped RLS policy %.%; classify before apply',
      unexpected_policy.tablename,
      unexpected_policy.policyname;
  end if;
end
$$;

-- Cost allocations have no current product call path. Deny every Data API role
-- rather than retaining a speculative service-role exception.
alter table public.cost_allocations enable row level security;
revoke all privileges on table public.cost_allocations
  from public, anon, authenticated, service_role;

drop policy if exists "allow authenticated delete" on public.cost_allocations;
drop policy if exists "allow authenticated insert" on public.cost_allocations;
drop policy if exists "allow authenticated read" on public.cost_allocations;
drop policy if exists "allow authenticated update" on public.cost_allocations;
drop policy if exists "cost_allocations_delete_all" on public.cost_allocations;
drop policy if exists "cost_allocations_insert_all" on public.cost_allocations;
drop policy if exists "cost_allocations_select_all" on public.cost_allocations;
drop policy if exists "cost_allocations_update_all" on public.cost_allocations;

-- Material selections are server-mediated. Authenticated users, including an
-- owner/admin, have no direct table grant; guarded server routes/actions use
-- the server-only service_role client after strict owner/admin authorization.
alter table public.material_selections enable row level security;
revoke all privileges on table public.material_selections
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.material_selections to service_role;

drop policy if exists "allow authenticated delete" on public.material_selections;
drop policy if exists "allow authenticated insert" on public.material_selections;
drop policy if exists "allow authenticated read" on public.material_selections;
drop policy if exists "allow authenticated update" on public.material_selections;
drop policy if exists "material_selections_delete_all" on public.material_selections;
drop policy if exists "material_selections_insert_all" on public.material_selections;
drop policy if exists "material_selections_select_all" on public.material_selections;
drop policy if exists "material_selections_update_all" on public.material_selections;

alter table public.material_selection_items enable row level security;
revoke all privileges on table public.material_selection_items
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.material_selection_items to service_role;

drop policy if exists "material_selection_items_delete_all" on public.material_selection_items;
drop policy if exists "material_selection_items_insert_all" on public.material_selection_items;
drop policy if exists "material_selection_items_select_all" on public.material_selection_items;
drop policy if exists "material_selection_items_update_all" on public.material_selection_items;

notify pgrst, 'reload schema';
