-- Invoices (AR) + items + payments (Supabase-only source of truth)
create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_no text not null,
  project_id uuid null references public.projects(id) on delete set null,
  customer_id uuid null references public.customers(id) on delete set null,
  client_name text not null default '',
  issue_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Partially Paid', 'Paid', 'Void')),
  notes text null,
  tax_pct numeric not null default 0,
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  paid_total numeric not null default 0,
  balance_due numeric not null default 0
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'invoices'
      and constraint_name = 'invoices_invoice_no_key'
  ) then
    alter table public.invoices add constraint invoices_invoice_no_key unique (invoice_no);
  end if;
end $$;

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null default '',
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  paid_at date not null default current_date,
  amount numeric not null,
  method text null,
  memo text null,
  status text not null default 'Posted' check (status in ('Posted', 'Voided'))
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

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create or replace function public.set_invoice_item_amount()
returns trigger
language plpgsql
as $$
begin
  new.qty = coalesce(new.qty, 0);
  new.unit_price = coalesce(new.unit_price, 0);
  new.amount = new.qty * new.unit_price;
  return new;
end;
$$;

drop trigger if exists trg_invoice_items_set_amount on public.invoice_items;
create trigger trg_invoice_items_set_amount
before insert or update on public.invoice_items
for each row execute function public.set_invoice_item_amount();

create or replace function public.recompute_invoice_totals(target_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal numeric := 0;
  v_tax_pct numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_status text;
begin
  select coalesce(sum(amount), 0)
  into v_subtotal
  from public.invoice_items
  where invoice_id = target_invoice_id;

  select coalesce(tax_pct, 0), status
  into v_tax_pct, v_status
  from public.invoices
  where id = target_invoice_id;

  v_tax := greatest(v_subtotal, 0) * (greatest(v_tax_pct, 0) / 100);
  v_total := v_subtotal + v_tax;

  select coalesce(sum(amount), 0)
  into v_paid
  from public.invoice_payments
  where invoice_id = target_invoice_id
    and status = 'Posted';

  v_balance := greatest(v_total - v_paid, 0);

  update public.invoices
  set
    subtotal = v_subtotal,
    tax_amount = v_tax,
    total = v_total,
    paid_total = v_paid,
    balance_due = v_balance,
    status = case
      when status = 'Void' then 'Void'
      when v_paid > 0 and v_balance <= 0 then 'Paid'
      when v_paid > 0 and v_balance > 0 then 'Partially Paid'
      else status
    end
  where id = target_invoice_id;
end;
$$;

create or replace function public.trg_recompute_invoice_totals()
returns trigger
language plpgsql
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(
    nullif(to_jsonb(new)->>'invoice_id', '')::uuid,
    nullif(to_jsonb(old)->>'invoice_id', '')::uuid,
    nullif(to_jsonb(new)->>'id', '')::uuid,
    nullif(to_jsonb(old)->>'id', '')::uuid
  );
  perform public.recompute_invoice_totals(target_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invoice_items_recompute_after_change on public.invoice_items;
create trigger trg_invoice_items_recompute_after_change
after insert or update or delete on public.invoice_items
for each row execute function public.trg_recompute_invoice_totals();

drop trigger if exists trg_invoice_payments_recompute_after_change on public.invoice_payments;
create trigger trg_invoice_payments_recompute_after_change
after insert or update or delete on public.invoice_payments
for each row execute function public.trg_recompute_invoice_totals();

drop trigger if exists trg_invoices_recompute_after_tax_change on public.invoices;
create trigger trg_invoices_recompute_after_tax_change
after insert or update of tax_pct on public.invoices
for each row execute function public.trg_recompute_invoice_totals();

-- RLS: dev-friendly open anon (lock down later with has_perm-based policies)
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;

drop policy if exists invoices_select_all on public.invoices;
create policy invoices_select_all on public.invoices for select to anon using (true);
drop policy if exists invoices_insert_all on public.invoices;
create policy invoices_insert_all on public.invoices for insert to anon with check (true);
drop policy if exists invoices_update_all on public.invoices;
create policy invoices_update_all on public.invoices for update to anon using (true) with check (true);
drop policy if exists invoices_delete_all on public.invoices;
create policy invoices_delete_all on public.invoices for delete to anon using (true);

drop policy if exists invoice_items_select_all on public.invoice_items;
create policy invoice_items_select_all on public.invoice_items for select to anon using (true);
drop policy if exists invoice_items_insert_all on public.invoice_items;
create policy invoice_items_insert_all on public.invoice_items for insert to anon with check (true);
drop policy if exists invoice_items_update_all on public.invoice_items;
create policy invoice_items_update_all on public.invoice_items for update to anon using (true) with check (true);
drop policy if exists invoice_items_delete_all on public.invoice_items;
create policy invoice_items_delete_all on public.invoice_items for delete to anon using (true);

drop policy if exists invoice_payments_select_all on public.invoice_payments;
create policy invoice_payments_select_all on public.invoice_payments for select to anon using (true);
drop policy if exists invoice_payments_insert_all on public.invoice_payments;
create policy invoice_payments_insert_all on public.invoice_payments for insert to anon with check (true);
drop policy if exists invoice_payments_update_all on public.invoice_payments;
create policy invoice_payments_update_all on public.invoice_payments for update to anon using (true) with check (true);
drop policy if exists invoice_payments_delete_all on public.invoice_payments;
create policy invoice_payments_delete_all on public.invoice_payments for delete to anon using (true);

