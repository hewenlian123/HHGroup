-- Additive inbox OCR + unpaid expense settlement.
-- Does not update existing expense business rows. New columns stay null
-- (inbox_capture defaults false) until a new upload or an explicit approval sets them.

begin;
set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.expenses
  add column if not exists ocr_status text,
  add column if not exists ocr_error text,
  add column if not exists ocr_confidence jsonb,
  add column if not exists ocr_claimed_at timestamptz,
  add column if not exists due_date date,
  add column if not exists subtotal numeric,
  add column if not exists tax_amount numeric,
  add column if not exists vendor_id uuid,
  add column if not exists vendor_suggestion text,
  add column if not exists file_sha256 text,
  add column if not exists inbox_capture boolean not null default false,
  add column if not exists payment_status text,
  add column if not exists paid_on date,
  add column if not exists duplicate_expense_id uuid,
  add column if not exists duplicate_reason text,
  add column if not exists duplicate_dismissed_at timestamptz;

-- NOT VALID avoids a full-table scan of existing expenses. New writes are checked.
-- Existing nulls already satisfy these predicates, and this migration does not rewrite them.
alter table public.expenses drop constraint if exists expenses_ocr_status_check;
alter table public.expenses
  add constraint expenses_ocr_status_check
  check (ocr_status is null or ocr_status in ('pending', 'processing', 'done', 'failed')) not valid;

alter table public.expenses drop constraint if exists expenses_payment_status_check;
alter table public.expenses
  add constraint expenses_payment_status_check
  check (payment_status is null or payment_status in ('unpaid', 'paid')) not valid;

alter table public.expenses drop constraint if exists expenses_vendor_id_fkey;
alter table public.expenses
  add constraint expenses_vendor_id_fkey
  foreign key (vendor_id) references public.vendors (id) on delete set null not valid;

alter table public.expenses drop constraint if exists expenses_duplicate_expense_id_fkey;
alter table public.expenses
  add constraint expenses_duplicate_expense_id_fkey
  foreign key (duplicate_expense_id) references public.expenses (id) on delete set null not valid;

-- squawk-ignore require-concurrent-index-creation
create index if not exists expenses_ocr_queue_idx
  on public.expenses (created_at)
  where ocr_status in ('pending', 'processing');

-- squawk-ignore require-concurrent-index-creation
create index if not exists expenses_file_sha256_idx
  on public.expenses (file_sha256)
  where file_sha256 is not null;

-- squawk-ignore require-concurrent-index-creation
create index if not exists expenses_payment_status_idx
  on public.expenses (payment_status)
  where payment_status is not null;

comment on column public.expenses.ocr_status is 'Inbox OCR queue: pending, processing, done, or failed. Null on rows that are not inbox captures.';
comment on column public.expenses.inbox_capture is 'True only for inbox uploads created after this migration. Existing rows stay false.';
comment on column public.expenses.payment_status is 'Settlement after approval: unpaid or paid. Null means legacy and is not backfilled.';
comment on column public.expenses.file_sha256 is 'Receipt bytes fingerprint. Kept after reference_no becomes the vendor invoice number.';

create or replace function public.transition_expense_operation(
  p_expense_id uuid,p_expected_revision integer,p_request_id uuid,p_action text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses%rowtype;
  s public.expense_operations%rowtype;
  prior public.expense_operation_events%rowtype;
  v_before jsonb; v_after jsonb; v_request jsonb; v_issue uuid;
  v_settlement text;
  v_paid_on date;
begin
  if auth.uid() is null or not private.can_manage_company() then
    raise exception 'Company administrator required.' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_payload) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('message','issue_id','related_expense_id','cost_allocation','settlement','paid_on')) then
    raise exception 'Invalid operation request.' using errcode='22023';
  end if;
  select * into e from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found.' using errcode='P0002'; end if;
  v_request:=jsonb_build_object('expense_id',p_expense_id,'revision',p_expected_revision,'action',p_action,'payload',p_payload);
  select * into prior from public.expense_operation_events where request_id=p_request_id;
  if found then
    if prior.request is distinct from v_request or prior.actor_id is distinct from auth.uid() then
      raise exception 'Operation identity reused with different content.' using errcode='23505';
    end if;
    return prior.after_state;
  end if;
  insert into public.expense_operations(expense_id) values(p_expense_id) on conflict do nothing;
  select * into s from public.expense_operations where expense_id=p_expense_id for update;
  if s.revision <> p_expected_revision then raise exception 'Expense changed; refresh before retrying.' using errcode='40001'; end if;
  v_before:=to_jsonb(s);
  if p_action in ('request_info','exception','duplicate') then
    if s.posted_at is not null then raise exception 'Posted review cannot be changed.' using errcode='23514'; end if;
    insert into public.expense_review_issues(expense_id,kind,message,related_expense_id,created_by)
    values(e.id,p_action,p_payload->>'message',nullif(p_payload->>'related_expense_id','')::uuid,auth.uid()) returning id into v_issue;
  elsif p_action='resolve' then
    update public.expense_review_issues set resolution=p_payload->>'message',resolved_at=clock_timestamp(),resolved_by=auth.uid()
    where id=(p_payload->>'issue_id')::uuid and expense_id=e.id and resolved_at is null returning id into v_issue;
    if not found then raise exception 'Open issue not found.' using errcode='23514'; end if;
  elsif p_action in ('approve','post') then
    if exists(select 1 from public.expense_review_issues where expense_id=e.id and resolved_at is null) then
      raise exception 'Resolve Request Info, exceptions and duplicate quarantine first.' using errcode='23514';
    end if;
    if p_action='approve' then
      if s.review_state='approved' then raise exception 'Already approved.' using errcode='23514'; end if;
      if e.total is null or e.total<=0 or e.total::text in ('NaN','Infinity','-Infinity')
        or not exists(select 1 from public.expense_lines where expense_id=e.id)
        or exists(select 1 from public.expense_lines where expense_id=e.id and ((project_id is null and p_payload->>'cost_allocation' is distinct from 'overhead') or nullif(btrim(category),'') is null))
        or e.total is distinct from (select sum(amount) from public.expense_lines where expense_id=e.id) then
        raise exception 'Valid amount, project and category coding required.' using errcode='23514';
      end if;
      if e.source_type='reimbursement' or e.worker_id is not null then
        raise exception 'Use canonical Worker Receipt approval.' using errcode='23514';
      end if;
      v_settlement := coalesce(nullif(p_payload->>'settlement', ''), case when e.payment_account_id is null then 'unpaid' else 'paid' end);
      if v_settlement not in ('unpaid','paid') then
        raise exception 'Settlement must be unpaid or paid.' using errcode='22023';
      end if;
      if v_settlement='paid' and e.payment_account_id is null then
        raise exception 'Choose a payment account to mark this expense paid.' using errcode='23514';
      end if;
      v_paid_on := case
        when v_settlement='paid' then coalesce(nullif(p_payload->>'paid_on','')::date, e.expense_date)
        else null
      end;
      if e.status in ('draft','pending','needs_review') then
        update public.expenses
        set status='approved',
            payment_status=v_settlement,
            paid_on=v_paid_on
        where id=e.id;
      else
        update public.expenses
        set payment_status=v_settlement,
            paid_on=v_paid_on
        where id=e.id;
      end if;
      update public.expense_operations set review_state='approved',approved_at=clock_timestamp(),approved_by=auth.uid() where expense_id=e.id;
    else
      if s.review_state<>'approved' or s.posted_at is not null then raise exception 'Explicit approval required; already posted is immutable.' using errcode='23514'; end if;
      update public.expense_operations set posted_at=clock_timestamp(),posted_by=auth.uid() where expense_id=e.id;
    end if;
  else
    raise exception 'Unsupported operation.' using errcode='22023';
  end if;
  update public.expense_operations set revision=revision+1 where expense_id=e.id returning * into s;
  v_after:=to_jsonb(s)||jsonb_build_object('issue_id',v_issue);
  insert into public.expense_operation_events(expense_id,actor_id,action,request_id,request,before_state,after_state)
    values(e.id,auth.uid(),p_action,p_request_id,v_request,v_before,v_after);
  return v_after;
end $$;

create or replace function private.invalidate_expense_review_on_edit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; s public.expense_operations%rowtype;
begin
  if tg_table_name='expenses' then
    -- Payment account and settlement updates mark an approved expense paid later.
    -- They must not send the review back to pending. Coding changes still do.
    if row(new.expense_date,new.vendor_name,new.project_id,new.category,new.amount,new.total)
      is not distinct from row(old.expense_date,old.vendor_name,old.project_id,old.category,old.amount,old.total) then return new; end if;
    v_id:=new.id;
    if new.worker_id is not null then return new; end if;
  else
    if tg_op='UPDATE' and new.expense_id is distinct from old.expense_id then
      if exists(select 1 from public.expense_operations where expense_id in (old.expense_id,new.expense_id)) then
        raise exception 'Reviewed Expense lines cannot be reparented.' using errcode='23514';
      end if;
    end if;
    v_id:=case when tg_op='DELETE' then old.expense_id else new.expense_id end;
    if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
    if exists(select 1 from public.expenses where id=v_id and worker_id is not null) then return null; end if;
  end if;
  select * into s from public.expense_operations where expense_id=v_id for update;
  if not found then return null; end if;
  if s.posted_at is not null then raise exception 'Posted coding is locked; review correction required.' using errcode='23514'; end if;
  update public.expense_operations set revision=revision+1,review_state='pending',approved_at=null,approved_by=null where expense_id=v_id;
  insert into public.expense_operation_events(expense_id,actor_id,action,before_state,after_state)
    values(v_id,auth.uid(),'coding_changed',to_jsonb(old),case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end);
  return null;
end $$;

create or replace function public.claim_expense_ocr_jobs(p_limit integer)
returns table(expense_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_manage_company() then
    raise exception 'Company administrator required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 2 then
    raise exception 'Invalid OCR batch.' using errcode='22023';
  end if;
  return query
  with picked as (
    select e.id
    from public.expenses e
    where e.inbox_capture
      and (
        e.ocr_status = 'pending'
        or (
          e.ocr_status = 'processing'
          and e.ocr_claimed_at < clock_timestamp() - interval '10 minutes'
        )
      )
    order by e.created_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.expenses e
    set ocr_status = 'processing',
        ocr_claimed_at = clock_timestamp(),
        ocr_error = null
    from picked
    where e.id = picked.id
    returning e.id
  )
  select claimed.id from claimed;
end $$;

revoke all on function public.claim_expense_ocr_jobs(integer) from public, anon;
grant execute on function public.claim_expense_ocr_jobs(integer) to authenticated;

commit;
