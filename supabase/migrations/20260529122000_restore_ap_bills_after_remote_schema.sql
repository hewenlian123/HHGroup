-- Restore AP bills tables after `20260325075614_remote_schema.sql` dropped them.
-- This is a forward, additive migration:
-- - never drops/truncates/deletes
-- - creates missing tables/columns/indexes/functions/triggers
-- - restores the original permissive RLS policies from `202603151000_ap_bills_module.sql`
--
-- Rationale: local `supabase db reset` applies `remote_schema` which drops `ap_bills`,
-- but later migrations do not recreate it, breaking the Bills module.

-- 1) Core tables (create if missing)
create table if not exists public.ap_bills (
  id uuid primary key default gen_random_uuid(),
  bill_no text,
  bill_type text not null default 'Vendor',
  vendor_name text not null,
  project_id uuid references public.projects(id) on delete set null,
  issue_date date,
  due_date date,
  amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_amount numeric(12,2) not null default 0,
  status text not null default 'Draft',
  category text,
  notes text,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  constraint ap_bills_bill_type_check check (
    bill_type in ('Vendor', 'Labor', 'Overhead', 'Utility', 'Permit', 'Equipment', 'Other')
  ),
  constraint ap_bills_status_check check (
    status in ('Draft', 'Pending', 'Partially Paid', 'Paid', 'Void')
  )
);

create table if not exists public.ap_bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.ap_bills(id) on delete cascade,
  payment_date date not null,
  amount numeric(12,2) not null default 0,
  payment_method text,
  reference_no text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.ap_bills is
  'Accounts payable bills (vendor, labor, overhead, etc.). Separate from legacy bills.';
comment on table public.ap_bill_payments is 'Payments applied to ap_bills.';

-- 2) Ensure required columns exist if tables were recreated partially
alter table public.ap_bills
  add column if not exists bill_no text,
  add column if not exists bill_type text,
  add column if not exists vendor_name text,
  add column if not exists project_id uuid,
  add column if not exists issue_date date,
  add column if not exists due_date date,
  add column if not exists amount numeric(12,2),
  add column if not exists paid_amount numeric(12,2),
  add column if not exists balance_amount numeric(12,2),
  add column if not exists status text,
  add column if not exists category text,
  add column if not exists notes text,
  add column if not exists attachment_url text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists created_by uuid;

alter table public.ap_bill_payments
  add column if not exists bill_id uuid,
  add column if not exists payment_date date,
  add column if not exists amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists reference_no text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz,
  add column if not exists created_by uuid;

-- 3) Indexes
create index if not exists idx_ap_bills_project_id on public.ap_bills(project_id);
create index if not exists idx_ap_bills_status on public.ap_bills(status);
create index if not exists idx_ap_bills_due_date on public.ap_bills(due_date);
create index if not exists idx_ap_bills_created_at on public.ap_bills(created_at desc);
create index if not exists idx_ap_bill_payments_bill_id on public.ap_bill_payments(bill_id);

-- 4) Updated-at trigger
create or replace function public.set_ap_bills_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.ap_bills') is not null then
    drop trigger if exists trg_ap_bills_updated_at on public.ap_bills;
    create trigger trg_ap_bills_updated_at
      before update on public.ap_bills
      for each row execute function public.set_ap_bills_updated_at();
  end if;
end $$;

-- 5) Recompute totals from payments (functions + triggers)
create or replace function public.recompute_ap_bill_totals(target_bill_id uuid)
returns void language plpgsql as $$
declare
  v_amount numeric;
  v_paid numeric;
  v_balance numeric;
  v_status text;
begin
  select amount, status into v_amount, v_status from public.ap_bills where id = target_bill_id;
  if v_amount is null then return; end if;

  select coalesce(sum(amount), 0) into v_paid from public.ap_bill_payments where bill_id = target_bill_id;
  v_balance := greatest(v_amount - v_paid, 0);

  if v_status = 'Void' then
    v_status := 'Void';
  elsif v_balance <= 0 and v_paid > 0 then
    v_status := 'Paid';
  elsif v_paid > 0 then
    v_status := 'Partially Paid';
  else
    v_status := coalesce(nullif(v_status, 'Partially Paid'), 'Pending');
    if v_status = 'Draft' then v_status := 'Draft'; end if;
  end if;

  update public.ap_bills
  set paid_amount = v_paid, balance_amount = v_balance, status = v_status
  where id = target_bill_id;
end;
$$;

create or replace function public.recompute_ap_bill_totals_trigger()
returns trigger language plpgsql as $$
begin
  perform public.recompute_ap_bill_totals(coalesce(new.bill_id, old.bill_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.recompute_ap_bill_totals_trigger_amount()
returns trigger language plpgsql as $$
begin
  perform public.recompute_ap_bill_totals(new.id);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.ap_bill_payments') is not null then
    drop trigger if exists trg_ap_bill_payments_recompute on public.ap_bill_payments;
    create trigger trg_ap_bill_payments_recompute
      after insert or update or delete on public.ap_bill_payments
      for each row execute function public.recompute_ap_bill_totals_trigger();
  end if;

  if to_regclass('public.ap_bills') is not null then
    drop trigger if exists trg_ap_bills_recompute_on_amount on public.ap_bills;
    create trigger trg_ap_bills_recompute_on_amount
      after update of amount on public.ap_bills
      for each row execute function public.recompute_ap_bill_totals_trigger_amount();
  end if;
end $$;

-- 6) RLS + policies (restore to match original module migration)
-- Note: this keeps the original permissive anon policies for now (same as 202603151000).
alter table public.ap_bills enable row level security;
alter table public.ap_bill_payments enable row level security;

drop policy if exists ap_bills_select_all on public.ap_bills;
create policy ap_bills_select_all on public.ap_bills for select to anon using (true);
drop policy if exists ap_bills_insert_all on public.ap_bills;
create policy ap_bills_insert_all on public.ap_bills for insert to anon with check (true);
drop policy if exists ap_bills_update_all on public.ap_bills;
create policy ap_bills_update_all on public.ap_bills for update to anon using (true) with check (true);
drop policy if exists ap_bills_delete_all on public.ap_bills;
create policy ap_bills_delete_all on public.ap_bills for delete to anon using (true);

drop policy if exists ap_bill_payments_select_all on public.ap_bill_payments;
create policy ap_bill_payments_select_all on public.ap_bill_payments for select to anon using (true);
drop policy if exists ap_bill_payments_insert_all on public.ap_bill_payments;
create policy ap_bill_payments_insert_all on public.ap_bill_payments for insert to anon with check (true);
drop policy if exists ap_bill_payments_update_all on public.ap_bill_payments;
create policy ap_bill_payments_update_all on public.ap_bill_payments for update to anon using (true) with check (true);
drop policy if exists ap_bill_payments_delete_all on public.ap_bill_payments;
create policy ap_bill_payments_delete_all on public.ap_bill_payments for delete to anon using (true);

