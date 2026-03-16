-- Customers core module
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  created_at timestamptz default now()
);

alter table public.customers enable row level security;

drop policy if exists customers_select_all on public.customers;
create policy customers_select_all on public.customers
  for select
  to anon
  using (true);

drop policy if exists customers_insert_all on public.customers;
create policy customers_insert_all on public.customers
  for insert
  to anon
  with check (true);

drop policy if exists customers_update_all on public.customers;
create policy customers_update_all on public.customers
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists customers_delete_all on public.customers;
create policy customers_delete_all on public.customers
  for delete
  to anon
  using (true);

-- Link projects to customers
alter table public.projects
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists projects_customer_id_idx
  on public.projects (customer_id);

-- Link estimates to customers
alter table public.estimates
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists estimates_customer_id_idx
  on public.estimates (customer_id);

