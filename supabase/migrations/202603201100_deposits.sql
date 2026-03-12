-- Deposits: auto-created from payments_received. Used for Cash In on dashboard.
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments_received(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  customer_name text not null default '',
  deposit_account text null,
  amount numeric not null default 0,
  payment_method text null,
  deposit_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_deposits_payment_id on public.deposits(payment_id);
create index if not exists idx_deposits_invoice_id on public.deposits(invoice_id);
create index if not exists idx_deposits_deposit_date on public.deposits(deposit_date desc);
create index if not exists idx_deposits_project_id on public.deposits(project_id);

alter table public.deposits enable row level security;
drop policy if exists deposits_select_all on public.deposits;
create policy deposits_select_all on public.deposits for select to anon using (true);
drop policy if exists deposits_insert_all on public.deposits;
create policy deposits_insert_all on public.deposits for insert to anon with check (true);
drop policy if exists deposits_update_all on public.deposits;
create policy deposits_update_all on public.deposits for update to anon using (true) with check (true);
drop policy if exists deposits_delete_all on public.deposits;
create policy deposits_delete_all on public.deposits for delete to anon using (true);
