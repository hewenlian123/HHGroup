-- labor_entries table for Timesheet system
-- Recreates table with schema: id, date, worker_id, am/pm/ot project ids, amounts, status, created_at + indexes

drop table if exists public.labor_entries cascade;

create table public.labor_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  worker_id uuid not null,
  am_project_id uuid null,
  pm_project_id uuid null,
  ot_project_id uuid null,
  ot_amount numeric not null default 0,
  half_day_rate numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

-- Indexes for common filters
create index if not exists idx_labor_entries_date on public.labor_entries (date);
create index if not exists idx_labor_entries_worker_id on public.labor_entries (worker_id);

-- Foreign keys (workers from 202602280011; projects may exist from other migrations)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'workers') then
    alter table public.labor_entries
      add constraint labor_entries_worker_id_fkey
      foreign key (worker_id) references public.workers(id) on delete cascade;
  end if;
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

-- RLS
alter table public.labor_entries enable row level security;

drop policy if exists labor_entries_select_all on public.labor_entries;
create policy labor_entries_select_all on public.labor_entries for select to anon using (true);
drop policy if exists labor_entries_insert_all on public.labor_entries;
create policy labor_entries_insert_all on public.labor_entries for insert to anon with check (true);
drop policy if exists labor_entries_update_all on public.labor_entries;
create policy labor_entries_update_all on public.labor_entries for update to anon using (true) with check (true);
drop policy if exists labor_entries_delete_all on public.labor_entries;
create policy labor_entries_delete_all on public.labor_entries for delete to anon using (true);
