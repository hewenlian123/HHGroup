-- Restore persisted invoice balance reconciliation at the shared allocation boundary.
-- Existing accrued amounts and historical rows are not rewritten by this migration.
set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.guard_invoice_allocation_balance()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_invoice public.invoices%rowtype; v_invoice_id uuid; v_paid numeric;
begin
  v_invoice_id := case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
  if tg_op='UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'Invoice allocation reassignment is not permitted.' using errcode='23514';
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
end $$;
create trigger guard_invoice_allocation_balance
before insert or update or delete on public.invoice_payments
for each row execute function public.guard_invoice_allocation_balance();

create or replace function public.derive_invoice_balance()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_paid numeric;
begin
  select coalesce(sum(amount),0) into v_paid from public.invoice_payments
  where invoice_id=new.id and coalesce(status,'Posted')<>'Voided';
  if v_paid>new.total then
    raise exception 'Invoice total is below recorded payments.' using errcode='23514';
  end if;
  new.paid_total:=v_paid;
  new.balance_due:=greatest(0,coalesce(new.total,0)-v_paid);
  if lower(btrim(new.status))<>'void' then
    if v_paid>0 then
      new.status:=case when new.balance_due=0 then 'Paid' else 'Partially Paid' end;
    elsif new.status in ('Paid','Partially Paid') then
      new.status:='Sent';
    end if;
  end if;
  return new;
end $$;
create trigger derive_invoice_balance before insert or update on public.invoices
for each row execute function public.derive_invoice_balance();

create or replace function public.refresh_invoice_allocation_balance()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- The parent BEFORE trigger derives all cached fields in one place under its row lock.
  update public.invoices set paid_total=paid_total
  where id=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
  return coalesce(new,old);
end $$;
create trigger refresh_invoice_allocation_balance
  after insert or update or delete on public.invoice_payments
  for each row execute function public.refresh_invoice_allocation_balance();

revoke all on function public.guard_invoice_allocation_balance(),
  public.derive_invoice_balance(),public.refresh_invoice_allocation_balance() from public,anon;
