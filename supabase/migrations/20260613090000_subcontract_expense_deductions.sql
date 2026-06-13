-- Subcontract material deductions linked to company-paid project expenses.
-- These rows reduce subcontractor payable but are not project costs themselves;
-- the linked expense line remains the single source of actual project cost.

create table if not exists public.subcontract_deductions (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  subcontract_id uuid null references public.subcontracts(id) on delete set null,
  amount numeric not null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontract_deductions_amount_positive check (amount > 0),
  constraint subcontract_deductions_expense_unique unique (expense_id)
);

create index if not exists subcontract_deductions_project_id_idx
  on public.subcontract_deductions(project_id);

create index if not exists subcontract_deductions_subcontractor_id_idx
  on public.subcontract_deductions(subcontractor_id);

create index if not exists subcontract_deductions_subcontract_id_idx
  on public.subcontract_deductions(subcontract_id);

drop trigger if exists trg_subcontract_deductions_updated_at
  on public.subcontract_deductions;
create trigger trg_subcontract_deductions_updated_at
before update on public.subcontract_deductions
for each row execute function public.set_updated_at();

alter table public.subcontract_deductions enable row level security;

drop policy if exists subcontract_deductions_select_authenticated
  on public.subcontract_deductions;
create policy subcontract_deductions_select_authenticated
  on public.subcontract_deductions
  for select
  to authenticated
  using (true);

drop policy if exists subcontract_deductions_insert_authenticated
  on public.subcontract_deductions;
create policy subcontract_deductions_insert_authenticated
  on public.subcontract_deductions
  for insert
  to authenticated
  with check (true);

drop policy if exists subcontract_deductions_update_authenticated
  on public.subcontract_deductions;
create policy subcontract_deductions_update_authenticated
  on public.subcontract_deductions
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists subcontract_deductions_delete_authenticated
  on public.subcontract_deductions;
create policy subcontract_deductions_delete_authenticated
  on public.subcontract_deductions
  for delete
  to authenticated
  using (true);

comment on table public.subcontract_deductions is
  'Company-paid expense deductions that reduce subcontractor payable without adding a second project cost.';
