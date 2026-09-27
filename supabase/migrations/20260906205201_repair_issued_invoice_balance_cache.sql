-- Repair only the confirmed legacy zero cache on one unpaid, issued invoice.
-- Draft/Void balances and all invoice/payment business values remain unchanged.
set lock_timeout = '5s';
set statement_timeout = '60s';

do $$
declare
  v_invoice public.invoices%rowtype;
  v_after public.invoices%rowtype;
  v_paid numeric;
  v_balance numeric;
  v_allocation_count bigint;
  v_repaired integer := 0;
begin
  -- Allocation mutations already lock the invoice before writing. Re-read the
  -- ledger after acquiring that same parent lock, including concurrent receipts.
  for v_invoice in
    select * from public.invoices
    where status not in ('Draft', 'Void') order by id for update
  loop
    select coalesce(sum(amount) filter (where coalesce(status, 'Posted') <> 'Voided'), 0), count(*)
      into v_paid, v_allocation_count
    from public.invoice_payments where invoice_id = v_invoice.id;
    if v_invoice.total is null or v_invoice.total < 0
      or v_invoice.total::text in ('NaN', 'Infinity', '-Infinity')
      or v_paid > v_invoice.total or v_invoice.paid_total is distinct from v_paid then
      raise exception 'Issued invoice balance repair requires reconciled totals and payments.' using errcode = '23514';
    end if;
    v_balance := greatest(v_invoice.total - v_paid, 0);
    if v_invoice.balance_due is not distinct from v_balance then continue; end if;
    if v_invoice.status <> 'Sent' or v_invoice.total <= 0
      or v_invoice.balance_due is distinct from 0::numeric
      or v_invoice.paid_total is distinct from 0::numeric or v_allocation_count <> 0 then
      raise exception 'Issued invoice balance discrepancy is outside the verified legacy zero-cache repair.' using errcode = '23514';
    end if;
    v_repaired := v_repaired + 1;
    if v_repaired > 1 then
      raise exception 'Issued invoice balance repair exceeds the verified one-row scope.' using errcode = '23514';
    end if;
    update public.invoices set balance_due = v_balance
      where id = v_invoice.id returning * into v_after;
    if (to_jsonb(v_after) - 'balance_due' - 'updated_at')
      is distinct from (to_jsonb(v_invoice) - 'balance_due' - 'updated_at') then
      raise exception 'Issued invoice cache repair changed a protected business field.' using errcode = '23514';
    end if;
  end loop;
end $$;
