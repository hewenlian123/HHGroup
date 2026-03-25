create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text null,
  contact_person text null,
  phone text null,
  email text null,
  address text null,
  notes text null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create or replace function public.set_customers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row
execute function public.set_customers_updated_at();

alter table public.customers enable row level security;

drop policy if exists "customers_select_all" on public.customers;
create policy "customers_select_all"
on public.customers
for select
to anon
using (true);

drop policy if exists "customers_insert_all" on public.customers;
create policy "customers_insert_all"
on public.customers
for insert
to anon
with check (true);

drop policy if exists "customers_update_all" on public.customers;
create policy "customers_update_all"
on public.customers
for update
to anon
using (true)
with check (true);

drop policy if exists "customers_delete_all" on public.customers;
create policy "customers_delete_all"
on public.customers
for delete
to anon
using (true);

