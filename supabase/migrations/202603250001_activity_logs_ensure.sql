-- Ensure activity_logs exists (in case 202603250000 was partially applied or schema cache is stale).
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null,
  description text not null default ''
);

create index if not exists idx_activity_logs_project_id on public.activity_logs (project_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs (created_at desc);

alter table public.activity_logs enable row level security;
drop policy if exists activity_logs_select_all on public.activity_logs;
create policy activity_logs_select_all on public.activity_logs for select to anon using (true);
drop policy if exists activity_logs_insert_all on public.activity_logs;
create policy activity_logs_insert_all on public.activity_logs for insert to anon with check (true);
