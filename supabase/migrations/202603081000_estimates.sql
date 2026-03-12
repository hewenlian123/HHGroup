-- Estimates module: estimates, estimate_meta, estimate_items, estimate_snapshots
create extension if not exists pgcrypto;

create sequence if not exists public.estimate_number_seq start 1;

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at date not null default current_date,
  number text not null,
  client text not null default '',
  project text not null default '',
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Approved', 'Rejected', 'Converted')),
  approved_at date null
);

create unique index if not exists estimates_number_key on public.estimates (number);

create table if not exists public.estimate_meta (
  estimate_id uuid primary key references public.estimates(id) on delete cascade,
  client_name text not null default '',
  client_phone text not null default '',
  client_email text not null default '',
  client_address text not null default '',
  project_name text not null default '',
  project_site_address text not null default '',
  cost_category_names jsonb not null default '{}',
  tax numeric not null default 0,
  discount numeric not null default 0,
  overhead_pct numeric not null default 0.05,
  profit_pct numeric not null default 0.1,
  estimate_date date null,
  valid_until date null,
  notes text null
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  cost_code text not null default '',
  "desc" text not null default '',
  qty numeric not null default 1,
  unit text not null default 'EA',
  unit_cost numeric not null default 0,
  markup_pct numeric not null default 0.1
);

create index if not exists estimate_items_estimate_id_idx on public.estimate_items (estimate_id);

create table if not exists public.estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  version int not null,
  created_at date not null default current_date,
  status_at_snapshot text not null default 'Approved' check (status_at_snapshot in ('Approved', 'Converted')),
  frozen_payload jsonb not null
);

create unique index if not exists estimate_snapshots_estimate_version_key on public.estimate_snapshots (estimate_id, version);

create or replace function public.next_estimate_number()
returns text
language plpgsql
as $$
declare
  next_val int;
begin
  next_val := nextval('public.estimate_number_seq');
  return 'EST-' || lpad(next_val::text, 4, '0');
end;
$$;

create or replace function public.set_estimates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = current_date;
  return new;
end;
$$;

drop trigger if exists trg_estimates_updated_at on public.estimates;
create trigger trg_estimates_updated_at
  before update on public.estimates
  for each row execute function public.set_estimates_updated_at();

alter table public.estimates enable row level security;
alter table public.estimate_meta enable row level security;
alter table public.estimate_items enable row level security;
alter table public.estimate_snapshots enable row level security;

drop policy if exists estimates_select_all on public.estimates;
create policy estimates_select_all on public.estimates for select to anon using (true);
drop policy if exists estimates_insert_all on public.estimates;
create policy estimates_insert_all on public.estimates for insert to anon with check (true);
drop policy if exists estimates_update_all on public.estimates;
create policy estimates_update_all on public.estimates for update to anon using (true) with check (true);
drop policy if exists estimates_delete_all on public.estimates;
create policy estimates_delete_all on public.estimates for delete to anon using (true);

drop policy if exists estimate_meta_select_all on public.estimate_meta;
create policy estimate_meta_select_all on public.estimate_meta for select to anon using (true);
drop policy if exists estimate_meta_insert_all on public.estimate_meta;
create policy estimate_meta_insert_all on public.estimate_meta for insert to anon with check (true);
drop policy if exists estimate_meta_update_all on public.estimate_meta;
create policy estimate_meta_update_all on public.estimate_meta for update to anon using (true) with check (true);
drop policy if exists estimate_meta_delete_all on public.estimate_meta;
create policy estimate_meta_delete_all on public.estimate_meta for delete to anon using (true);

drop policy if exists estimate_items_select_all on public.estimate_items;
create policy estimate_items_select_all on public.estimate_items for select to anon using (true);
drop policy if exists estimate_items_insert_all on public.estimate_items;
create policy estimate_items_insert_all on public.estimate_items for insert to anon with check (true);
drop policy if exists estimate_items_update_all on public.estimate_items;
create policy estimate_items_update_all on public.estimate_items for update to anon using (true) with check (true);
drop policy if exists estimate_items_delete_all on public.estimate_items;
create policy estimate_items_delete_all on public.estimate_items for delete to anon using (true);

drop policy if exists estimate_snapshots_select_all on public.estimate_snapshots;
create policy estimate_snapshots_select_all on public.estimate_snapshots for select to anon using (true);
drop policy if exists estimate_snapshots_insert_all on public.estimate_snapshots;
create policy estimate_snapshots_insert_all on public.estimate_snapshots for insert to anon with check (true);
drop policy if exists estimate_snapshots_update_all on public.estimate_snapshots;
create policy estimate_snapshots_update_all on public.estimate_snapshots for update to anon using (true) with check (true);
drop policy if exists estimate_snapshots_delete_all on public.estimate_snapshots;
create policy estimate_snapshots_delete_all on public.estimate_snapshots for delete to anon using (true);
