-- Production expense engine: single RPC creates expense + lines and updates project.spent atomically.
-- Ensure columns exist then create RPC.

alter table public.expenses add column if not exists total numeric not null default 0;
alter table public.expenses add column if not exists line_count integer not null default 0;

alter table public.expense_lines add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.expense_lines add column if not exists category text default 'Other';
alter table public.expense_lines add column if not exists memo text;
alter table public.expense_lines add column if not exists amount numeric default 0;

create or replace function public.create_expense_with_lines(
  p_project_id uuid,
  p_vendor text default '',
  p_category text default 'Other',
  p_expense_date date default current_date,
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_expense_id uuid;
  v_line jsonb;
  v_total numeric := 0;
  v_amount numeric;
  v_line_amount numeric;
  v_count integer := 0;
  v_project_spent numeric;
begin
  -- Insert expense header (use vendor column; total/line_count set after lines)
  insert into public.expenses (
    project_id,
    vendor,
    expense_date,
    notes,
    total,
    line_count
  )
  values (
    p_project_id,
    coalesce(trim(p_vendor), ''),
    coalesce(p_expense_date, current_date),
    nullif(trim(p_notes), ''),
    0,
    0
  )
  returning id into v_expense_id;

  if v_expense_id is null then
    raise exception 'Failed to insert expense';
  end if;

  -- Insert lines and sum total
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_amount := coalesce((v_line->>'amount')::numeric,
      coalesce((v_line->>'qty')::numeric, 1) * coalesce((v_line->>'unit_cost')::numeric, 0));
    v_amount := v_line_amount;

    insert into public.expense_lines (
      expense_id,
      project_id,
      category,
      description,
      qty,
      unit_cost,
      cost_code,
      memo,
      amount,
      total
    )
    values (
      v_expense_id,
      p_project_id,
      coalesce(nullif(trim(p_category), ''), 'Other'),
      nullif(trim(v_line->>'description'), ''),
      coalesce((v_line->>'qty')::numeric, 1),
      coalesce((v_line->>'unit_cost')::numeric, 0),
      nullif(trim(v_line->>'cost_code'), ''),
      nullif(trim(v_line->>'memo'), ''),
      v_amount,
      v_amount
    );

    v_total := v_total + v_amount;
    v_count := v_count + 1;
  end loop;

  -- If no lines, insert one zero line
  if v_count = 0 then
    insert into public.expense_lines (expense_id, project_id, category, amount, total)
    values (v_expense_id, p_project_id, coalesce(p_category, 'Other'), 0, 0);
    v_count := 1;
  end if;

  -- Update expense total and line_count
  update public.expenses
  set total = v_total,
      line_count = v_count
  where id = v_expense_id;

  -- Update project.spent (FOR UPDATE to lock row)
  if p_project_id is not null then
    select coalesce(spent, 0) into v_project_spent
    from public.projects
    where id = p_project_id
    for update;

    if found then
      update public.projects
      set spent = v_project_spent + v_total,
          updated_at = current_date
      where id = p_project_id;
    end if;
  end if;

  return v_expense_id;
end;
$$;
