alter table public.project_change_order_items
  add column if not exists description text,
  add column if not exists qty numeric default 0,
  add column if not exists unit text,
  add column if not exists unit_price numeric default 0,
  add column if not exists total numeric default 0,
  add column if not exists cost_code text;
