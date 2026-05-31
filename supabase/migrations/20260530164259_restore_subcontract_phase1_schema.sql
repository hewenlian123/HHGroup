-- Phase 1 subcontractor foundation schema repair.
-- Safe/idempotent: no drops, truncates, deletes, or destructive rewrites.
-- Purpose:
-- - restore subcontracts.status after remote_schema drift
-- - restore subcontract_bills.due_date after remote_schema drift
-- - add the six-argument bill guard overload expected by current app code

alter table if exists public.subcontracts
  add column if not exists status text not null default 'Draft';

do $$
begin
  if to_regclass('public.subcontracts') is not null
     and not exists (
       select 1
       from information_schema.table_constraints
       where table_schema = 'public'
         and table_name = 'subcontracts'
         and constraint_name = 'subcontracts_status_check'
     ) then
    alter table public.subcontracts
      add constraint subcontracts_status_check
      check (status in ('Draft', 'Active', 'Completed', 'Cancelled'))
      not valid;
  end if;
end $$;

notify pgrst, 'reload schema';

alter table if exists public.subcontract_bills
  add column if not exists due_date date;

create or replace function public.create_subcontract_bill_guard(
  p_subcontract_id uuid,
  p_project_id uuid,
  p_bill_date date,
  p_due_date date,
  p_amount numeric,
  p_description text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contract_amount numeric;
  v_existing_total numeric;
begin
  select contract_amount
  into v_contract_amount
  from public.subcontracts
  where id = p_subcontract_id;

  select coalesce(sum(amount), 0)
  into v_existing_total
  from public.subcontract_bills
  where subcontract_id = p_subcontract_id
    and status <> 'Void';

  if v_existing_total + p_amount > v_contract_amount then
    raise exception 'Bill exceeds subcontract contract amount';
  end if;

  insert into public.subcontract_bills (
    subcontract_id,
    project_id,
    bill_date,
    due_date,
    amount,
    description,
    status
  )
  values (
    p_subcontract_id,
    p_project_id,
    p_bill_date,
    p_due_date,
    p_amount,
    p_description,
    'Pending'
  );
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subcontracts'
      and column_name = 'status'
  ) then
    comment on column public.subcontracts.status is
      'Phase 1 subcontract lifecycle status. Contract amount remains committed cost only.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subcontract_bills'
      and column_name = 'due_date'
  ) then
    comment on column public.subcontract_bills.due_date is
      'Optional subcontract bill due date for AP aging displays.';
  end if;
end $$;
