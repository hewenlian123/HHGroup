-- Atomically void a Payment Received and its exact financial links.
--
-- This preserves the existing status and reconciliation semantics while
-- replacing the former application-side Deposit -> Allocation -> Payment
-- write chain. No legacy fuzzy matching is permitted inside this mutation.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.void_payment_received_atomic(
  p_payment_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_payment public.payments_received%rowtype;
  v_invoice public.invoices%rowtype;
  v_allocation public.invoice_payments%rowtype;
  v_deposit public.deposits%rowtype;
  v_deposit_count integer := 0;
  v_paid_total numeric := 0;
  v_balance_due numeric := 0;
  v_next_status text;
  v_reused boolean := false;
  v_count integer := 0;
begin
  if p_payment_id is null then
    raise exception using errcode = '22023', message = 'Payment id is required.';
  end if;

  -- Match the lock order used by Payment update: Payment, Invoice,
  -- Allocation, then Deposit. The transaction owns every financial row before
  -- its first write, so competing update/void requests serialize safely.
  select payment.*
  into v_payment
  from public.payments_received as payment
  where payment.id = p_payment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Payment not found.';
  end if;
  if v_payment.invoice_id is null then
    raise exception using errcode = '23514', message = 'Payment Invoice association is missing.';
  end if;

  select invoice.*
  into v_invoice
  from public.invoices as invoice
  where invoice.id = v_payment.invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;

  select allocation.*
  into v_allocation
  from public.invoice_payments as allocation
  where allocation.payment_received_id = p_payment_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'Payment allocation is missing or ambiguous.';
  end if;

  select count(*)
  into v_deposit_count
  from public.deposits as deposit
  where deposit.payment_id = p_payment_id;
  if v_deposit_count <> 1 then
    raise exception using errcode = '23514', message = 'Payment deposit is missing or ambiguous.';
  end if;

  select deposit.*
  into v_deposit
  from public.deposits as deposit
  where deposit.payment_id = p_payment_id
  for update;

  if v_allocation.invoice_id is distinct from v_payment.invoice_id
    or v_allocation.amount is distinct from v_payment.amount
  then
    raise exception using errcode = '23514', message = 'Payment allocation association is inconsistent.';
  end if;
  if v_deposit.invoice_id is distinct from v_payment.invoice_id
    or v_deposit.project_id is distinct from v_payment.project_id
    or v_deposit.customer_name is distinct from v_payment.customer_name
    or v_deposit.amount is distinct from v_payment.amount
  then
    raise exception using errcode = '23514', message = 'Payment deposit association is inconsistent.';
  end if;

  v_reused := lower(btrim(coalesce(v_payment.status, 'completed'))) = 'void';

  if v_reused then
    if coalesce(v_allocation.status, 'Posted') <> 'Voided'
      or lower(btrim(coalesce(v_deposit.status, 'recorded'))) <> 'void'
    then
      raise exception using errcode = '23514', message = 'Voided Payment links are inconsistent.';
    end if;
  else
    if coalesce(v_allocation.status, 'Posted') = 'Voided'
      or lower(btrim(coalesce(v_deposit.status, 'recorded'))) = 'void'
    then
      raise exception using errcode = '23514', message = 'Active Payment links are inconsistent.';
    end if;

    update public.deposits
    set status = 'void'
    where id = v_deposit.id
      and lower(btrim(coalesce(status, 'recorded'))) <> 'void';
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '23514', message = 'Payment deposit was not voided.';
    end if;

    update public.invoice_payments
    set status = 'Voided'
    where id = v_allocation.id
      and coalesce(status, 'Posted') <> 'Voided';
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '23514', message = 'Payment allocation was not voided.';
    end if;

    update public.payments_received
    set status = 'void'
    where id = p_payment_id
      and lower(btrim(coalesce(status, 'completed'))) <> 'void';
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '23514', message = 'Payment was not voided.';
    end if;
  end if;

  select coalesce(sum(allocation.amount), 0)
  into v_paid_total
  from public.invoice_payments as allocation
  where allocation.invoice_id = v_payment.invoice_id
    and coalesce(allocation.status, 'Posted') <> 'Voided';

  v_balance_due := greatest(0, coalesce(v_invoice.total, 0) - v_paid_total);
  v_next_status := case
    when lower(btrim(coalesce(v_invoice.status, ''))) = 'void' then v_invoice.status
    when v_paid_total + 0.0000001 >= coalesce(v_invoice.total, 0) then 'Paid'
    when v_paid_total > 0.0000001 then 'Partially Paid'
    when lower(btrim(coalesce(v_invoice.status, ''))) <> 'draft' then 'Sent'
    else 'Draft'
  end;

  if v_reused then
    if v_invoice.paid_total is distinct from v_paid_total
      or v_invoice.balance_due is distinct from v_balance_due
      or v_invoice.status is distinct from v_next_status
    then
      raise exception using errcode = '23514', message = 'Voided Payment Invoice reconciliation is inconsistent.';
    end if;
  else
    update public.invoices
    set
      paid_total = v_paid_total,
      balance_due = v_balance_due,
      status = v_next_status
    where id = v_payment.invoice_id;
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '23514', message = 'Payment Invoice was not reconciled.';
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'invoice_id', v_payment.invoice_id,
    'project_id', v_payment.project_id,
    'deposit_id', v_deposit.id,
    'invoice_payment_id', v_allocation.id,
    'invoice_status', v_next_status,
    'paid_total', v_paid_total,
    'balance_due', v_balance_due,
    'reused', v_reused
  );
end
$function$;

comment on function public.void_payment_received_atomic(uuid)
  is 'Atomically voids one Payment Received, its exact Deposit and Invoice allocation, and reconciles the Invoice without changing amounts or associations.';

revoke all on function public.void_payment_received_atomic(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.void_payment_received_atomic(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
