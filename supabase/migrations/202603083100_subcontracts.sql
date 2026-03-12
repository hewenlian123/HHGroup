-- Subcontracts: project + subcontractor link. RLS with full access for anon (dev).

create table if not exists public.subcontracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  cost_code text,
  contract_amount numeric not null,
  description text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

alter table public.subcontracts enable row level security;

drop policy if exists subcontracts_select_all on public.subcontracts;
create policy subcontracts_select_all on public.subcontracts for select to anon using (true);
drop policy if exists subcontracts_insert_all on public.subcontracts;
create policy subcontracts_insert_all on public.subcontracts for insert to anon with check (true);
drop policy if exists subcontracts_update_all on public.subcontracts;
create policy subcontracts_update_all on public.subcontracts for update to anon using (true) with check (true);
drop policy if exists subcontracts_delete_all on public.subcontracts;
create policy subcontracts_delete_all on public.subcontracts for delete to anon using (true);
