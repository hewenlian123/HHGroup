alter table public.project_change_orders
  add column if not exists sequence integer;
