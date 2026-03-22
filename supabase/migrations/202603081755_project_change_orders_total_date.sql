-- Ensure project_change_orders has total and date (used by app and RPC).
-- Safe if columns already exist (e.g. from 202603081700).

alter table public.project_change_orders
  add column if not exists total numeric not null default 0;

alter table public.project_change_orders
  add column if not exists date date default current_date;

-- Backfill date; `total_amount` only existed on some legacy DBs (not created by 202603081700).
update public.project_change_orders
set date = coalesce(date, created_at::date, current_date)
where date is null;

do $migration$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'project_change_orders'
      and c.column_name = 'total_amount'
  ) then
    execute $u$
      update public.project_change_orders
      set total = coalesce(total_amount, total, 0)
      where total = 0
    $u$;
  end if;
end $migration$;
