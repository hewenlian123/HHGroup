-- Project construction management: tasks, schedule, activity_logs.
-- Indexes on project_id, created_at, status for performance.

create extension if not exists pgcrypto;

-- project_tasks
create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  description text null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  assigned_worker_id uuid null references public.workers(id) on delete set null,
  due_date date null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high'))
);

create index if not exists idx_project_tasks_project_id on public.project_tasks (project_id);
create index if not exists idx_project_tasks_created_at on public.project_tasks (created_at desc);
create index if not exists idx_project_tasks_status on public.project_tasks (status);

alter table public.project_tasks enable row level security;
drop policy if exists project_tasks_select_all on public.project_tasks;
create policy project_tasks_select_all on public.project_tasks for select to anon using (true);
drop policy if exists project_tasks_insert_all on public.project_tasks;
create policy project_tasks_insert_all on public.project_tasks for insert to anon with check (true);
drop policy if exists project_tasks_update_all on public.project_tasks;
create policy project_tasks_update_all on public.project_tasks for update to anon using (true) with check (true);
drop policy if exists project_tasks_delete_all on public.project_tasks;
create policy project_tasks_delete_all on public.project_tasks for delete to anon using (true);

-- project_schedule (timeline items)
create table if not exists public.project_schedule (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  start_date date null,
  end_date date null,
  status text not null default 'scheduled'
);

create index if not exists idx_project_schedule_project_id on public.project_schedule (project_id);
create index if not exists idx_project_schedule_start_date on public.project_schedule (start_date);

alter table public.project_schedule enable row level security;
drop policy if exists project_schedule_select_all on public.project_schedule;
create policy project_schedule_select_all on public.project_schedule for select to anon using (true);
drop policy if exists project_schedule_insert_all on public.project_schedule;
create policy project_schedule_insert_all on public.project_schedule for insert to anon with check (true);
drop policy if exists project_schedule_update_all on public.project_schedule;
create policy project_schedule_update_all on public.project_schedule for update to anon using (true) with check (true);
drop policy if exists project_schedule_delete_all on public.project_schedule;
create policy project_schedule_delete_all on public.project_schedule for delete to anon using (true);

-- activity_logs (project-scoped events)
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

-- Trigger: log labor entry created (only if labor_entries has project_id column)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'labor_entries' and column_name = 'project_id') then
    create or replace function public.log_activity_labor_entry()
    returns trigger language plpgsql as $fn$
    begin
      if new.project_id is not null then
        insert into public.activity_logs (project_id, type, description)
        values (new.project_id, 'labor_entry_created', 'Labor entry created');
      end if;
      return new;
    end $fn$;
    drop trigger if exists trg_activity_labor_entry on public.labor_entries;
    create trigger trg_activity_labor_entry after insert on public.labor_entries
      for each row execute function public.log_activity_labor_entry();
  end if;
end $$;

-- Trigger: log expense line created (project_id on expense_lines)
create or replace function public.log_activity_expense_line()
returns trigger language plpgsql as $$
begin
  if new.project_id is not null then
    insert into public.activity_logs (project_id, type, description)
    values (new.project_id, 'expense_created', 'Expense created');
  end if;
  return new;
end; $$;
drop trigger if exists trg_activity_expense_line on public.expense_lines;
create trigger trg_activity_expense_line after insert on public.expense_lines
  for each row execute function public.log_activity_expense_line();

-- Trigger: log invoice created
create or replace function public.log_activity_invoice()
returns trigger language plpgsql as $$
begin
  if new.project_id is not null then
    insert into public.activity_logs (project_id, type, description)
    values (new.project_id, 'invoice_created', 'Invoice created');
  end if;
  return new;
end; $$;
drop trigger if exists trg_activity_invoice on public.invoices;
create trigger trg_activity_invoice after insert on public.invoices
  for each row execute function public.log_activity_invoice();

-- Task completed is logged from the app when status is updated to 'done'.
