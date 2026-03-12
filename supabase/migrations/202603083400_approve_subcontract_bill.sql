-- Approve a subcontract bill: set status to Approved and add amount to project.spent.
-- Locks bill row, raises if already Approved. Single transaction.

create or replace function public.approve_subcontract_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row record;
begin
    -- Lock bill row
    select id, project_id, amount, status
    into v_row
    from public.subcontract_bills
    where id = p_bill_id
    for update;

    if not found then
        raise exception 'Bill not found';
    end if;

    if v_row.status = 'Approved' then
        raise exception 'Bill is already approved';
    end if;

    update public.subcontract_bills
    set status = 'Approved'
    where id = p_bill_id;

    update public.projects
    set spent = coalesce(spent, 0) + v_row.amount,
        updated_at = current_date
    where id = v_row.project_id;

end;
$$;
