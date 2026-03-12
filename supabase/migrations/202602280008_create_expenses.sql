-- Expenses + Expense lines (Supabase-only source of truth)
create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expense_date date not null default current_date,
  vendor_name text not null default '',
  payment_method text not null default 'ACH',
  reference_no text null,
  notes text null,
  total numeric not null default 0,
  line_count integer not null default 0
);

create table if not exists public.expense_lines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  category text not null default 'Other',
  cost_code text null,
  memo text null,
  amount numeric not null default 0
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

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create or replace function public.recompute_expense_totals(target_expense_id uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric := 0;
  v_count integer := 0;
begin
  select coalesce(sum(amount), 0), count(*)
  into v_total, v_count
  from public.expense_lines
  where expense_id = target_expense_id;

  update public.expenses
  set total = v_total, line_count = v_count
  where id = target_expense_id;
end;
$$;

create or replace function public.trg_recompute_expense_totals()
returns trigger
language plpgsql
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.expense_id, old.expense_id, new.id, old.id);
  perform public.recompute_expense_totals(target_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_expense_lines_recompute_after_change on public.expense_lines;
create trigger trg_expense_lines_recompute_after_change
after insert or update or delete on public.expense_lines
for each row execute function public.trg_recompute_expense_totals();

-- Extend attachments entity_type check to include expenses (if attachments table exists)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'attachments'
  ) then
    -- Drop existing constraint if present and re-add with expanded enum.
    if exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'attachments'
        and constraint_name = 'attachments_entity_type_check'
    ) then
      alter table public.attachments drop constraint attachments_entity_type_check;
    end if;
    alter table public.attachments
      add constraint attachments_entity_type_check check (entity_type in ('subcontractor', 'bill', 'expense'));
  end if;
end $$;

-- RLS: dev-friendly open anon (lock down later with has_perm-based policies)
alter table public.expenses enable row level security;
alter table public.expense_lines enable row level security;

drop policy if exists expenses_select_all on public.expenses;
create policy expenses_select_all on public.expenses for select to anon using (true);
drop policy if exists expenses_insert_all on public.expenses;
create policy expenses_insert_all on public.expenses for insert to anon with check (true);
drop policy if exists expenses_update_all on public.expenses;
create policy expenses_update_all on public.expenses for update to anon using (true) with check (true);
drop policy if exists expenses_delete_all on public.expenses;
create policy expenses_delete_all on public.expenses for delete to anon using (true);

drop policy if exists expense_lines_select_all on public.expense_lines;
create policy expense_lines_select_all on public.expense_lines for select to anon using (true);
drop policy if exists expense_lines_insert_all on public.expense_lines;
create policy expense_lines_insert_all on public.expense_lines for insert to anon with check (true);
drop policy if exists expense_lines_update_all on public.expense_lines;
create policy expense_lines_update_all on public.expense_lines for update to anon using (true) with check (true);
drop policy if exists expense_lines_delete_all on public.expense_lines;
create policy expense_lines_delete_all on public.expense_lines for delete to anon using (true);

