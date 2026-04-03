-- Project commissions and payment records.

create table if not exists public.project_commissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  person_name text not null default '',
  role text not null default 'Other',
  calculation_mode text not null default 'Auto',
  rate numeric not null default 0,
  base_amount numeric not null default 0,
  commission_amount numeric not null default 0,
  status text not null default 'Pending',
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_commissions_project_id on public.project_commissions (project_id);
create index if not exists idx_project_commissions_status on public.project_commissions (status);

alter table public.project_commissions enable row level security;
drop policy if exists project_commissions_select on public.project_commissions;
create policy project_commissions_select on public.project_commissions for select to anon using (true);
drop policy if exists project_commissions_insert on public.project_commissions;
create policy project_commissions_insert on public.project_commissions for insert to anon with check (true);
drop policy if exists project_commissions_update on public.project_commissions;
create policy project_commissions_update on public.project_commissions for update to anon using (true) with check (true);
drop policy if exists project_commissions_delete on public.project_commissions;
create policy project_commissions_delete on public.project_commissions for delete to anon using (true);

create table if not exists public.commission_payment_records (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.project_commissions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  person_name text not null default '',
  amount numeric not null default 0,
  payment_date date not null,
  payment_method text not null default 'Other',
  reference_no text null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_commission_payment_records_commission_id on public.commission_payment_records (commission_id);
create index if not exists idx_commission_payment_records_project_id on public.commission_payment_records (project_id);
create index if not exists idx_commission_payment_records_payment_date on public.commission_payment_records (payment_date);

alter table public.commission_payment_records enable row level security;
drop policy if exists commission_payment_records_select on public.commission_payment_records;
create policy commission_payment_records_select on public.commission_payment_records for select to anon using (true);
drop policy if exists commission_payment_records_insert on public.commission_payment_records;
create policy commission_payment_records_insert on public.commission_payment_records for insert to anon with check (true);
drop policy if exists commission_payment_records_update on public.commission_payment_records;
create policy commission_payment_records_update on public.commission_payment_records for update to anon using (true) with check (true);
drop policy if exists commission_payment_records_delete on public.commission_payment_records;
create policy commission_payment_records_delete on public.commission_payment_records for delete to anon using (true);
