-- estimate_categories: per-estimate display names for cost codes (persisted in dedicated table)
create table if not exists public.estimate_categories (
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  cost_code text not null,
  display_name text not null default '',
  primary key (estimate_id, cost_code)
);

create index if not exists estimate_categories_estimate_id_idx on public.estimate_categories (estimate_id);

alter table public.estimate_categories enable row level security;

drop policy if exists estimate_categories_select_all on public.estimate_categories;
create policy estimate_categories_select_all on public.estimate_categories for select to anon using (true);
drop policy if exists estimate_categories_insert_all on public.estimate_categories;
create policy estimate_categories_insert_all on public.estimate_categories for insert to anon with check (true);
drop policy if exists estimate_categories_update_all on public.estimate_categories;
create policy estimate_categories_update_all on public.estimate_categories for update to anon using (true) with check (true);
drop policy if exists estimate_categories_delete_all on public.estimate_categories;
create policy estimate_categories_delete_all on public.estimate_categories for delete to anon using (true);
