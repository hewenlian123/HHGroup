-- Change Order schema sync: drop and recreate tables to match production code.
-- Project: rzublljldebswurgdqxp (HH Main Project). No mock, no fallback.

-- 1. Drop dependent table first (references project_change_orders)
drop table if exists public.project_budget_items;

-- 2. Drop change order tables
drop table if exists public.project_change_order_items;
drop table if exists public.project_change_orders;

-- 3. Recreate project_change_orders (production structure)
create table public.project_change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null,
  sequence integer not null default 1,
  status text not null default 'Draft',
  total numeric default 0,
  total_amount numeric default 0,
  date date not null default current_date,
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- 4. Recreate project_change_order_items (production structure)
create table public.project_change_order_items (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.project_change_orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_code text,
  description text,
  qty numeric default 0,
  unit text,
  unit_price numeric default 0,
  total numeric default 0,
  created_at timestamptz default now()
);

-- 5. Indexes
create index idx_co_project on public.project_change_orders(project_id);
create index idx_co_items_co on public.project_change_order_items(change_order_id);

-- 6. RPC: next_change_order_number
create or replace function public.next_change_order_number(p_project_id uuid)
returns text
language plpgsql
as $$
declare
  next_seq integer;
begin
  select coalesce(max(sequence), 0) + 1
  into next_seq
  from public.project_change_orders
  where project_id = p_project_id;

  return 'CO-' || lpad(next_seq::text, 3, '0');
end;
$$;

-- 7. Recreate project_budget_items (required by approve_change_order RPC)
create table public.project_budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  change_order_id uuid not null references public.project_change_orders(id) on delete cascade,
  cost_code text,
  description text,
  qty numeric default 0,
  unit text,
  unit_price numeric default 0,
  total numeric default 0,
  budget_amount numeric default 0
);
create index if not exists project_budget_items_project_id_idx on public.project_budget_items(project_id);

-- 8. RLS and dev full-access policies
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

-- 9. approve_change_order RPC (required for Approve action)
create or replace function public.approve_change_order(p_change_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_co record;
  v_item record;
  v_project_budget numeric;
begin
  select id, project_id, status, total
  into v_co
  from public.project_change_orders
  where id = p_change_order_id
  for update;

  if not found then
    raise exception 'Change order not found: %', p_change_order_id;
  end if;

  if v_co.status = 'Approved' then
    raise exception 'Change order already approved';
  end if;

  for v_item in
    select cost_code, description, total
    from public.project_change_order_items
    where change_order_id = p_change_order_id
  loop
    insert into public.project_budget_items (
      project_id,
      change_order_id,
      cost_code,
      description,
      qty,
      unit,
      unit_price,
      total,
      budget_amount
    )
    values (
      v_co.project_id,
      p_change_order_id,
      coalesce(v_item.cost_code, ''),
      coalesce(v_item.description, ''),
      1,
      'EA',
      coalesce(v_item.total, 0),
      coalesce(v_item.total, 0),
      coalesce(v_item.total, 0)
    );
  end loop;

  select coalesce(budget, 0) into v_project_budget
  from public.projects
  where id = v_co.project_id
  for update;

  if not found then
    raise exception 'Project not found: %', v_co.project_id;
  end if;

  update public.projects
  set budget = v_project_budget + coalesce(v_co.total, 0),
      updated_at = current_timestamp
  where id = v_co.project_id;

  update public.project_change_orders
  set status = 'Approved',
      approved_at = now()
  where id = p_change_order_id;
end;
$$;

-- Verify (run after migration): select column_name from information_schema.columns where table_schema = 'public' and table_name = 'project_change_order_items' order by ordinal_position;
