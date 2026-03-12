-- Phase 9.2: Reallocate labor cost on update. Reverse old allocation, then apply new. Single transaction.

create or replace function public.reallocate_labor_cost(
  p_entry_id uuid,
  p_old_project_am_id uuid,
  p_old_project_pm_id uuid,
  p_old_day_rate numeric,
  p_old_ot_amount numeric
)
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
  old_am numeric := 0;
  old_pm numeric := 0;
begin
  -- 1) Compute old allocation and reverse from projects.spent
  if p_old_project_am_id is not null and p_old_project_pm_id is not null and p_old_project_am_id <> p_old_project_pm_id then
    old_am := (p_old_day_rate * 0.5) + p_old_ot_amount;
    old_pm := p_old_day_rate * 0.5;
  elsif p_old_project_am_id is not null then
    old_am := p_old_day_rate + p_old_ot_amount;
  elsif p_old_project_pm_id is not null then
    old_pm := p_old_day_rate;
  end if;

  if old_am > 0 and p_old_project_am_id is not null then
    select coalesce(spent, 0) into v_spent from public.projects where id = p_old_project_am_id for update;
    if found then
      update public.projects set spent = v_spent - old_am, updated_at = current_date where id = p_old_project_am_id;
    end if;
  end if;

  if old_pm > 0 and p_old_project_pm_id is not null then
    select coalesce(spent, 0) into v_spent from public.projects where id = p_old_project_pm_id for update;
    if found then
      update public.projects set spent = v_spent - old_pm, updated_at = current_date where id = p_old_project_pm_id;
    end if;
  end if;

  -- 2) Fetch current row (new values after update) and apply new allocation
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
      update public.projects set spent = v_spent + am_amt, updated_at = current_date where id = r.project_am_id;
    end if;
  end if;

  if pm_amt > 0 and r.project_pm_id is not null then
    select coalesce(spent, 0) into v_spent from public.projects where id = r.project_pm_id for update;
    if found then
      update public.projects set spent = v_spent + pm_amt, updated_at = current_date where id = r.project_pm_id;
    end if;
  end if;
end;
$$;
