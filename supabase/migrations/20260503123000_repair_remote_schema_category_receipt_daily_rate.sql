-- Reconcile local schema after 20260325075614_remote_schema.sql dropped:
--   public.categories, expenses.receipt_url, workers.daily_rate
-- Restores shapes expected by app migrations:
--   202602280005_vendors_and_categories.sql (categories only — vendors kept),
--   202603171000_expenses_receipt_status_worker.sql (receipt_url),
--   202603182000_workers_add_trade_rates.sql (daily_rate).
-- Idempotent: CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS only.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  type text not null default 'expense',
  status text not null default 'active',
  description text null,
  constraint categories_status_check check (status in ('active', 'inactive')),
  constraint categories_type_check check (type in ('expense', 'income', 'other'))
);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

drop policy if exists categories_select_all on public.categories;
create policy categories_select_all on public.categories for select to anon using (true);
drop policy if exists categories_insert_all on public.categories;
create policy categories_insert_all on public.categories for insert to anon with check (true);
drop policy if exists categories_update_all on public.categories;
create policy categories_update_all on public.categories for update to anon using (true) with check (true);
drop policy if exists categories_delete_all on public.categories;
create policy categories_delete_all on public.categories for delete to anon using (true);

grant select, insert, update, delete on table public.categories to anon, authenticated, service_role;

alter table public.expenses add column if not exists receipt_url text;
comment on column public.expenses.receipt_url is 'Public or signed URL for receipt file in storage bucket receipts';

alter table public.workers add column if not exists daily_rate numeric default 0;
comment on column public.workers.daily_rate is 'Full-day rate for payroll';
