begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- name is GENERATED ALWAYS AS (vendor_name), evaluated AFTER BEFORE triggers.
-- Compare the protected vendor_name; never compare its not-yet-computed alias.
-- https://www.postgresql.org/docs/17/ddl-generated-columns.html
create or replace function private.guard_expense_canonical_boundary()
returns trigger language plpgsql security invoker set search_path='' as $$
declare e public.expenses%rowtype; o public.worker_reimbursements%rowtype; r public.worker_receipts%rowtype;
begin
  if tg_table_name='expense_lines' then
   if tg_op='UPDATE' and new.expense_id is distinct from old.expense_id then
    if exists(select 1 from public.expenses x where x.id in (old.expense_id,new.expense_id)
      and (x.worker_id is not null or x.source='worker_reimbursement' or x.source_type='reimbursement')) then
      raise exception 'Worker Expense lines cannot be reparented.';
    end if;
   end if;
  end if;
  if tg_table_name='expense_lines' then
    select * into e from public.expenses where id=case when tg_op='DELETE' then old.expense_id else new.expense_id end;
  elsif tg_op='INSERT' then e:=new; else e:=old; end if;
  if tg_table_name='expenses' then
    if tg_op='UPDATE' and new.source_worker_receipt_id is distinct from old.source_worker_receipt_id then
      raise exception 'Permanent Worker Receipt identity is immutable.';
    end if;
  end if;
  if e.source_worker_receipt_id is not null and (e.worker_id is null
    or e.source_type is distinct from 'reimbursement' or e.source not in ('worker_receipt','worker_reimbursement')) then
    raise exception 'Permanent Worker Receipt identity requires canonical source.';
  end if;
  if e.worker_id is null and e.source is distinct from 'worker_reimbursement' and e.source_type is distinct from 'reimbursement' then
    -- A non-worker expense cannot be promoted through ordinary edits either.
    if tg_table_name='expenses' then
      if tg_op='UPDATE' and (new.worker_id is not null or new.source='worker_reimbursement' or new.source_type='reimbursement') then
        raise exception 'Worker reimbursement requires canonical Receipt intake.';
      end if;
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if e.source='worker_receipt' then
    if tg_table_name='expenses' then
      if tg_op='UPDATE' then e.project_id:=new.project_id; end if;
    end if;
    select * into r from public.worker_receipts where id=e.source_worker_receipt_id;
    if current_user<>'postgres' or tg_op='DELETE' or r.id is null or r.canonical_ingested_at is null
      or e.source_id is distinct from r.id::text or e.source_type is distinct from 'reimbursement'
      or e.status is distinct from 'draft' or e.worker_id is distinct from r.worker_id
      or e.project_id is distinct from r.project_id or e.amount is distinct from r.amount or e.total is distinct from r.amount then
      raise exception 'Invalid provisional Worker Expense identity.';
    end if;
    if tg_table_name='expense_lines' then
      if new.amount is distinct from r.amount or new.project_id is distinct from r.project_id
        or (tg_op='UPDATE' and (to_jsonb(new)-array['project_id','category','description']) is distinct from (to_jsonb(old)-array['project_id','category','description']))
        or (tg_op='INSERT' and exists(select 1 from public.expense_lines where expense_id=e.id)) then
        raise exception 'Provisional Worker Expense line is immutable.';
      end if;
    elsif tg_op='UPDATE' then
      if (to_jsonb(new)-array['name','source','source_id','line_count','project_id','category','notes']) is distinct from
        (to_jsonb(old)-array['name','source','source_id','line_count','project_id','category','notes']) then
        raise exception 'Provisional Worker Expense cannot change financial identity.';
      end if;
      if row(new.source,new.source_id) is distinct from row(old.source,old.source_id) and
        (new.source is distinct from 'worker_reimbursement' or new.source_id is distinct from r.reimbursement_id::text
          or not private.is_canonical_worker_obligation(r.reimbursement_id)) then
        raise exception 'Provisional binding requires the exact approved obligation.';
      end if;
    end if;
    return new;
  end if;
  select * into o from public.worker_reimbursements where id::text=e.source_id::text;
  if e.source is distinct from 'worker_reimbursement' or e.source_type is distinct from 'reimbursement'
    or not private.is_canonical_worker_obligation(o.id)
    or e.worker_id is distinct from o.worker_id or e.project_id is distinct from o.project_id
    or e.amount is distinct from o.amount or e.total is distinct from o.amount then
    raise exception 'LEGACY_UNVERIFIED: Worker Expense is read-only.';
  end if;
  if current_user<>'postgres' or tg_op='DELETE' then raise exception 'Worker Expense mutation requires canonical settlement.'; end if;
  if tg_table_name='expense_lines' then
    if new.amount is distinct from o.amount or new.project_id is distinct from o.project_id
      or (tg_op='UPDATE' and to_jsonb(new) is distinct from to_jsonb(old))
      or (tg_op='INSERT' and exists(select 1 from public.expense_lines where expense_id=e.id)) then
      raise exception 'Canonical reimbursement Expense line is immutable.';
    end if;
  else
    if tg_op='UPDATE' and row(new.id,new.worker_id,new.project_id,new.amount,new.total,new.source,new.source_id,new.source_type,new.created_at)
      is distinct from row(old.id,old.worker_id,old.project_id,old.amount,old.total,old.source,old.source_id,old.source_type,old.created_at) then
      raise exception 'Canonical reimbursement Expense identity is immutable.';
    end if;
    if lower(new.status) is not distinct from 'paid' then
      if o.status is distinct from 'paid' or o.payment_id is null then raise exception 'Expense settlement requires canonical payment.'; end if;
    elsif lower(new.status)='draft' and e.source_worker_receipt_id is not null and (tg_op='INSERT' or old.status='draft') then
      null;
    elsif lower(new.status) is distinct from 'approved' or (tg_op='UPDATE' and old.status='draft') then raise exception 'Invalid canonical Expense lifecycle.';
    elsif tg_op='UPDATE' and lower(old.status)='paid' and not exists(
      select 1 from public.worker_payment_reversals where payment_id=o.payment_id) then
      raise exception 'Expense reopen requires trusted reversal evidence.';
    end if;
  end if;
  return new;
end $$;

-- Existing uploads create canonical receipt_upload Expenses directly, not receipt_queue rows.
create or replace view public.expense_intake_sources with (security_invoker=true) as
select 'upload:'||q.id::text as id,q.id as source_id,'upload'::text as source_kind,q.created_at,
  q.vendor_name as title,q.amount::text as amount,q.status::text as status,null::uuid as expense_id
from public.receipt_queue q
union all
select 'worker:'||r.id::text,r.id,'worker',r.created_at,coalesce(r.vendor,r.worker_name,'Worker receipt'),r.amount::text,r.status,e.id
from public.worker_receipts r left join public.expenses e on e.source_worker_receipt_id=r.id
union all
select 'bank:'||b.id::text,b.id,'bank',b.created_at,b.description,b.amount::text,b.status,b.linked_expense_id
from public.bank_transactions b
union all
select 'expense-upload:'||e.id::text,e.id,'upload',e.created_at,e.vendor_name,e.total::text,e.status,e.id
from public.expenses e
where e.source_type='receipt_upload';

notify pgrst,'reload schema';
commit;
