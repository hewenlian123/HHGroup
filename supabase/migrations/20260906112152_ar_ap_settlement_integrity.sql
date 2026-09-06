-- Extend existing settlement contracts without changing accrued project cost.
set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.payments_received add column if not exists customer_id uuid references public.customers(id) on delete set null;
-- Existing receipts retain their historical fields. New receipts inherit the invoice customer.

create or replace function public.record_payment_received_atomic(
  p_idempotency_key text,
  p_invoice_id uuid,
  p_project_id uuid,
  p_customer_name text,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_deposit_account text,
  p_notes text,
  p_attachment_url text,
  p_attachments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_fingerprint text;
  v_existing public.payments_received%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_deposit_id uuid;
  v_allocation_id uuid;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_next_status text;
  v_count integer := 0;
begin
  if v_key = '' or length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Payment idempotency key is required.';
  end if;
  if p_invoice_id is null or p_payment_date is null or p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount, 2) <= 0 or p_amount <> round(p_amount, 2) then
    raise exception using errcode = '22023', message = 'Invalid payment request.';
  end if;
  if v_method is null then
    raise exception using errcode = '22023', message = 'Payment method is required.';
  end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    raise exception using errcode = '22023', message = 'Payment attachments must be an array.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_attachments) a(value)
    where jsonb_typeof(a.value) <> 'object'
      or coalesce(a.value->>'file_type', '') not in ('image', 'pdf')
  ) then
    raise exception using errcode = '22023', message = 'Invalid payment attachment metadata.';
  end if;

  select i.* into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;
  if (p_project_id is not null and p_project_id is distinct from v_invoice.project_id)
    or (nullif(btrim(p_customer_name), '') is not null and btrim(p_customer_name) is distinct from btrim(v_invoice.client_name)) then
    raise exception using errcode = '23514', message = 'Payment must retain the invoice project and customer.';
  end if;

  v_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'project_id', p_project_id,
      'customer_name', coalesce(p_customer_name, ''),
      'payment_date', p_payment_date,
      'amount', p_amount,
      'payment_method', v_method,
      'deposit_account', p_deposit_account,
      'notes', p_notes,
      'attachment_url', p_attachment_url,
      'attachments', p_attachments
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hh:payment-received:' || v_key, 0)
  );

  select p.*
  into v_existing
  from public.payments_received p
  where p.idempotency_key = v_key
  for update;

  if found then
    if v_existing.atomic_completed_at is null then
      raise exception using errcode = '23514', message = 'Existing payment idempotency record is incomplete.';
    end if;
    if v_existing.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'Payment idempotency key was reused with different content.';
    end if;
    if v_existing.invoice_id is distinct from p_invoice_id
      or v_existing.amount is distinct from p_amount
      or v_existing.payment_date::date is distinct from p_payment_date
      or nullif(btrim(coalesce(v_existing.payment_method, '')), '') is distinct from v_method
    then
      raise exception using errcode = '23514', message = 'Existing atomic payment no longer matches its request.';
    end if;

    select d.id
    into v_deposit_id
    from public.deposits d
    where d.payment_id = v_existing.id
      and coalesce(d.status, 'recorded') <> 'void'
      and d.invoice_id is not distinct from v_existing.invoice_id
      and d.amount is not distinct from v_existing.amount;
    if not found then
      raise exception using errcode = '23514', message = 'Existing atomic payment is missing its deposit.';
    end if;

    select ip.id
    into v_allocation_id
    from public.invoice_payments ip
    where ip.payment_received_id = v_existing.id
      and ip.invoice_id is not distinct from v_existing.invoice_id
      and ip.amount is not distinct from v_existing.amount
      and coalesce(ip.status, 'Posted') <> 'Voided';
    if not found then
      raise exception using errcode = '23514', message = 'Existing atomic payment is missing its allocation.';
    end if;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'payment', to_jsonb(v_existing) || jsonb_build_object('attachments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at, a.id), '[]'::jsonb) from public.payment_received_attachments a where a.payment_id = v_existing.id)),
      'deposit_id', v_deposit_id,
      'invoice_payment_id', v_allocation_id,
      'invoice_status', (select i.status from public.invoices i where i.id = v_existing.invoice_id),
      'reused', true
    );
  end if;

  select i.*
  into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;

  if (p_project_id is not null and p_project_id is distinct from v_invoice.project_id)
    or (nullif(btrim(p_customer_name), '') is not null and btrim(p_customer_name) is distinct from btrim(v_invoice.client_name)) then
    raise exception 'Invoice association changed; refresh the invoice.' using errcode='23514';
  end if;
  if lower(btrim(v_invoice.status)) in ('draft', 'void') then
    raise exception using errcode = '23514', message = 'Only issued invoices can receive payments.';
  end if;

  select coalesce(sum(ip.amount), 0)
  into v_paid
  from public.invoice_payments ip
  where ip.invoice_id = p_invoice_id
    and coalesce(ip.status, 'Posted') <> 'Voided';

  v_remaining := greatest(0, coalesce(v_invoice.total, 0) - v_paid);
  if v_remaining <= 0.0000001 then
    raise exception using errcode = '23514', message = 'Invoice already fully paid';
  end if;
  if p_amount - v_remaining > 0.0000001 then
    raise exception using errcode = '23514', message = 'Payment exceeds remaining balance';
  end if;

  insert into public.payments_received (
    invoice_id,
    project_id,
    customer_id,
    customer_name,
    payment_date,
    amount,
    payment_method,
    deposit_account,
    notes,
    attachment_url,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    p_invoice_id,
    v_invoice.project_id,
    v_invoice.customer_id,
    coalesce(v_invoice.client_name, ''),
    p_payment_date,
    p_amount,
    v_method,
    p_deposit_account,
    p_notes,
    p_attachment_url,
    v_key,
    v_fingerprint
  )
  returning id into v_payment_id;

  select d.id
  into v_deposit_id
  from public.deposits d
  where d.payment_id = v_payment_id
    and coalesce(d.status, 'recorded') <> 'void';
  if not found then
    raise exception using errcode = '23514', message = 'Payment deposit was not created.';
  end if;

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
    p_payment_date,
    p_amount,
    v_method,
    coalesce(nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_deposit_account, '')), '')),
    'Posted',
    v_payment_id
  )
  returning id into v_allocation_id;

  if lower(btrim(coalesce(v_invoice.status, ''))) <> 'void' then
    v_next_status := case
      when v_paid + p_amount + 0.0000001 >= coalesce(v_invoice.total, 0) then 'Paid'
      when v_paid + p_amount > 0.0000001 then 'Partially Paid'
      when lower(btrim(coalesce(v_invoice.status, ''))) <> 'draft' then 'Sent'
      else 'Draft'
    end;
    update public.invoices
    set status = v_next_status
    where id = p_invoice_id;
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '23514', message = 'Invoice status was not updated.';
    end if;
  else
    v_next_status := v_invoice.status;
  end if;

  insert into public.payment_received_attachments (
    payment_id,
    file_url,
    file_name,
    mime_type,
    size_bytes,
    file_type
  )
  select
    v_payment_id,
    btrim(a.value->>'file_url'),
    btrim(a.value->>'file_name'),
    nullif(a.value->>'mime_type', ''),
    case
      when coalesce(a.value->>'size_bytes', '') ~ '^[0-9]+$' then (a.value->>'size_bytes')::bigint
      else null
    end,
    a.value->>'file_type'
  from jsonb_array_elements(p_attachments) a(value)
  where btrim(coalesce(a.value->>'file_url', '')) <> ''
    and btrim(coalesce(a.value->>'file_name', '')) <> '';

  update public.payments_received
  set atomic_completed_at = clock_timestamp()
  where id = v_payment_id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'payment', (select to_jsonb(p) || jsonb_build_object('attachments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at, a.id), '[]'::jsonb) from public.payment_received_attachments a where a.payment_id = p.id)) from public.payments_received p where p.id = v_payment_id),
    'deposit_id', v_deposit_id,
    'invoice_payment_id', v_allocation_id,
    'invoice_status', v_next_status,
    'reused', false
  );
end;
$$;

-- Distinct RPC name avoids ambiguous PostgREST overloads; old callers retain the hardened contract.
create or replace function public.record_invoice_receipt_atomic(
  p_idempotency_key text, p_invoice_id uuid, p_project_id uuid, p_customer_name text,
  p_payment_date date, p_amount numeric, p_payment_method text, p_deposit_account text,
  p_notes text, p_attachment_url text, p_attachments jsonb, p_customer_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_invoice public.invoices%rowtype; v_result jsonb;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice not found.' using errcode='P0002'; end if;
  if p_customer_id is not null and p_customer_id is distinct from v_invoice.customer_id then
    raise exception 'Payment customer must match the invoice.' using errcode='23514';
  end if;
  v_result := public.record_payment_received_atomic(p_idempotency_key,p_invoice_id,p_project_id,p_customer_name,p_payment_date,p_amount,p_payment_method,p_deposit_account,p_notes,p_attachment_url,p_attachments);
  if p_customer_id is not null and p_customer_id is distinct from nullif(v_result->'payment'->>'customer_id','')::uuid then
    raise exception 'Payment customer changed; refresh the invoice.' using errcode='23514';
  end if;
  return v_result;
end $$;
revoke all on function public.record_invoice_receipt_atomic(text,uuid,uuid,text,date,numeric,text,text,text,text,jsonb,uuid) from public,anon;
grant execute on function public.record_invoice_receipt_atomic(text,uuid,uuid,text,date,numeric,text,text,text,text,jsonb,uuid) to authenticated,service_role;

alter table public.ap_bill_payments add column if not exists idempotency_key text,
  add column if not exists idempotency_fingerprint text;
create unique index if not exists ap_bill_payments_intent_unique on public.ap_bill_payments(idempotency_key) where idempotency_key is not null;

-- Serialize every payment write at the parent row, including direct Data API inserts.
create or replace function public.guard_ap_bill_payment() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_bill public.ap_bills%rowtype; v_paid numeric;
begin
  if tg_op <> 'INSERT' then
    if auth.uid() is not null then
      raise exception 'Posted AP payments cannot be edited or deleted.' using errcode='23514';
    end if;
    if tg_op='DELETE' then return old; end if;
    if new.bill_id is distinct from old.bill_id then
      raise exception 'AP payment bill reassignment is not permitted.' using errcode='23514';
    end if;
  end if;
  select * into v_bill from public.ap_bills where id=new.bill_id for update;
  if not found then raise exception 'Bill not found.' using errcode='P0002'; end if;
  if new.amount <= 0 or new.amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'AP payment amount must be positive and finite.' using errcode='23514';
  end if;
  if tg_op='INSERT' then
    if v_bill.status not in ('Pending','Partially Paid') then
      raise exception 'Only pending bills can be paid.' using errcode='23514';
    end if;
    if auth.uid() is not null and nullif(btrim(new.idempotency_key),'') is null then
      raise exception 'AP payment idempotency key is required.' using errcode='23514';
    end if;
  end if;
  select coalesce(sum(amount),0) into v_paid from public.ap_bill_payments where bill_id=new.bill_id and id<>new.id;
  if v_paid + new.amount > v_bill.amount then
    raise exception 'Payment exceeds remaining bill balance.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger guard_ap_bill_payment before insert or update or delete on public.ap_bill_payments for each row execute function public.guard_ap_bill_payment();

-- Header edits must derive balances under the same row lock held by payment writes.
create or replace function public.guard_ap_bill_header() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_paid numeric; v_subcontract public.subcontracts%rowtype;
begin
  if new.amount < 0 or new.amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Bill amount must be finite and nonnegative.' using errcode='23514';
  end if;
  if new.subcontract_id is not null then
    select * into v_subcontract from public.subcontracts where id=new.subcontract_id;
    if not found or new.project_id is distinct from v_subcontract.project_id or new.subcontractor_id is distinct from v_subcontract.subcontractor_id then
      raise exception 'Bill subcontract, project and subcontractor must match.' using errcode='23514';
    end if;
  end if;
  select coalesce(sum(amount),0) into v_paid from public.ap_bill_payments where bill_id=new.id;
  if tg_op='UPDATE' and v_paid>0 and (new.amount is distinct from old.amount or new.project_id is distinct from old.project_id or new.subcontract_id is distinct from old.subcontract_id or new.subcontractor_id is distinct from old.subcontractor_id) then
    raise exception 'Paid bill financial fields cannot be changed.' using errcode='23514';
  end if;
  if v_paid>new.amount then raise exception 'Bill amount is below recorded payments.' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.status='Void' and new.status<>'Void' then
    raise exception 'Voided bills cannot be reopened.' using errcode='23514';
  end if;
  new.paid_amount:=v_paid;
  new.balance_amount:=greatest(new.amount-v_paid,0);
  if new.status<>'Void' then
    new.status:=case when v_paid>0 and new.balance_amount=0 then 'Paid' when v_paid>0 then 'Partially Paid' when new.status='Draft' then 'Draft' else 'Pending' end;
  end if;
  return new;
end $$;
create trigger guard_ap_bill_header before insert or update on public.ap_bills for each row execute function public.guard_ap_bill_header();

create or replace function public.record_ap_bill_payment_atomic(
  p_bill_id uuid,p_idempotency_key text,p_payment_date date,p_amount numeric,
  p_payment_method text default null,p_reference_no text default null,p_notes text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_bill public.ap_bills%rowtype; v_payment public.ap_bill_payments%rowtype; v_key text:=btrim(p_idempotency_key); v_fingerprint text;
begin
  if p_bill_id is null or coalesce(v_key,'')='' or length(v_key)>200 or p_payment_date is null or p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<=0 or p_amount<>round(p_amount,2) then
    raise exception 'Invalid AP payment request.' using errcode='22023';
  end if;
  v_fingerprint:=md5(jsonb_build_array(p_bill_id,p_payment_date,p_amount,p_payment_method,p_reference_no,p_notes)::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hh:ap-payment:'||v_key,0));
  select * into v_bill from public.ap_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found.' using errcode='P0002'; end if;
  select * into v_payment from public.ap_bill_payments where idempotency_key=v_key;
  if found then
    if v_payment.bill_id is distinct from p_bill_id or v_payment.idempotency_fingerprint is distinct from v_fingerprint then
      raise exception 'Payment idempotency key was reused with different content.' using errcode='23505';
    end if;
    return jsonb_build_object('payment',to_jsonb(v_payment),'reused',true);
  end if;
  if p_amount > v_bill.balance_amount then raise exception 'Payment exceeds remaining bill balance.' using errcode='23514'; end if;
  insert into public.ap_bill_payments(bill_id,payment_date,amount,payment_method,reference_no,notes,idempotency_key,idempotency_fingerprint,created_by)
  values(p_bill_id,p_payment_date,p_amount,p_payment_method,p_reference_no,p_notes,v_key,v_fingerprint,auth.uid()) returning * into v_payment;
  return jsonb_build_object('payment',to_jsonb(v_payment),'reused',false);
end $$;
revoke all on function public.record_ap_bill_payment_atomic(uuid,text,date,numeric,text,text,text) from public,anon;
grant execute on function public.record_ap_bill_payment_atomic(uuid,text,date,numeric,text,text,text) to authenticated,service_role;
notify pgrst,'reload schema';
