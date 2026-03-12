-- Phase 9: Labor cost allocation. On labor_entries insert, allocate to projects.spent in same transaction.
-- Allocation:
--   Both AM and PM (different): 50% day_rate to AM, 50% day_rate to PM, ot_amount to AM.
--   Only AM (or same project):  full total (day_rate + ot_amount) to AM.
--   Only PM:                    day_rate to PM; ot_amount ignored.

create or replace function public.allocate_labor_cost_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  am_amt numeric := 0;
  pm_amt numeric := 0;
  v_spent numeric;
begin
  -- Both AM and PM, different projects
  if NEW.project_am_id is not null and NEW.project_pm_id is not null and NEW.project_am_id <> NEW.project_pm_id then
    am_amt := (NEW.day_rate * 0.5) + NEW.ot_amount;
    pm_amt := NEW.day_rate * 0.5;
  -- Only AM, or both same project: full total to AM project
  elsif NEW.project_am_id is not null then
    am_amt := NEW.day_rate + NEW.ot_amount;
  -- Only PM: day_rate only
  elsif NEW.project_pm_id is not null then
    pm_amt := NEW.day_rate;
  end if;

  if am_amt > 0 and NEW.project_am_id is not null then
    select coalesce(spent, 0) into v_spent
    from public.projects
    where id = NEW.project_am_id
    for update;
    if found then
      update public.projects
      set spent = v_spent + am_amt,
          updated_at = current_date
      where id = NEW.project_am_id;
    end if;
  end if;

  if pm_amt > 0 and NEW.project_pm_id is not null then
    select coalesce(spent, 0) into v_spent
    from public.projects
    where id = NEW.project_pm_id
    for update;
    if found then
      update public.projects
      set spent = v_spent + pm_amt,
          updated_at = current_date
      where id = NEW.project_pm_id;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists labor_entries_allocate_cost on public.labor_entries;
create trigger labor_entries_allocate_cost
  after insert on public.labor_entries
  for each row
  execute function public.allocate_labor_cost_on_insert();
