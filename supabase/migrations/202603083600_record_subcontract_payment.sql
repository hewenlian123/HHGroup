-- Record a subcontract payment and optionally mark bill as Paid when total payments >= bill amount.
-- Does not modify projects.spent (already updated at approval).

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
            end if;
        end if;
    end if;
end;
$$;
