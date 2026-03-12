alter table public.project_change_orders
  add column if not exists number text,
  add column if not exists status text default 'Draft',
  add column if not exists approved_at timestamptz,
  add column if not exists total numeric default 0;
