-- Subcontract bills. RLS with full access for anon (dev).

create table if not exists public.subcontract_bills (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references public.subcontracts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  bill_date date not null default current_date,
  amount numeric not null,
  description text,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

alter table public.subcontract_bills enable row level security;

drop policy if exists subcontract_bills_select_all on public.subcontract_bills;
create policy subcontract_bills_select_all on public.subcontract_bills for select to anon using (true);
drop policy if exists subcontract_bills_insert_all on public.subcontract_bills;
create policy subcontract_bills_insert_all on public.subcontract_bills for insert to anon with check (true);
drop policy if exists subcontract_bills_update_all on public.subcontract_bills;
create policy subcontract_bills_update_all on public.subcontract_bills for update to anon using (true) with check (true);
drop policy if exists subcontract_bills_delete_all on public.subcontract_bills;
create policy subcontract_bills_delete_all on public.subcontract_bills for delete to anon using (true);
