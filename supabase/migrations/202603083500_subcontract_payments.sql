-- Subcontract payments. RLS with full access for anon (dev).

create table if not exists public.subcontract_payments (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references public.subcontracts(id) on delete cascade,
  bill_id uuid references public.subcontract_bills(id) on delete set null,
  payment_date date not null default current_date,
  amount numeric not null,
  method text,
  note text,
  created_at timestamptz default now()
);

alter table public.subcontract_payments enable row level security;

drop policy if exists subcontract_payments_select_all on public.subcontract_payments;
create policy subcontract_payments_select_all on public.subcontract_payments for select to anon using (true);
drop policy if exists subcontract_payments_insert_all on public.subcontract_payments;
create policy subcontract_payments_insert_all on public.subcontract_payments for insert to anon with check (true);
drop policy if exists subcontract_payments_update_all on public.subcontract_payments;
create policy subcontract_payments_update_all on public.subcontract_payments for update to anon using (true) with check (true);
drop policy if exists subcontract_payments_delete_all on public.subcontract_payments;
create policy subcontract_payments_delete_all on public.subcontract_payments for delete to anon using (true);
