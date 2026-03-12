-- Project closeout: final punch list, warranty, completion certificate.

create extension if not exists pgcrypto;

-- Final punch list (one row per project)
create table if not exists public.project_closeout_punch (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inspection_date date null,
  inspector text null,
  notes text null,
  contractor_signature text null,
  client_signature text null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create index if not exists idx_project_closeout_punch_project_id on public.project_closeout_punch (project_id);

-- Warranty information (one row per project)
create table if not exists public.project_closeout_warranty (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  start_date date null,
  period_months integer not null default 12,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create index if not exists idx_project_closeout_warranty_project_id on public.project_closeout_warranty (project_id);

-- Completion certificate (one row per project)
create table if not exists public.project_closeout_completion (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  completion_date date null,
  contractor_name text null,
  client_name text null,
  contractor_signature text null,
  client_signature text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create index if not exists idx_project_closeout_completion_project_id on public.project_closeout_completion (project_id);

alter table public.project_closeout_punch enable row level security;
drop policy if exists project_closeout_punch_select on public.project_closeout_punch;
create policy project_closeout_punch_select on public.project_closeout_punch for select to anon using (true);
drop policy if exists project_closeout_punch_insert on public.project_closeout_punch;
create policy project_closeout_punch_insert on public.project_closeout_punch for insert to anon with check (true);
drop policy if exists project_closeout_punch_update on public.project_closeout_punch;
create policy project_closeout_punch_update on public.project_closeout_punch for update to anon using (true) with check (true);

alter table public.project_closeout_warranty enable row level security;
drop policy if exists project_closeout_warranty_select on public.project_closeout_warranty;
create policy project_closeout_warranty_select on public.project_closeout_warranty for select to anon using (true);
drop policy if exists project_closeout_warranty_insert on public.project_closeout_warranty;
create policy project_closeout_warranty_insert on public.project_closeout_warranty for insert to anon with check (true);
drop policy if exists project_closeout_warranty_update on public.project_closeout_warranty;
create policy project_closeout_warranty_update on public.project_closeout_warranty for update to anon using (true) with check (true);

alter table public.project_closeout_completion enable row level security;
drop policy if exists project_closeout_completion_select on public.project_closeout_completion;
create policy project_closeout_completion_select on public.project_closeout_completion for select to anon using (true);
drop policy if exists project_closeout_completion_insert on public.project_closeout_completion;
create policy project_closeout_completion_insert on public.project_closeout_completion for insert to anon with check (true);
drop policy if exists project_closeout_completion_update on public.project_closeout_completion;
create policy project_closeout_completion_update on public.project_closeout_completion for update to anon using (true) with check (true);
