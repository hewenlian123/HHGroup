-- Change Order management: new fields, status flow (Draft → Pending Approval → Approved | Rejected), attachments.
-- Only Approved change orders affect revenue (canonical profit model uses amount or total).

-- 1. Add columns to project_change_orders
alter table public.project_change_orders
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists amount numeric,
  add column if not exists cost_impact numeric,
  add column if not exists schedule_impact_days integer,
  add column if not exists approved_by text;

-- 2. Expand status allowed values (keep 'Submitted' for backward compatibility; treat as Pending Approval in app)
alter table public.project_change_orders
  drop constraint if exists project_change_orders_status_check;
alter table public.project_change_orders
  add constraint project_change_orders_status_check
  check (status in ('Draft', 'Submitted', 'Pending Approval', 'Approved', 'Rejected'));

-- 3. Attachments table (metadata; file stored in Supabase Storage or URL in storage_path)
create table if not exists public.project_change_order_attachments (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.project_change_orders(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_change_order_attachments_change_order_id_idx
  on public.project_change_order_attachments(change_order_id);

alter table public.project_change_order_attachments enable row level security;
drop policy if exists project_change_order_attachments_select_all on public.project_change_order_attachments;
create policy project_change_order_attachments_select_all on public.project_change_order_attachments for select to anon using (true);
drop policy if exists project_change_order_attachments_insert_all on public.project_change_order_attachments;
create policy project_change_order_attachments_insert_all on public.project_change_order_attachments for insert to anon with check (true);
drop policy if exists project_change_order_attachments_update_all on public.project_change_order_attachments;
create policy project_change_order_attachments_update_all on public.project_change_order_attachments for update to anon using (true) with check (true);
drop policy if exists project_change_order_attachments_delete_all on public.project_change_order_attachments;
create policy project_change_order_attachments_delete_all on public.project_change_order_attachments for delete to anon using (true);

-- 4. Update approve_change_order RPC: use coalesce(amount, total) for revenue impact; set approved_by
create or replace function public.approve_change_order(p_change_order_id uuid, p_approved_by text default null)
returns void
language plpgsql
security definer
as $$
declare
  v_co record;
  v_item record;
  v_project_budget numeric;
  v_revenue_delta numeric;
begin
  select id, project_id, status, total, amount
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

  v_revenue_delta := coalesce(v_co.amount, v_co.total, 0);

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
  set budget = v_project_budget + v_revenue_delta,
      updated_at = current_timestamp
  where id = v_co.project_id;

  update public.project_change_orders
  set status = 'Approved',
      approved_at = now(),
      approved_by = p_approved_by
  where id = p_change_order_id;
end;
$$;
