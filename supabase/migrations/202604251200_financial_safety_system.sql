-- Financial Safety System
-- - Prevent duplicate deposits per payment (except voided)
-- - Add status columns for finance tables (idempotent)
-- - Add audit log table for change tracking

-- 1) Add status columns (if missing)
do $$
begin
  if to_regclass('public.invoices') is not null then
    alter table public.invoices add column if not exists status text default 'draft';
  end if;
  if to_regclass('public.payments_received') is not null then
    alter table public.payments_received add column if not exists status text default 'completed';
  end if;
  if to_regclass('public.deposits') is not null then
    alter table public.deposits add column if not exists status text default 'recorded';
  end if;
end $$;

-- Backfill null statuses (keep existing non-null values)
do $$
begin
  if to_regclass('public.invoices') is not null then
    update public.invoices set status = 'draft' where status is null;
  end if;
  if to_regclass('public.payments_received') is not null then
    update public.payments_received set status = 'completed' where status is null;
  end if;
  if to_regclass('public.deposits') is not null then
    update public.deposits set status = 'recorded' where status is null;
  end if;
end $$;

-- 2) deposits: prevent duplicate deposits for the same payment_id (non-void)
-- NOTE: A partial unique index is used so voided deposits can exist historically.
do $$
begin
  if to_regclass('public.deposits') is not null then
    execute $q$
      create unique index if not exists unique_payment_deposit
        on public.deposits (payment_id)
        where payment_id is not null and coalesce(status, 'recorded') <> 'void'
    $q$;
  end if;
end $$;

-- 3) audit_logs table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  user_id uuid,
  created_at timestamptz default now()
);

create index if not exists idx_audit_logs_table_record
  on public.audit_logs (table_name, record_id, created_at desc);

