-- Change Orders: project_change_orders, project_change_order_items, project_budget_items
-- Requires: public.projects(id) exists (uuid)

create extension if not exists pgcrypto;

-- Per-project sequence for CO numbers (CO-001, CO-002, ...)
create or replace function public.next_change_order_number(p_project_id uuid)
returns text
language plpgsql
as $$
declare
  next_val int;
begin
  select coalesce(max(
    case
      when number ~ '^CO-[0-9]+$' then nullif(regexp_replace(number, '^CO-0*', ''), '')::int
      else 0
    end
  ), 0) + 1 into next_val
  from public.project_change_orders
  where project_id = p_project_id;
  return 'CO-' || lpad(next_val::text, 3, '0');
end;
$$;

create table if not exists public.project_change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  status text not null default 'Draft' check (status in ('Draft', 'Submitted', 'Approved')),
  total numeric not null default 0,
  date date not null default current_date,
  approved_at date null,
  created_at timestamptz not null default now()
);

create unique index if not exists project_change_orders_project_number_key
  on public.project_change_orders (project_id, number);
create index if not exists project_change_orders_project_id_idx on public.project_change_orders (project_id);

create table if not exists public.project_change_order_items (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.project_change_orders(id) on delete cascade,
  cost_code text not null default '',
  description text not null default '',
  qty numeric not null default 1,
  unit text not null default 'EA',
  unit_price numeric not null default 0,
  total numeric not null default 0
);

create index if not exists project_change_order_items_change_order_id_idx
  on public.project_change_order_items (change_order_id);

create table if not exists public.project_budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  change_order_id uuid not null references public.project_change_orders(id) on delete cascade,
  cost_code text not null default '',
  description text not null default '',
  qty numeric not null default 1,
  unit text not null default 'EA',
  unit_price numeric not null default 0,
  total numeric not null default 0
);

create index if not exists project_budget_items_project_id_idx on public.project_budget_items (project_id);

-- RLS
alter table public.project_change_orders enable row level security;
alter table public.project_change_order_items enable row level security;
alter table public.project_budget_items enable row level security;

drop policy if exists project_change_orders_select_all on public.project_change_orders;
create policy project_change_orders_select_all on public.project_change_orders for select to anon using (true);
drop policy if exists project_change_orders_insert_all on public.project_change_orders;
create policy project_change_orders_insert_all on public.project_change_orders for insert to anon with check (true);
drop policy if exists project_change_orders_update_all on public.project_change_orders;
create policy project_change_orders_update_all on public.project_change_orders for update to anon using (true) with check (true);
drop policy if exists project_change_orders_delete_all on public.project_change_orders;
create policy project_change_orders_delete_all on public.project_change_orders for delete to anon using (true);

drop policy if exists project_change_order_items_select_all on public.project_change_order_items;
create policy project_change_order_items_select_all on public.project_change_order_items for select to anon using (true);
drop policy if exists project_change_order_items_insert_all on public.project_change_order_items;
create policy project_change_order_items_insert_all on public.project_change_order_items for insert to anon with check (true);
drop policy if exists project_change_order_items_update_all on public.project_change_order_items;
create policy project_change_order_items_update_all on public.project_change_order_items for update to anon using (true) with check (true);
drop policy if exists project_change_order_items_delete_all on public.project_change_order_items;
create policy project_change_order_items_delete_all on public.project_change_order_items for delete to anon using (true);

drop policy if exists project_budget_items_select_all on public.project_budget_items;
create policy project_budget_items_select_all on public.project_budget_items for select to anon using (true);
drop policy if exists project_budget_items_insert_all on public.project_budget_items;
create policy project_budget_items_insert_all on public.project_budget_items for insert to anon with check (true);
drop policy if exists project_budget_items_update_all on public.project_budget_items;
create policy project_budget_items_update_all on public.project_budget_items for update to anon using (true) with check (true);
drop policy if exists project_budget_items_delete_all on public.project_budget_items;
create policy project_budget_items_delete_all on public.project_budget_items for delete to anon using (true);
