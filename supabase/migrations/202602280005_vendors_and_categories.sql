-- Vendors + Categories management tables
-- Dev mode policies: open to anon for now.

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  contact_name text null,
  phone text null,
  email text null,
  address text null,
  notes text null,
  status text not null default 'active',
  constraint vendors_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  type text not null default 'expense',
  status text not null default 'active',
  description text null,
  constraint categories_status_check check (status in ('active', 'inactive')),
  constraint categories_type_check check (type in ('expense', 'income', 'other'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vendors_updated_at on public.vendors;
create trigger trg_vendors_updated_at
before update on public.vendors
for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- Ensure bills foreign keys exist now that vendors/categories are present
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'bills'
      and constraint_name = 'bills_vendor_id_fkey'
  ) then
    alter table public.bills
    add constraint bills_vendor_id_fkey
    foreign key (vendor_id) references public.vendors(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'bills'
      and constraint_name = 'bills_category_id_fkey'
  ) then
    alter table public.bills
    add constraint bills_category_id_fkey
    foreign key (category_id) references public.categories(id) on delete set null;
  end if;
end $$;

alter table public.vendors enable row level security;
alter table public.categories enable row level security;

drop policy if exists vendors_select_all on public.vendors;
create policy vendors_select_all on public.vendors for select to anon using (true);
drop policy if exists vendors_insert_all on public.vendors;
create policy vendors_insert_all on public.vendors for insert to anon with check (true);
drop policy if exists vendors_update_all on public.vendors;
create policy vendors_update_all on public.vendors for update to anon using (true) with check (true);
drop policy if exists vendors_delete_all on public.vendors;
create policy vendors_delete_all on public.vendors for delete to anon using (true);

drop policy if exists categories_select_all on public.categories;
create policy categories_select_all on public.categories for select to anon using (true);
drop policy if exists categories_insert_all on public.categories;
create policy categories_insert_all on public.categories for insert to anon with check (true);
drop policy if exists categories_update_all on public.categories;
create policy categories_update_all on public.categories for update to anon using (true) with check (true);
drop policy if exists categories_delete_all on public.categories;
create policy categories_delete_all on public.categories for delete to anon using (true);
