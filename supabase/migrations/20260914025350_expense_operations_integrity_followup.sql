begin;
set lock_timeout='5s';
set statement_timeout='60s';
create or replace function private.guard_expense_review_blockers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Existing canonical guard independently verifies the exact trusted reversal.
  if old.status='paid' and new.status='approved' and old.source='worker_reimbursement'
    and exists(select 1 from public.worker_reimbursements o join public.worker_payment_reversals r on r.payment_id=o.payment_id
      where o.id::text=old.source_id) then return new; end if;
  if new.status is distinct from old.status and new.status in ('approved','reviewed','paid','reimbursed','reimbursable')
    and exists(select 1 from public.expense_review_issues where expense_id=old.id and resolved_at is null) then
    raise exception 'Expense has unresolved review blockers.' using errcode='23514';
  end if;
  return new;
end $$;
create or replace function public.transition_expense_operation(
  p_expense_id uuid,p_expected_revision integer,p_request_id uuid,p_action text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses%rowtype;
  s public.expense_operations%rowtype;
  prior public.expense_operation_events%rowtype;
  v_before jsonb; v_after jsonb; v_request jsonb; v_issue uuid;
begin
  if auth.uid() is null or not private.can_manage_company() then
    raise exception 'Company administrator required.' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_payload) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('message','issue_id','related_expense_id','cost_allocation')) then
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
      if e.payment_account_id is null and (e.source_type='receipt_upload' or e.reference_no like 'INBOX-UP-%') then raise exception 'Payment account required.' using errcode='23514'; end if;
      -- Existing receipt approval projection; paid/settled legacy states are never rewritten.
      if e.status in ('draft','pending','needs_review') then
        update public.expenses set status='approved' where id=e.id;
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
    if row(new.expense_date,new.vendor_name,new.project_id,new.category,new.amount,new.total,new.payment_account_id)
      is not distinct from row(old.expense_date,old.vendor_name,old.project_id,old.category,old.amount,old.total,old.payment_account_id) then return new; end if;
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
create or replace function private.record_expense_bank_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.expenses%rowtype; v_existing uuid;
begin
  if new.linked_expense_id is not distinct from old.linked_expense_id and new.amount is not distinct from old.amount then return new; end if;
  if new.linked_expense_id is null then
    if old.linked_expense_id is null then return new; end if;
    insert into public.expense_operation_events(expense_id,actor_id,action,before_state,after_state)
      values(old.linked_expense_id,auth.uid(),'bank_unmatch',to_jsonb(old),to_jsonb(new));
    return new;
  end if;
  select * into e from public.expenses where id=new.linked_expense_id for update;
  if not found or e.total is distinct from abs(new.amount) or new.amount=0 then
    raise exception 'Single bank match requires exact Expense amount.' using errcode='23514';
  end if;
  if exists(select 1 from public.bank_transactions where linked_expense_id=e.id and id<>new.id) then
    raise exception 'Expense already has a bank match.' using errcode='23505';
  end if;
  select expense_id into v_existing from public.expense_source_links where source_kind='bank_transaction' and source_key=new.id::text;
  if found then
    if v_existing<>e.id then raise exception 'Source reassignment requires reviewed resolution; existing evidence is preserved.' using errcode='23505'; end if;
  else
    insert into public.expense_source_links(expense_id,source_kind,source_key,evidence,created_by)
      values(e.id,'bank_transaction',new.id::text,to_jsonb(new),auth.uid());
  end if;
  insert into public.expense_operation_events(expense_id,actor_id,action,before_state,after_state)
    values(e.id,auth.uid(),'bank_match',to_jsonb(old),to_jsonb(new));
  return new;
end $$;
drop trigger expense_bank_source on public.bank_transactions;
create trigger expense_bank_source after insert or update on public.bank_transactions
for each row execute function private.record_expense_bank_source();
create function private.guard_matched_expense_amount()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.total is distinct from old.total and exists(select 1 from public.bank_transactions where linked_expense_id=old.id and abs(amount) is distinct from new.total) then
    raise exception 'Unmatch the bank transaction before changing its Expense amount.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger matched_expense_amount before update on public.expenses for each row execute function private.guard_matched_expense_amount();
revoke all on function private.guard_matched_expense_amount() from public,anon,authenticated,service_role;
create or replace function public.match_bank_expense_operation(p_bank_id uuid,p_expense_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bank_transactions%rowtype;
begin
  if auth.uid() is null or not private.can_manage_company() then raise exception 'Company administrator required.' using errcode='42501'; end if;
  if p_expense_id is null then raise exception 'Expense identity required.' using errcode='22023'; end if;
  select * into b from public.bank_transactions where id=p_bank_id for update;
  if not found then raise exception 'Bank transaction not found.' using errcode='P0002'; end if;
  if b.linked_expense_id=p_expense_id then return; end if;
  if b.linked_expense_id is not null then raise exception 'Bank transaction already matched.' using errcode='23505'; end if;
  update public.bank_transactions set linked_expense_id=p_expense_id,status='reconciled',reconcile_type='Expense',reconciled_at=clock_timestamp(),reconciled_by=auth.uid()::text where id=b.id;
end $$;
create or replace function private.guard_worker_receipt_expense_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.worker_id,new.project_id,new.amount,new.receipt_url) is distinct from row(old.worker_id,old.project_id,old.amount,old.receipt_url)
    and exists(select 1 from public.expenses where source_worker_receipt_id=old.id) then
    if current_user<>'postgres' or old.status is distinct from 'Pending' or new.status is distinct from 'Pending'
      or old.reimbursement_id is not null or new.reimbursement_id is not null
      or row(new.worker_id,new.amount,new.receipt_url) is distinct from row(old.worker_id,old.amount,old.receipt_url)
      or not exists(select 1 from public.expenses where source_worker_receipt_id=old.id and source='worker_receipt' and status='draft') then
      raise exception 'Receipt has a canonical Expense; financial identity cannot be edited independently.';
    end if;
  end if;
  return new;
end $$;
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
      if (to_jsonb(new)-array['source','source_id','line_count','project_id','category','notes']) is distinct from
        (to_jsonb(old)-array['source','source_id','line_count','project_id','category','notes']) then
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

create function public.code_provisional_worker_expense(p_expense_id uuid,p_revision bigint,p_project_id uuid,p_category text,p_memo text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.expenses%rowtype; r public.worker_receipts%rowtype; s public.expense_operations%rowtype;
begin
  if auth.uid() is null or not private.can_manage_company() then raise exception 'Company administrator required.' using errcode='42501'; end if;
  select * into e from public.expenses where id=p_expense_id;
  select * into r from public.worker_receipts where id=e.source_worker_receipt_id for update;
  select * into e from public.expenses where id=p_expense_id for update;
  select * into s from public.expense_operations where expense_id=e.id for update;
  if r.id is null or r.status is distinct from 'Pending' or e.status is distinct from 'draft' or e.source is distinct from 'worker_receipt'
    or s.expense_id is null or s.revision is distinct from p_revision or s.posted_at is not null then
    raise exception 'Pending provisional receipt changed; refresh before coding.' using errcode='40001';
  end if;
  if p_project_id is not null and not private.is_company_project(p_project_id) then raise exception 'Project outside company.' using errcode='42501'; end if;
  if nullif(btrim(p_category),'') is null or length(p_category)>160 or length(coalesce(p_memo,''))>1000 then raise exception 'Invalid coding fields.' using errcode='22023'; end if;
  update public.worker_receipts set project_id=p_project_id,notes=p_memo where id=r.id;
  update public.expenses set project_id=p_project_id,category=p_category,notes=p_memo where id=e.id;
  update public.expense_lines set project_id=p_project_id,category=p_category,description=p_memo where expense_id=e.id;
  if (select count(*) from public.expense_lines where expense_id=e.id and project_id is not distinct from p_project_id and amount=e.amount)<>1 then raise exception 'Provisional mirror mismatch.'; end if;
  update public.expense_operations set revision=revision+1 where expense_id=e.id;
  insert into public.expense_operation_events(expense_id,actor_id,action,before_state,after_state)
    values(e.id,auth.uid(),'worker_coding',to_jsonb(r),jsonb_build_object('project_id',p_project_id,'category',p_category,'memo',p_memo));
end $$;
revoke all on function public.code_provisional_worker_expense(uuid,bigint,uuid,text,text) from public,anon,service_role;
grant execute on function public.code_provisional_worker_expense(uuid,bigint,uuid,text,text) to authenticated;

-- A deferred invariant rejects partial receipt/header/line project updates, including direct privileged writes.
create function private.check_provisional_worker_coding()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where source_worker_receipt_id=new.id;
  if e.id is not null and e.source='worker_receipt' and (e.project_id is distinct from (select project_id from public.worker_receipts where id=new.id)
    or exists(select 1 from public.expense_lines where expense_id=e.id and project_id is distinct from (select project_id from public.worker_receipts where id=new.id))) then
    raise exception 'Provisional receipt coding must be updated atomically.' using errcode='23514';
  end if;
  return null;
end $$;
create constraint trigger provisional_worker_coding after update on public.worker_receipts
  deferrable initially deferred for each row execute function private.check_provisional_worker_coding();
revoke all on function private.check_provisional_worker_coding() from public,anon,authenticated,service_role;

create function public.approve_worker_expense_operation(p_expense_id uuid,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.expenses%rowtype; r public.worker_receipts%rowtype; s public.expense_operations%rowtype;
begin
  if auth.uid() is null or not private.can_manage_company() then raise exception 'Company administrator required.' using errcode='42501'; end if;
  select * into e from public.expenses where id=p_expense_id;
  select * into r from public.worker_receipts where id=e.source_worker_receipt_id for update;
  select * into e from public.expenses where id=p_expense_id for update;
  select * into s from public.expense_operations where expense_id=e.id for update;
  if r.id is null or s.expense_id is null or s.revision is distinct from p_revision then raise exception 'Worker review changed; refresh before approving.' using errcode='40001'; end if;
  return public.approve_worker_receipt_atomic(r.id,auth.uid(),r.worker_id,r.amount,r.project_id);
end $$;
revoke all on function public.approve_worker_expense_operation(uuid,bigint) from public,anon,service_role;
grant execute on function public.approve_worker_expense_operation(uuid,bigint) to authenticated;

create view public.expense_intake_sources with (security_invoker=true) as
select 'upload:'||q.id::text as id,q.id as source_id,'upload'::text as source_kind,q.created_at,
  q.vendor_name as title,q.amount::text as amount,q.status::text as status,null::uuid as expense_id
from public.receipt_queue q
union all
select 'worker:'||r.id::text,r.id,'worker',r.created_at,coalesce(r.vendor,r.worker_name,'Worker receipt'),r.amount::text,r.status,e.id
from public.worker_receipts r left join public.expenses e on e.source_worker_receipt_id=r.id
union all
select 'bank:'||b.id::text,b.id,'bank',b.created_at,b.description,b.amount::text,b.status,b.linked_expense_id
from public.bank_transactions b;
revoke all on public.expense_intake_sources from public,anon,authenticated,service_role;
grant select on public.expense_intake_sources to authenticated;
notify pgrst,'reload schema';
commit;
