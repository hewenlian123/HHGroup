-- Bank transactions + reconcile linkage (Supabase-only)
create extension if not exists pgcrypto;

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  txn_date date not null,
  description text not null default '',
  amount numeric not null default 0,
  status text not null default 'unmatched' check (status in ('unmatched', 'reconciled')),
  reconcile_type text null check (reconcile_type in ('Expense', 'Income', 'Transfer')),
  reconciled_at timestamptz null,
  linked_expense_id uuid null references public.expenses(id) on delete set null,
  vendor_name text null,
  payment_method text null,
  notes text null
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bank_transactions_updated_at on public.bank_transactions;
create trigger trg_bank_transactions_updated_at
before update on public.bank_transactions
for each row execute function public.set_updated_at();

alter table public.bank_transactions enable row level security;

drop policy if exists bank_transactions_select_all on public.bank_transactions;
create policy bank_transactions_select_all on public.bank_transactions for select to anon using (true);
drop policy if exists bank_transactions_insert_all on public.bank_transactions;
create policy bank_transactions_insert_all on public.bank_transactions for insert to anon with check (true);
drop policy if exists bank_transactions_update_all on public.bank_transactions;
create policy bank_transactions_update_all on public.bank_transactions for update to anon using (true) with check (true);
drop policy if exists bank_transactions_delete_all on public.bank_transactions;
create policy bank_transactions_delete_all on public.bank_transactions for delete to anon using (true);

