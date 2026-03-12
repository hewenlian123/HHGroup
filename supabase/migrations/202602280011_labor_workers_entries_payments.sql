-- Workers + Labor entries + Labor payments (Supabase-only)
create extension if not exists pgcrypto;

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  role text null,
  phone text null,
  half_day_rate numeric not null default 0,
  status text not null default 'active',
  notes text null,
  constraint workers_status_check check (status in ('active', 'inactive'))
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

drop trigger if exists trg_workers_updated_at on public.workers;
create trigger trg_workers_updated_at
before update on public.workers
for each row execute function public.set_updated_at();

-- projects(id) must exist (referenced by other migrations)
create table if not exists public.labor_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  entry_date date not null,
  worker_id uuid not null references public.workers(id) on delete cascade,
  am_worked boolean not null default false,
  am_project_id uuid null,
  pm_worked boolean not null default false,
  pm_project_id uuid null,
  ot_amount numeric not null default 0,
  ot_project_id uuid null,
  total numeric not null default 0,
  status text not null default 'draft',
  reviewed_at timestamptz null,
  checklist jsonb not null default '{"verifiedWorker":false,"verifiedProjects":false,"verifiedAmount":false}'::jsonb,
  constraint labor_entries_status_check check (status in ('draft', 'confirmed'))
);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'projects') then
    if not exists (select 1 from information_schema.table_constraints where table_schema = 'public' and table_name = 'labor_entries' and constraint_name = 'labor_entries_am_project_id_fkey') then
      alter table public.labor_entries add constraint labor_entries_am_project_id_fkey foreign key (am_project_id) references public.projects(id) on delete set null;
    end if;
    if not exists (select 1 from information_schema.table_constraints where table_schema = 'public' and table_name = 'labor_entries' and constraint_name = 'labor_entries_pm_project_id_fkey') then
      alter table public.labor_entries add constraint labor_entries_pm_project_id_fkey foreign key (pm_project_id) references public.projects(id) on delete set null;
    end if;
    if not exists (select 1 from information_schema.table_constraints where table_schema = 'public' and table_name = 'labor_entries' and constraint_name = 'labor_entries_ot_project_id_fkey') then
      alter table public.labor_entries add constraint labor_entries_ot_project_id_fkey foreign key (ot_project_id) references public.projects(id) on delete set null;
    end if;
  end if;
end $$;

drop trigger if exists trg_labor_entries_updated_at on public.labor_entries;
create trigger trg_labor_entries_updated_at
before update on public.labor_entries
for each row execute function public.set_updated_at();

create table if not exists public.labor_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric not null default 0,
  method text null,
  memo text null,
  applied_start_date date null,
  applied_end_date date null
);

-- RLS
alter table public.workers enable row level security;
alter table public.labor_entries enable row level security;
alter table public.labor_payments enable row level security;

drop policy if exists workers_select_all on public.workers;
create policy workers_select_all on public.workers for select to anon using (true);
drop policy if exists workers_insert_all on public.workers;
create policy workers_insert_all on public.workers for insert to anon with check (true);
drop policy if exists workers_update_all on public.workers;
create policy workers_update_all on public.workers for update to anon using (true) with check (true);
drop policy if exists workers_delete_all on public.workers;
create policy workers_delete_all on public.workers for delete to anon using (true);

drop policy if exists labor_entries_select_all on public.labor_entries;
create policy labor_entries_select_all on public.labor_entries for select to anon using (true);
drop policy if exists labor_entries_insert_all on public.labor_entries;
create policy labor_entries_insert_all on public.labor_entries for insert to anon with check (true);
drop policy if exists labor_entries_update_all on public.labor_entries;
create policy labor_entries_update_all on public.labor_entries for update to anon using (true) with check (true);
drop policy if exists labor_entries_delete_all on public.labor_entries;
create policy labor_entries_delete_all on public.labor_entries for delete to anon using (true);

drop policy if exists labor_payments_select_all on public.labor_payments;
create policy labor_payments_select_all on public.labor_payments for select to anon using (true);
drop policy if exists labor_payments_insert_all on public.labor_payments;
create policy labor_payments_insert_all on public.labor_payments for insert to anon with check (true);
drop policy if exists labor_payments_update_all on public.labor_payments;
create policy labor_payments_update_all on public.labor_payments for update to anon using (true) with check (true);
drop policy if exists labor_payments_delete_all on public.labor_payments;
create policy labor_payments_delete_all on public.labor_payments for delete to anon using (true);
