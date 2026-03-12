-- Approve change order: transactional RPC.
-- On approve: insert items into project_budget_items, increase projects.budget, set status = 'Approved', approved_at = now().
-- Prevents double approval; rolls back on any failure.

-- Optional: align project_budget_items with budget_amount (use item total as budget_amount)
alter table public.project_budget_items
  add column if not exists budget_amount numeric not null default 0;

-- Backfill budget_amount from total where missing
update public.project_budget_items
set budget_amount = total
where budget_amount = 0 and total is not null;

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
  -- Lock change order row and prevent double approval
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

  -- Insert each change order item into project_budget_items (project_id, cost_code, description, budget_amount / total)
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

  -- Increase projects.budget by change order total
  select coalesce(budget, 0) into v_project_budget
  from public.projects
  where id = v_co.project_id
  for update;

  if not found then
    raise exception 'Project not found: %', v_co.project_id;
  end if;

  update public.projects
  set budget = v_project_budget + coalesce(v_co.total, 0),
      updated_at = current_date
  where id = v_co.project_id;

  -- Set status = 'Approved', approved_at = now()
  update public.project_change_orders
  set status = 'Approved',
      approved_at = now()
  where id = p_change_order_id;
end;
$$;
