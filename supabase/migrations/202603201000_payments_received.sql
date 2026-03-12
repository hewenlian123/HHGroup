-- Payments Received: AR payments linked to invoices. Additive only; does not replace invoice_payments.
create table if not exists public.payments_received (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  customer_name text not null default '',
  payment_date date not null default current_date,
  amount numeric not null default 0,
  payment_method text null,
  deposit_account text null,
  notes text null,
  attachment_url text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_received_invoice_id on public.payments_received(invoice_id);
create index if not exists idx_payments_received_payment_date on public.payments_received(payment_date desc);
create index if not exists idx_payments_received_project_id on public.payments_received(project_id);

alter table public.payments_received enable row level security;
drop policy if exists payments_received_select_all on public.payments_received;
create policy payments_received_select_all on public.payments_received for select to anon using (true);
drop policy if exists payments_received_insert_all on public.payments_received;
create policy payments_received_insert_all on public.payments_received for insert to anon with check (true);
drop policy if exists payments_received_update_all on public.payments_received;
create policy payments_received_update_all on public.payments_received for update to anon using (true) with check (true);
drop policy if exists payments_received_delete_all on public.payments_received;
create policy payments_received_delete_all on public.payments_received for delete to anon using (true);
