-- Add subcontract status + subcontract bill due_date + update RPCs.

-- 1) Subcontracts: status lifecycle
alter table public.subcontracts
  add column if not exists status text not null default 'Draft';

-- Optional: keep values constrained (best-effort; safe if constraint already exists)
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'subcontracts'
      and constraint_name = 'subcontracts_status_check'
  ) then
    alter table public.subcontracts
      add constraint subcontracts_status_check
      check (status in ('Draft','Active','Completed','Cancelled'));
  end if;
end $$;

-- 2) Subcontract bills: due_date (nullable)
alter table public.subcontract_bills
  add column if not exists due_date date;

-- 3) Update bill creation guard to accept due_date
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
security definer
set search_path = public
as $$
declare
    v_contract_amount numeric;
    v_existing_total numeric;
begin
    -- Get contract amount
    select contract_amount
    into v_contract_amount
    from public.subcontracts
    where id = p_subcontract_id;

    -- Get total existing bills (exclude voided bills)
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

-- 4) Update payment recorder: set bill status Partial/Paid
create or replace function public.record_subcontract_payment(
    p_subcontract_id uuid,
    p_bill_id uuid,
    p_payment_date date,
    p_amount numeric,
    p_method text,
    p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_bill_amount numeric;
    v_total_payments numeric;
begin
    insert into public.subcontract_payments (
        subcontract_id,
        bill_id,
        payment_date,
        amount,
        method,
        note
    )
    values (
        p_subcontract_id,
        p_bill_id,
        p_payment_date,
        p_amount,
        p_method,
        p_note
    );

    if p_bill_id is not null then
        select amount into v_bill_amount
        from public.subcontract_bills
        where id = p_bill_id;

        if v_bill_amount is not null then
            select coalesce(sum(amount), 0) into v_total_payments
            from public.subcontract_payments
            where bill_id = p_bill_id;

            if v_total_payments >= v_bill_amount then
                update public.subcontract_bills
                set status = 'Paid'
                where id = p_bill_id;
            elsif v_total_payments > 0 then
                update public.subcontract_bills
                set status = 'Partial'
                where id = p_bill_id
                  and status <> 'Void';
            end if;
        end if;
    end if;
end;
$$;

-- 5) Void a subcontract bill (keeps canonical cost clean; also reverses legacy projects.spent)
create or replace function public.void_subcontract_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row record;
begin
    select id, project_id, amount, status
    into v_row
    from public.subcontract_bills
    where id = p_bill_id
    for update;

    if not found then
        raise exception 'Bill not found';
    end if;

    if v_row.status = 'Void' then
        return;
    end if;

    update public.subcontract_bills
    set status = 'Void'
    where id = p_bill_id;

    -- Reverse legacy projects.spent only when previously counted
    if v_row.status in ('Approved','Paid') then
        update public.projects
        set spent = greatest(0, coalesce(spent, 0) - v_row.amount),
            updated_at = current_date
        where id = v_row.project_id;
    end if;
end;
$$;

