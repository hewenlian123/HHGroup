-- HH Group Final Anonymous CRUD Closure rollback
-- Operator-only emergency compatibility rollback. It restores the immediately
-- prior vulnerable grants/policies only after explicit confirmation. Review the
-- resulting state and choose COMMIT or ROLLBACK manually; this file never commits.

begin;

do $$
declare
  target_table text;
begin
  if current_setting('hh.rollback_confirmation', true)
       is distinct from 'FINAL_ANONYMOUS_CRUD_CLOSURE_20260813002206' then
    raise exception 'set hh.rollback_confirmation to FINAL_ANONYMOUS_CRUD_CLOSURE_20260813002206 before rollback';
  end if;

  foreach target_table in array array[
    'cost_allocations',
    'material_selections',
    'material_selection_items'
  ] loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'rollback requires public.%', target_table;
    end if;
  end loop;
end
$$;

alter table public.cost_allocations enable row level security;
revoke all privileges on table public.cost_allocations
  from public, anon, authenticated, service_role;
grant all privileges on table public.cost_allocations to anon, authenticated, service_role;

create policy "allow authenticated delete"
on public.cost_allocations
for delete to authenticated
using (true);

create policy "allow authenticated insert"
on public.cost_allocations
for insert to authenticated
with check (true);

create policy "allow authenticated read"
on public.cost_allocations
for select to authenticated
using (true);

create policy "allow authenticated update"
on public.cost_allocations
for update to authenticated
using (true);

create policy "cost_allocations_delete_all"
on public.cost_allocations
for delete to anon
using (true);

create policy "cost_allocations_insert_all"
on public.cost_allocations
for insert to anon
with check (true);

create policy "cost_allocations_select_all"
on public.cost_allocations
for select to anon
using (true);

create policy "cost_allocations_update_all"
on public.cost_allocations
for update to anon
using (true)
with check (true);

alter table public.material_selections enable row level security;
revoke all privileges on table public.material_selections
  from public, anon, authenticated, service_role;
grant all privileges on table public.material_selections to anon, authenticated, service_role;

create policy "allow authenticated delete"
on public.material_selections
for delete to authenticated
using (true);

create policy "allow authenticated insert"
on public.material_selections
for insert to authenticated
with check (true);

create policy "allow authenticated read"
on public.material_selections
for select to authenticated
using (true);

create policy "allow authenticated update"
on public.material_selections
for update to authenticated
using (true);

create policy "material_selections_delete_all"
on public.material_selections
for delete to anon, authenticated
using (true);

create policy "material_selections_insert_all"
on public.material_selections
for insert to anon, authenticated
with check (true);

create policy "material_selections_select_all"
on public.material_selections
for select to anon, authenticated
using (true);

create policy "material_selections_update_all"
on public.material_selections
for update to anon, authenticated
using (true)
with check (true);

alter table public.material_selection_items enable row level security;
revoke all privileges on table public.material_selection_items
  from public, anon, authenticated, service_role;
grant all privileges on table public.material_selection_items to anon, authenticated, service_role;

create policy "material_selection_items_delete_all"
on public.material_selection_items
for delete to anon, authenticated
using (true);

create policy "material_selection_items_insert_all"
on public.material_selection_items
for insert to anon, authenticated
with check (true);

create policy "material_selection_items_select_all"
on public.material_selection_items
for select to anon, authenticated
using (true);

create policy "material_selection_items_update_all"
on public.material_selection_items
for update to anon, authenticated
using (true)
with check (true);

notify pgrst, 'reload schema';

-- Operator reviews verification output, then explicitly chooses COMMIT or ROLLBACK.
