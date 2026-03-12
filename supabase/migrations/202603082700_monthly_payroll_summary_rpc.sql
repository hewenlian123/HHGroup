-- Phase 12: Monthly payroll summary. labor_entries for a month grouped by worker.

create or replace function public.get_monthly_payroll_summary(p_year int, p_month int)
returns table (
  worker_id uuid,
  worker_name text,
  gross numeric,
  ot numeric,
  total numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.worker_id,
    w.name as worker_name,
    coalesce(sum(e.day_rate), 0) as gross,
    coalesce(sum(e.ot_amount), 0) as ot,
    coalesce(sum(e.total), 0) as total
  from public.labor_entries e
  join public.labor_workers w on w.id = e.worker_id
  where extract(year from e.work_date) = p_year
    and extract(month from e.work_date) = p_month
  group by e.worker_id, w.name
  order by w.name;
$$;
