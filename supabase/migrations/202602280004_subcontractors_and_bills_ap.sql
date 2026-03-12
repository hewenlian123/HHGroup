-- Subcontractors + Bills (AP) + Attachments
-- NOTE: Policies are intentionally open for anon in current dev mode.
-- Lock these down once auth is enabled.

-- 1) Core tables
create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text not null,
  legal_name text null,
  contact_name text null,
  phone text null,
  email text null,
  address1 text null,
  address2 text null,
  city text null,
  state text null,
  zip text null,
  tax_id_last4 text null,
  w9_on_file boolean not null default false,
  insurance_expiration date null,
  license_number text null,
  notes text null,
  status text not null default 'active',
  constraint subcontractors_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.project_subcontractors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  role text null,
  agreed_rate_type text null,
  agreed_rate numeric null,
  created_at timestamptz not null default now(),
  constraint project_subcontractors_unique unique (project_id, subcontractor_id),
  constraint project_subcontractors_rate_type_check check (agreed_rate_type is null or agreed_rate_type in ('fixed', 't&m', 'unit'))
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bill_number text null,
  bill_date date not null default current_date,
  due_date date null,
  status text not null default 'draft',
  project_id uuid null references public.projects(id) on delete set null,
  subcontractor_id uuid null references public.subcontractors(id) on delete set null,
  vendor_id uuid null,
  payee_name text null,
  category_id uuid null,
  memo text null,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  balance numeric not null default 0,
  void_reason text null,
  constraint bills_status_check check (status in ('draft', 'approved', 'paid', 'void'))
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'vendors'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'bills'
        and constraint_name = 'bills_vendor_id_fkey'
    ) then
      alter table public.bills
      add constraint bills_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete set null;
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'categories'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'bills'
        and constraint_name = 'bills_category_id_fkey'
    ) then
      alter table public.bills
      add constraint bills_category_id_fkey
      foreign key (category_id) references public.categories(id) on delete set null;
    end if;
  end if;
end $$;

create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  description text not null,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  cost_code text null,
  project_id uuid null references public.projects(id) on delete set null
);

create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  paid_at date not null default current_date,
  amount numeric not null,
  payment_method text null,
  reference_no text null,
  notes text null
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  file_path text not null,
  mime_type text null,
  size_bytes bigint null,
  constraint attachments_entity_type_check check (entity_type in ('subcontractor', 'bill'))
);

-- 2) Triggers/functions
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_subcontractors_updated_at on public.subcontractors;
create trigger trg_subcontractors_updated_at
before update on public.subcontractors
for each row execute function public.set_updated_at();

drop trigger if exists trg_bills_updated_at on public.bills;
create trigger trg_bills_updated_at
before update on public.bills
for each row execute function public.set_updated_at();

create or replace function public.set_bill_item_line_total()
returns trigger
language plpgsql
as $$
begin
  new.qty = coalesce(new.qty, 0);
  new.unit_price = coalesce(new.unit_price, 0);
  new.line_total = new.qty * new.unit_price;
  return new;
end;
$$;

drop trigger if exists trg_bill_items_set_line_total on public.bill_items;
create trigger trg_bill_items_set_line_total
before insert or update on public.bill_items
for each row execute function public.set_bill_item_line_total();

create or replace function public.recompute_bill_totals(target_bill_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_status text;
begin
  select coalesce(sum(line_total), 0)
  into v_subtotal
  from public.bill_items
  where bill_id = target_bill_id;

  select coalesce(tax, 0), status
  into v_tax, v_status
  from public.bills
  where id = target_bill_id;

  v_total := v_subtotal + coalesce(v_tax, 0);

  select coalesce(sum(amount), 0)
  into v_paid
  from public.bill_payments
  where bill_id = target_bill_id;

  v_balance := greatest(v_total - v_paid, 0);

  update public.bills
  set
    subtotal = v_subtotal,
    total = v_total,
    amount_paid = v_paid,
    balance = v_balance,
    status = case
      when status = 'void' then 'void'
      when v_balance <= 0 and status <> 'draft' then 'paid'
      else status
    end
  where id = target_bill_id;
end;
$$;

create or replace function public.trg_recompute_bill_totals()
returns trigger
language plpgsql
as $$
declare
  target_bill_id uuid;
begin
  target_bill_id := coalesce(new.bill_id, old.bill_id, new.id, old.id);
  perform public.recompute_bill_totals(target_bill_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.enforce_bill_payment_status()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.bills where id = new.bill_id;
  if v_status is null then
    raise exception 'Bill % not found', new.bill_id;
  end if;
  if v_status not in ('approved', 'paid') then
    raise exception 'Only approved or paid bills can accept payments. Current status: %', v_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bills_recompute_after_update on public.bills;
create trigger trg_bills_recompute_after_update
after insert or update of tax on public.bills
for each row execute function public.trg_recompute_bill_totals();

drop trigger if exists trg_bill_items_recompute_after_change on public.bill_items;
create trigger trg_bill_items_recompute_after_change
after insert or update or delete on public.bill_items
for each row execute function public.trg_recompute_bill_totals();

drop trigger if exists trg_bill_payments_validate_status on public.bill_payments;
create trigger trg_bill_payments_validate_status
before insert or update on public.bill_payments
for each row execute function public.enforce_bill_payment_status();

drop trigger if exists trg_bill_payments_recompute_after_change on public.bill_payments;
create trigger trg_bill_payments_recompute_after_change
after insert or update or delete on public.bill_payments
for each row execute function public.trg_recompute_bill_totals();

-- 3) Bucket + storage policies
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update set public = excluded.public, name = excluded.name;

-- 4) RLS + policies
alter table public.subcontractors enable row level security;
alter table public.project_subcontractors enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.bill_payments enable row level security;
alter table public.attachments enable row level security;

drop policy if exists subcontractors_select_all on public.subcontractors;
create policy subcontractors_select_all on public.subcontractors for select to anon using (true);
drop policy if exists subcontractors_insert_all on public.subcontractors;
create policy subcontractors_insert_all on public.subcontractors for insert to anon with check (true);
drop policy if exists subcontractors_update_all on public.subcontractors;
create policy subcontractors_update_all on public.subcontractors for update to anon using (true) with check (true);
drop policy if exists subcontractors_delete_all on public.subcontractors;
create policy subcontractors_delete_all on public.subcontractors for delete to anon using (true);

drop policy if exists project_subcontractors_select_all on public.project_subcontractors;
create policy project_subcontractors_select_all on public.project_subcontractors for select to anon using (true);
drop policy if exists project_subcontractors_insert_all on public.project_subcontractors;
create policy project_subcontractors_insert_all on public.project_subcontractors for insert to anon with check (true);
drop policy if exists project_subcontractors_update_all on public.project_subcontractors;
create policy project_subcontractors_update_all on public.project_subcontractors for update to anon using (true) with check (true);
drop policy if exists project_subcontractors_delete_all on public.project_subcontractors;
create policy project_subcontractors_delete_all on public.project_subcontractors for delete to anon using (true);

drop policy if exists bills_select_all on public.bills;
create policy bills_select_all on public.bills for select to anon using (true);
drop policy if exists bills_insert_all on public.bills;
create policy bills_insert_all on public.bills for insert to anon with check (true);
drop policy if exists bills_update_all on public.bills;
create policy bills_update_all on public.bills for update to anon using (true) with check (true);
drop policy if exists bills_delete_all on public.bills;
create policy bills_delete_all on public.bills for delete to anon using (true);

drop policy if exists bill_items_select_all on public.bill_items;
create policy bill_items_select_all on public.bill_items for select to anon using (true);
drop policy if exists bill_items_insert_all on public.bill_items;
create policy bill_items_insert_all on public.bill_items for insert to anon with check (true);
drop policy if exists bill_items_update_all on public.bill_items;
create policy bill_items_update_all on public.bill_items for update to anon using (true) with check (true);
drop policy if exists bill_items_delete_all on public.bill_items;
create policy bill_items_delete_all on public.bill_items for delete to anon using (true);

drop policy if exists bill_payments_select_all on public.bill_payments;
create policy bill_payments_select_all on public.bill_payments for select to anon using (true);
drop policy if exists bill_payments_insert_all on public.bill_payments;
create policy bill_payments_insert_all on public.bill_payments for insert to anon with check (true);
drop policy if exists bill_payments_update_all on public.bill_payments;
create policy bill_payments_update_all on public.bill_payments for update to anon using (true) with check (true);
drop policy if exists bill_payments_delete_all on public.bill_payments;
create policy bill_payments_delete_all on public.bill_payments for delete to anon using (true);

drop policy if exists attachments_select_all on public.attachments;
create policy attachments_select_all on public.attachments for select to anon using (true);
drop policy if exists attachments_insert_all on public.attachments;
create policy attachments_insert_all on public.attachments for insert to anon with check (true);
drop policy if exists attachments_update_all on public.attachments;
create policy attachments_update_all on public.attachments for update to anon using (true) with check (true);
drop policy if exists attachments_delete_all on public.attachments;
create policy attachments_delete_all on public.attachments for delete to anon using (true);

drop policy if exists attachments_bucket_select_all on storage.objects;
create policy attachments_bucket_select_all
on storage.objects
for select
to anon
using (bucket_id = 'attachments');

drop policy if exists attachments_bucket_insert_all on storage.objects;
create policy attachments_bucket_insert_all
on storage.objects
for insert
to anon
with check (bucket_id = 'attachments');

drop policy if exists attachments_bucket_update_all on storage.objects;
create policy attachments_bucket_update_all
on storage.objects
for update
to anon
using (bucket_id = 'attachments')
with check (bucket_id = 'attachments');

drop policy if exists attachments_bucket_delete_all on storage.objects;
create policy attachments_bucket_delete_all
on storage.objects
for delete
to anon
using (bucket_id = 'attachments');
