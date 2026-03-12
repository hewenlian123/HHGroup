-- Guard: create subcontract bill only if existing total + new amount <= contract amount.

create or replace function public.create_subcontract_bill_guard(
    p_subcontract_id uuid,
    p_project_id uuid,
    p_bill_date date,
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

    -- Get total existing bills
    select coalesce(sum(amount), 0)
    into v_existing_total
    from public.subcontract_bills
    where subcontract_id = p_subcontract_id;

    if v_existing_total + p_amount > v_contract_amount then
        raise exception 'Bill exceeds subcontract contract amount';
    end if;

    insert into public.subcontract_bills (
        subcontract_id,
        project_id,
        bill_date,
        amount,
        description,
        status
    )
    values (
        p_subcontract_id,
        p_project_id,
        p_bill_date,
        p_amount,
        p_description,
        'Pending'
    );

end;
$$;
