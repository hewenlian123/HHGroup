-- Daily Labor Log: labor_workers + labor_entries (production). No mock.
-- labor_workers: id, name (synced from workers for FK).
-- labor_entries: id, worker_id → labor_workers.id, work_date, project_am_id, project_pm_id, day_rate, ot_amount, total, created_at.

create table if not exists public.labor_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'workers') then
    insert into public.labor_workers (id, name, created_at)
    select id, name, created_at from public.workers
    on conflict (id) do nothing;
  end if;
end $$;

drop table if exists public.labor_entries cascade;

create table public.labor_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.labor_workers(id) on delete cascade,
  work_date date not null,
  project_am_id uuid null references public.projects(id) on delete set null,
  project_pm_id uuid null references public.projects(id) on delete set null,
  day_rate numeric not null default 0,
  ot_amount numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_labor_entries_work_date on public.labor_entries(work_date);
create index if not exists idx_labor_entries_worker_id on public.labor_entries(worker_id);

alter table public.labor_entries enable row level security;

drop policy if exists labor_entries_select_all on public.labor_entries;
create policy labor_entries_select_all on public.labor_entries for select to anon using (true);
drop policy if exists labor_entries_insert_all on public.labor_entries;
create policy labor_entries_insert_all on public.labor_entries for insert to anon with check (true);
drop policy if exists labor_entries_update_all on public.labor_entries;
create policy labor_entries_update_all on public.labor_entries for update to anon using (true) with check (true);
drop policy if exists labor_entries_delete_all on public.labor_entries;
create policy labor_entries_delete_all on public.labor_entries for delete to anon using (true);
