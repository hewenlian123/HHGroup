-- Link an existing unapplied receipt onto an open invoice in one transaction.
-- A voided invoice_payments row still occupies the unique payment_received_id
-- index, so the link reactivates that row instead of inserting a second one.
-- Posted allocations still cannot move between invoices.
-- This file is the forward migration only. Do not apply it outside local/CI.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.guard_invoice_allocation_balance()
returns trigger language plpgsql security invoker set search_path = '' as $guard$
declare v_invoice public.invoices%rowtype; v_invoice_id uuid; v_paid numeric;
begin
  v_invoice_id := case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
  if tg_op='UPDATE' and new.invoice_id is distinct from old.invoice_id then
    if not (
      coalesce(old.status, 'Posted') = 'Voided'
      and coalesce(new.status, 'Posted') = 'Posted'
    ) then
      raise exception 'Invoice allocation reassignment is not permitted.' using errcode='23514';
    end if;
  end if;
  select * into v_invoice from public.invoices where id=v_invoice_id for update;
  if not found then
    -- A parent invoice deletion may cascade into its allocations.
    if tg_op='DELETE' then return old; end if;
    raise exception 'Invoice not found.' using errcode='P0002';
  end if;
  if tg_op='DELETE' then return old; end if;
  if coalesce(new.status,'Posted')<>'Voided' then
    if new.amount is null or new.amount<=0 or new.amount::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Invoice payment amount must be positive and finite.' using errcode='23514';
    end if;
    if lower(btrim(v_invoice.status)) in ('draft','void') then
      raise exception 'Only issued invoices can receive payments.' using errcode='23514';
    end if;
    select coalesce(sum(amount),0) into v_paid from public.invoice_payments
    where invoice_id=v_invoice_id and id<>new.id and coalesce(status,'Posted')<>'Voided';
    if v_paid+new.amount>v_invoice.total then
      raise exception 'Payment exceeds remaining invoice balance.' using errcode='23514';
    end if;
  end if;
  return new;
end $guard$;

create or replace function public.link_unapplied_payment_to_invoice(
  p_payment_id uuid,
  p_invoice_id uuid
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
  v_posted public.invoice_payments%rowtype;
  v_generated "char";
  v_payment_date_writable boolean := false;
  v_count integer := 0;
  v_already boolean := false;
  v_memo text;
  v_paid_total numeric;
  v_balance_due numeric;
  v_customer_match boolean := false;
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform pg_catalog.set_config('statement_timeout', '60s', true);

  if p_payment_id is null or p_invoice_id is null then
    raise exception using errcode = '22023', message = 'Choose an invoice for this payment.';
  end if;

  select a.attgenerated
  into v_generated
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'invoice_payments'
    and a.attname = 'payment_date'
    and a.attnum > 0
    and not a.attisdropped;
  if v_generated is null then
    raise exception using errcode = '42703', message = 'invoice_payments.payment_date is missing.';
  end if;
  v_payment_date_writable := v_generated = '';

  -- Payment, target invoice, then the existing allocation. Pointer updates
  -- happen only after the allocation write, in this same transaction.
  select payment.*
  into v_payment
  from public.payments_received as payment
  where payment.id = p_payment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Payment not found.';
  end if;
  if lower(btrim(coalesce(v_payment.status, ''))) in (
    'void', 'voided', 'cancelled', 'canceled', 'rejected', 'deleted'
  ) then
    raise exception using errcode = '23514', message = 'Voided payments cannot be linked.';
  end if;
  if v_payment.amount is null
    or v_payment.amount <= 0
    or v_payment.amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = '23514', message = 'Payment amount must be positive.';
  end if;
  if v_payment.payment_date is null then
    raise exception using errcode = '23514', message = 'Payment date is required.';
  end if;

  select invoice.*
  into v_invoice
  from public.invoices as invoice
  where invoice.id = p_invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;

  select allocation.*
  into v_allocation
  from public.invoice_payments as allocation
  where allocation.payment_received_id = p_payment_id
  for update;

  if found and coalesce(v_allocation.status, 'Posted') <> 'Voided' then
    if v_allocation.invoice_id is distinct from p_invoice_id then
      raise exception using
        errcode = '23514',
        message = 'This payment is already applied to another invoice.';
    end if;
    if round(v_allocation.amount, 2) is distinct from round(v_payment.amount, 2) then
      raise exception using
        errcode = '23514',
        message = 'This payment is already applied with a different amount.';
    end if;
    v_already := true;
  else
    if v_payment.project_id is null
      or v_invoice.project_id is null
      or v_payment.project_id is distinct from v_invoice.project_id then
      raise exception using
        errcode = '23514',
        message = 'Choose an open invoice for the same project.';
    end if;
    v_customer_match :=
      (
        v_payment.customer_id is not null
        and v_invoice.customer_id is not null
        and v_payment.customer_id = v_invoice.customer_id
      )
      or (
        length(btrim(coalesce(v_payment.customer_name, ''))) > 0
        and lower(btrim(v_payment.customer_name))
          = lower(btrim(coalesce(v_invoice.client_name, '')))
      );
    if not v_customer_match then
      raise exception using
        errcode = '23514',
        message = 'Choose an open invoice for the same customer.';
    end if;
    if lower(btrim(coalesce(v_invoice.status, ''))) = 'draft' then
      raise exception using
        errcode = '23514',
        message = 'Only issued invoices can receive payments.';
    end if;
    if lower(btrim(coalesce(v_invoice.status, ''))) in ('void', 'voided') then
      raise exception using
        errcode = '23514',
        message = 'Voided invoices cannot receive payments.';
    end if;
    if lower(btrim(coalesce(v_invoice.status, ''))) = 'paid' then
      raise exception using errcode = '23514', message = 'This invoice is already paid.';
    end if;
    if v_invoice.balance_due is null then
      raise exception using errcode = '23514', message = 'Invoice balance is unavailable.';
    end if;
    if round(v_payment.amount, 2) > round(v_invoice.balance_due, 2) then
      raise exception using errcode = '23514', message = 'Payment exceeds the invoice balance.';
    end if;

    v_memo := nullif(btrim(coalesce(v_payment.notes, '')), '');
    if found then
      if v_payment_date_writable then
        update public.invoice_payments
        set
          invoice_id = p_invoice_id,
          paid_at = v_payment.payment_date::date,
          payment_date = v_payment.payment_date::date,
          amount = v_payment.amount,
          method = v_payment.payment_method,
          memo = v_memo,
          status = 'Posted'
        where id = v_allocation.id
          and coalesce(status, 'Posted') = 'Voided';
      else
        update public.invoice_payments
        set
          invoice_id = p_invoice_id,
          paid_at = v_payment.payment_date::date,
          amount = v_payment.amount,
          method = v_payment.payment_method,
          memo = v_memo,
          status = 'Posted'
        where id = v_allocation.id
          and coalesce(status, 'Posted') = 'Voided';
      end if;
      get diagnostics v_count = row_count;
      if v_count <> 1 then
        raise exception using
          errcode = '23514',
          message = 'Payment allocation was not reactivated.';
      end if;
    elsif v_payment_date_writable then
      insert into public.invoice_payments (
        invoice_id,
        paid_at,
        payment_date,
        amount,
        method,
        memo,
        status,
        payment_received_id
      )
      values (
        p_invoice_id,
        v_payment.payment_date::date,
        v_payment.payment_date::date,
        v_payment.amount,
        v_payment.payment_method,
        v_memo,
        'Posted',
        p_payment_id
      );
      get diagnostics v_count = row_count;
      if v_count <> 1 then
        raise exception using errcode = '23514', message = 'Payment link did not post an allocation.';
      end if;
    else
      insert into public.invoice_payments (
        invoice_id,
        paid_at,
        amount,
        method,
        memo,
        status,
        payment_received_id
      )
      values (
        p_invoice_id,
        v_payment.payment_date::date,
        v_payment.amount,
        v_payment.payment_method,
        v_memo,
        'Posted',
        p_payment_id
      );
      get diagnostics v_count = row_count;
      if v_count <> 1 then
        raise exception using errcode = '23514', message = 'Payment link did not post an allocation.';
      end if;
    end if;
  end if;

  update public.payments_received
  set
    invoice_id = p_invoice_id,
    project_id = v_invoice.project_id,
    customer_name = coalesce(v_invoice.client_name, ''),
    customer_id = case
      when v_invoice.customer_id is not null then v_invoice.customer_id
      else customer_id
    end
  where id = p_payment_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'Failed to attach the payment to the invoice.';
  end if;

  update public.deposits
  set
    invoice_id = p_invoice_id,
    project_id = v_invoice.project_id,
    customer_name = coalesce(v_invoice.client_name, '')
  where payment_id = p_payment_id;

  select posted.*
  into v_posted
  from public.invoice_payments as posted
  where posted.payment_received_id = p_payment_id
    and posted.invoice_id = p_invoice_id
    and posted.status = 'Posted'
    and round(posted.amount, 2) = round(v_payment.amount, 2);
  if not found or v_posted.id is null then
    raise exception using errcode = '23514', message = 'Payment link did not post an allocation.';
  end if;
  if not v_already and (
    v_posted.paid_at::date is distinct from v_payment.payment_date::date
    or v_posted.payment_date is distinct from v_posted.paid_at
  ) then
    raise exception using errcode = '23514', message = 'Payment allocation date was not recorded.';
  end if;

  select invoice.paid_total, invoice.balance_due
  into v_paid_total, v_balance_due
  from public.invoices as invoice
  where invoice.id = p_invoice_id;
  if v_paid_total is null or v_balance_due is null or v_invoice.project_id is null then
    raise exception using errcode = '23514', message = 'Invoice paid total is unavailable.';
  end if;

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'project_id', v_invoice.project_id,
    'invoice_payment_id', v_posted.id,
    'paid_total', v_paid_total,
    'balance_due', v_balance_due,
    'already_applied', v_already
  );
end
$function$;

comment on function public.link_unapplied_payment_to_invoice(uuid, uuid)
  is 'Atomically posts or reactivates one invoice allocation for an existing receipt and aligns the receipt and deposit invoice pointers.';

revoke all on function public.link_unapplied_payment_to_invoice(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.link_unapplied_payment_to_invoice(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
