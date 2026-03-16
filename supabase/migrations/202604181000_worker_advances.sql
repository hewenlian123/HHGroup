-- Worker advances table for labor module
-- Tracks salary advances that are later deducted from worker payments.

create table if not exists public.worker_advances (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  project_id uuid,
  amount numeric not null,
  advance_date date not null default current_date,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists worker_advances_worker_id_idx
  on public.worker_advances (worker_id);

create index if not exists worker_advances_project_id_idx
  on public.worker_advances (project_id);

create index if not exists worker_advances_status_idx
  on public.worker_advances (status);

create index if not exists worker_advances_advance_date_idx
  on public.worker_advances (advance_date);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'workers'
  ) then
    alter table public.worker_advances
      add constraint worker_advances_worker_id_fkey
      foreign key (worker_id) references public.workers(id) on delete cascade;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'projects'
  ) then
    alter table public.worker_advances
      add constraint worker_advances_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
exception
  when duplicate_object then null;
end $$;

-- Enable RLS and mirror the open policies used for other labor tables.
alter table public.worker_advances enable row level security;

drop policy if exists worker_advances_select_all on public.worker_advances;
create policy worker_advances_select_all
  on public.worker_advances
  for select
  to anon
  using (true);

drop policy if exists worker_advances_insert_all on public.worker_advances;
create policy worker_advances_insert_all
  on public.worker_advances
  for insert
  to anon
  with check (true);

drop policy if exists worker_advances_update_all on public.worker_advances;
create policy worker_advances_update_all
  on public.worker_advances
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists worker_advances_delete_all on public.worker_advances;
create policy worker_advances_delete_all
  on public.worker_advances
  for delete
  to anon
  using (true);

