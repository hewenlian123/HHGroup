-- Phase 11: Project labor breakdown. Aggregate labor_entries by worker for a project (AM or PM).
-- Allocation rules match allocate_labor_cost: same logic for amount allocated to this project per entry.

create or replace function public.get_project_labor_breakdown(p_project_id uuid)
returns table (
  worker_id uuid,
  worker_name text,
  days bigint,
  total_ot numeric,
  total_labor_cost numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with entries as (
    select
      e.id,
      e.worker_id,
      w.name as worker_name,
      e.day_rate,
      e.ot_amount,
      e.project_am_id,
      e.project_pm_id,
      case
        when e.project_am_id = p_project_id and e.project_pm_id = p_project_id then e.day_rate + e.ot_amount
        when e.project_am_id = p_project_id and e.project_pm_id is not null and e.project_pm_id <> p_project_id then (e.day_rate * 0.5) + e.ot_amount
        when e.project_am_id = p_project_id then e.day_rate + e.ot_amount
        when e.project_pm_id = p_project_id and e.project_am_id is not null and e.project_am_id <> p_project_id then e.day_rate * 0.5
        when e.project_pm_id = p_project_id then e.day_rate
        else 0
      end as allocated
    from public.labor_entries e
    join public.labor_workers w on w.id = e.worker_id
    where e.project_am_id = p_project_id or e.project_pm_id = p_project_id
  )
  select
    entries.worker_id,
    entries.worker_name,
    count(*)::bigint as days,
    coalesce(sum(entries.ot_amount), 0) as total_ot,
    coalesce(sum(entries.allocated), 0) as total_labor_cost
  from entries
  group by entries.worker_id, entries.worker_name
  order by entries.worker_name;
$$;
