-- Projects table (Supabase source of truth).
-- Referenced by: project_change_orders, project_subcontractors, bills, bill_items, expense_lines, invoices, labor_entries, etc.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at date not null default current_date,
  name text not null default '',
  status text not null default 'pending' check (status in ('active', 'pending', 'completed')),
  budget numeric not null default 0,
  spent numeric not null default 0,
  client text null,
  address text null,
  project_manager text null,
  start_date date null,
  end_date date null,
  notes text null,
  estimate_ref text null,
  source_estimate_id uuid null,
  snapshot_revenue numeric null,
  snapshot_budget_cost numeric null,
  snapshot_breakdown jsonb null,
  constraint projects_source_estimate_id_unique unique (source_estimate_id)
);

create index if not exists projects_updated_at_idx on public.projects (updated_at desc);
create index if not exists projects_status_idx on public.projects (status);
create index if not exists projects_source_estimate_id_idx on public.projects (source_estimate_id) where source_estimate_id is not null;

create or replace function public.set_projects_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = current_date;
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_projects_updated_at();

alter table public.projects enable row level security;

drop policy if exists projects_select_all on public.projects;
create policy projects_select_all on public.projects for select to anon using (true);
drop policy if exists projects_insert_all on public.projects;
create policy projects_insert_all on public.projects for insert to anon with check (true);
drop policy if exists projects_update_all on public.projects;
create policy projects_update_all on public.projects for update to anon using (true) with check (true);
drop policy if exists projects_delete_all on public.projects;
create policy projects_delete_all on public.projects for delete to anon using (true);
