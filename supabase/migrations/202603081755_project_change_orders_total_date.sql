-- Ensure project_change_orders has total and date (used by app and RPC).
-- Safe if columns already exist (e.g. from 202603081700).

alter table public.project_change_orders
  add column if not exists total numeric not null default 0;

alter table public.project_change_orders
  add column if not exists date date default current_date;

update public.project_change_orders
set total = coalesce(total_amount, 0),
    date = coalesce(created_at::date, current_date)
where total = 0 or date is null;
