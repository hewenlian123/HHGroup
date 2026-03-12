-- Phase 9.3: Reverse labor cost on delete. Call before deleting a labor_entry to subtract allocated amounts from projects.spent.

create or replace function public.reverse_labor_cost(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  am_amt numeric := 0;
  pm_amt numeric := 0;
  v_spent numeric;
begin
  select id, project_am_id, project_pm_id, day_rate, ot_amount
  into r
  from public.labor_entries
  where id = p_entry_id;

  if not found then
    return;
  end if;

  if r.project_am_id is not null and r.project_pm_id is not null and r.project_am_id <> r.project_pm_id then
    am_amt := (r.day_rate * 0.5) + r.ot_amount;
    pm_amt := r.day_rate * 0.5;
  elsif r.project_am_id is not null then
    am_amt := r.day_rate + r.ot_amount;
  elsif r.project_pm_id is not null then
    pm_amt := r.day_rate;
  end if;

  if am_amt > 0 and r.project_am_id is not null then
    select coalesce(spent, 0) into v_spent from public.projects where id = r.project_am_id for update;
    if found then
      update public.projects set spent = v_spent - am_amt, updated_at = current_date where id = r.project_am_id;
    end if;
  end if;

  if pm_amt > 0 and r.project_pm_id is not null then
    select coalesce(spent, 0) into v_spent from public.projects where id = r.project_pm_id for update;
    if found then
      update public.projects set spent = v_spent - pm_amt, updated_at = current_date where id = r.project_pm_id;
    end if;
  end if;
end;
$$;
