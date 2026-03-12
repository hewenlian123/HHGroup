-- Punch list for construction operations. One row per issue.

create extension if not exists pgcrypto;

create table if not exists public.punch_list (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  issue text not null default '',
  location text null,
  assigned_worker_id uuid null references public.workers(id) on delete set null,
  status text not null default 'open',
  photo_url text null
);

create index if not exists idx_punch_list_project_id on public.punch_list (project_id);
create index if not exists idx_punch_list_status on public.punch_list (status);
create index if not exists idx_punch_list_created_at on public.punch_list (created_at desc);

alter table public.punch_list enable row level security;
drop policy if exists punch_list_select_all on public.punch_list;
create policy punch_list_select_all on public.punch_list for select to anon using (true);
drop policy if exists punch_list_insert_all on public.punch_list;
create policy punch_list_insert_all on public.punch_list for insert to anon with check (true);
drop policy if exists punch_list_update_all on public.punch_list;
create policy punch_list_update_all on public.punch_list for update to anon using (true) with check (true);
drop policy if exists punch_list_delete_all on public.punch_list;
create policy punch_list_delete_all on public.punch_list for delete to anon using (true);
