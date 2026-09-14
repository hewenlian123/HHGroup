begin;
-- Local compatibility phase: additive state; no historical inference or cost redefinition.
set lock_timeout = '5s';
set statement_timeout = '60s';

-- Local reset target only: no live writers; nullable FK has no historical values.
-- squawk-ignore adding-foreign-key-constraint
alter table public.expenses add column source_worker_receipt_id uuid references public.worker_receipts(id) on delete restrict;
-- Transactional local-only migration; new relation/nullable identity, no hosted rollout.
-- squawk-ignore require-concurrent-index-creation
create unique index expenses_worker_receipt_identity on public.expenses(source_worker_receipt_id);

create table public.expense_operations (
  expense_id uuid primary key references public.expenses(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  review_state text not null default 'pending' check (review_state in ('pending','approved')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  posted_at timestamptz,
  posted_by uuid references auth.users(id),
  check ((review_state = 'approved') = (approved_at is not null)),
  check ((approved_at is null) = (approved_by is null)),
  check ((posted_at is null) = (posted_by is null)),
  check (posted_at is null or approved_at is not null)
);
comment on table public.expense_operations is 'Explicit operations evidence only. Absent row means Unknown / Legacy. Posting does not define canonical project cost.';

create table public.expense_source_links (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  source_kind text not null check (source_kind in ('worker_receipt','receipt_queue','bank_transaction','attachment')),
  source_key text not null check (length(source_key) between 1 and 1024),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  unique (source_kind,source_key)
);
-- Transactional local-only migration; new relation/nullable identity, no hosted rollout.
-- squawk-ignore require-concurrent-index-creation
create index expense_source_links_expense on public.expense_source_links(expense_id);
-- Existing historical bank associations are not backfilled or guessed.
-- Transactional local-only migration; new relation/nullable identity, no hosted rollout.
-- squawk-ignore require-concurrent-index-creation
create unique index expense_source_links_single_bank on public.expense_source_links(expense_id)
  where source_kind = 'bank_transaction';

create table public.expense_review_issues (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  kind text not null check (kind in ('request_info','exception','duplicate')),
  message text not null check (length(btrim(message)) between 1 and 2000),
  related_expense_id uuid references public.expenses(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  resolution text check (length(btrim(resolution)) between 1 and 2000),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  check (related_expense_id is distinct from expense_id),
  check ((resolved_at is null) = (resolution is null)),
  check ((resolved_at is null) = (resolved_by is null))
);
-- Transactional local-only migration; new relation/nullable identity, no hosted rollout.
-- squawk-ignore require-concurrent-index-creation
create index expense_review_issues_open on public.expense_review_issues(expense_id) where resolved_at is null;

create table public.expense_operation_events (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  actor_id uuid references auth.users(id),
  action text not null,
  request_id uuid unique,
  request jsonb,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
-- Transactional local-only migration; new relation/nullable identity, no hosted rollout.
-- squawk-ignore require-concurrent-index-creation
create index expense_operation_events_expense on public.expense_operation_events(expense_id,created_at);

alter table public.expense_operations enable row level security;
alter table public.expense_source_links enable row level security;
alter table public.expense_review_issues enable row level security;
alter table public.expense_operation_events enable row level security;
create policy company_read on public.expense_operations for select to authenticated using (private.can_access_company());
create policy company_read on public.expense_source_links for select to authenticated using (private.can_access_company());
create policy company_read on public.expense_review_issues for select to authenticated using (private.can_access_company());
create policy company_read on public.expense_operation_events for select to authenticated using (private.can_access_company());
revoke all on public.expense_operations,public.expense_source_links,public.expense_review_issues,public.expense_operation_events from public,anon,authenticated,service_role;
grant select on public.expense_operations,public.expense_source_links,public.expense_review_issues,public.expense_operation_events to authenticated,service_role;

create function private.preserve_expense_operation_evidence()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Expense source and audit evidence is append-only.' using errcode='42501';
end $$;
create trigger preserve_evidence before update or delete on public.expense_source_links
for each row execute function private.preserve_expense_operation_evidence();
create trigger preserve_evidence before update or delete on public.expense_operation_events
for each row execute function private.preserve_expense_operation_evidence();
revoke all on function private.preserve_expense_operation_evidence() from public,anon,authenticated,service_role;

create function public.transition_expense_operation(
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
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('message','issue_id','related_expense_id')) then
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
        or exists(select 1 from public.expense_lines where expense_id=e.id and (project_id is null or nullif(btrim(category),'') is null))
        or e.total is distinct from (select sum(amount) from public.expense_lines where expense_id=e.id) then
        raise exception 'Valid amount, project and category coding required.' using errcode='23514';
      end if;
      if e.source_type='reimbursement' or e.worker_id is not null then
        raise exception 'Use canonical Worker Receipt approval.' using errcode='23514';
      end if;
      if e.payment_account_id is null then raise exception 'Payment account required.' using errcode='23514'; end if;
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
revoke all on function public.transition_expense_operation(uuid,integer,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.transition_expense_operation(uuid,integer,uuid,text,jsonb) to authenticated;

-- Old approval endpoints must respect persistent blockers too.
create function private.guard_expense_review_blockers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','reviewed','paid','reimbursed','reimbursable')
    and exists(select 1 from public.expense_review_issues where expense_id=old.id and resolved_at is null) then
    raise exception 'Expense has unresolved review blockers.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger expense_review_blockers before update on public.expenses
for each row execute function private.guard_expense_review_blockers();
revoke all on function private.guard_expense_review_blockers() from public,anon,authenticated,service_role;

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
    select * into r from public.worker_receipts where id=e.source_worker_receipt_id;
    if current_user<>'postgres' or tg_op='DELETE' or r.id is null or r.canonical_ingested_at is null
      or e.source_id is distinct from r.id::text or e.source_type is distinct from 'reimbursement'
      or e.status is distinct from 'draft' or e.worker_id is distinct from r.worker_id
      or e.project_id is distinct from r.project_id or e.amount is distinct from r.amount or e.total is distinct from r.amount then
      raise exception 'Invalid provisional Worker Expense identity.';
    end if;
    if tg_table_name='expense_lines' then
      if new.amount is distinct from r.amount or new.project_id is distinct from r.project_id
        or (tg_op='UPDATE' and to_jsonb(new) is distinct from to_jsonb(old))
        or (tg_op='INSERT' and exists(select 1 from public.expense_lines where expense_id=e.id)) then
        raise exception 'Provisional Worker Expense line is immutable.';
      end if;
    elsif tg_op='UPDATE' then
      if (to_jsonb(new)-array['source','source_id','line_count']) is distinct from
        (to_jsonb(old)-array['source','source_id','line_count']) then
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

create or replace function public.intake_worker_receipt_atomic(p_receipt_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r public.worker_receipts%rowtype;
  w public.workers%rowtype;
  v_worker uuid; v_project uuid; v_amount numeric; v_date date; v_path text;
  v_normal jsonb; v_time timestamptz; v_expense uuid;
begin
  if auth.uid() is null or not private.can_access_company() or not exists(
    select 1 from auth.users u where u.id=auth.uid() and not coalesce(u.is_anonymous,false)) then
    raise exception 'Authenticated company intake required.' using errcode='42501';
  end if;
  if p_receipt_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('worker_id','worker_name','project_id','amount','expense_type','vendor','description','notes','receipt_date','receipt_url')) then
    raise exception 'Invalid intake fields; marker, lifecycle and created_at are database-owned.' using errcode='22023';
  end if;
  v_worker:=nullif(p_payload->>'worker_id','')::uuid;
  v_project:=nullif(p_payload->>'project_id','')::uuid;
  v_amount:=(p_payload->>'amount')::numeric;
  v_date:=(p_payload->>'receipt_date')::date;
  v_path:=p_payload->>'receipt_url';
  if v_worker is null or v_amount is null or v_amount<0.01 or v_amount>100000
    or v_amount::text in ('NaN','Infinity','-Infinity') or v_date is null
    or v_path is null or v_path !~ ('^uploads/'||p_receipt_id::text||'\.(jpg|png|webp|pdf)$')
    or not private.worker_receipt_upload_exists(v_path) then
    raise exception 'Valid Worker, amount, date and uploaded Receipt identity required.' using errcode='23514';
  end if;
  -- Normalize once after raw validation, before identity comparison and scaled-column storage.
  v_amount:=round(v_amount,2);
  if v_project is not null and not private.can_access_project(v_project) then
    raise exception 'Receipt project is outside authorized scope.' using errcode='42501';
  end if;
  if coalesce(p_payload->>'expense_type','Other') not in
    ('Building Materials','Tools','Food','Food / Meal','Transportation','Supplies','Equipment','Other')
    or length(coalesce(p_payload->>'vendor',''))>160 or length(coalesce(p_payload->>'description',''))>500
    or length(coalesce(p_payload->>'notes',''))>1000 then
    raise exception 'Invalid receipt intake text fields.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hh:worker-receipt-intake:'||p_receipt_id::text,0));
  select * into r from public.worker_receipts where id=p_receipt_id for update;
  select * into w from public.workers where id=v_worker for key share;
  if not found or nullif(btrim(p_payload->>'worker_name'),'') is distinct from w.name then
    raise exception 'Receipt Worker identity mismatch.' using errcode='23514';
  end if;
  v_normal:=jsonb_build_object('worker_id',v_worker,'worker_name',w.name,'project_id',v_project,
    'amount',v_amount,'expense_type',coalesce(p_payload->>'expense_type','Other'),
    'vendor',nullif(btrim(p_payload->>'vendor'),''),'description',nullif(btrim(p_payload->>'description'),''),
    'notes',nullif(btrim(p_payload->>'notes'),''),'receipt_date',v_date,'receipt_url',v_path);
  if r.id is not null then
    if r.canonical_ingested_at is null then raise exception 'LEGACY_UNVERIFIED: receipt is read-only.'; end if;
    if (select jsonb_object_agg(k,v) from jsonb_each(to_jsonb(r)) x(k,v) where v_normal ? k)
      is distinct from v_normal then raise exception 'Receipt intake identity reused with different content.' using errcode='23505'; end if;
    return to_jsonb(r);
  end if;
  -- Reject re-use of a known object; do not infer an association or promote legacy.
  if exists(select 1 from public.worker_receipts x where x.receipt_url=v_path
    or split_part(x.receipt_url,'?',1) like '%/'||v_path) then
    raise exception 'Receipt upload already recorded; do not re-intake historical evidence.' using errcode='23505';
  end if;
  v_time:=clock_timestamp();
  insert into public.worker_receipts(id,worker_id,worker_name,project_id,amount,expense_type,vendor,
    description,notes,receipt_date,receipt_url,status,canonical_ingested_at,created_at)
  values(p_receipt_id,v_worker,w.name,v_project,v_amount,v_normal->>'expense_type',v_normal->>'vendor',
    v_normal->>'description',v_normal->>'notes',v_date,v_path,'Pending',v_time,v_time) returning * into r;
  insert into public.expenses(expense_date,vendor_name,vendor,notes,total,amount,line_count,status,
    source,source_id,source_type,worker_id,project_id,source_worker_receipt_id,receipt_url)
  values(v_date,r.vendor,r.vendor,r.notes,v_amount,v_amount,1,'draft',
    'worker_receipt',r.id::text,'reimbursement',v_worker,v_project,r.id,v_path) returning id into v_expense;
  insert into public.expense_lines(expense_id,project_id,amount,total,category)
    values(v_expense,v_project,v_amount,v_amount,r.expense_type);
  insert into public.expense_operations(expense_id) values(v_expense);
  insert into public.expense_source_links(expense_id,source_kind,source_key,evidence,created_by)
    values(v_expense,'worker_receipt',r.id::text,to_jsonb(r),auth.uid());
  insert into public.expense_operation_events(expense_id,actor_id,action,after_state)
    values(v_expense,auth.uid(),'worker_intake',jsonb_build_object('receipt',to_jsonb(r),'status','draft'));

  return to_jsonb(r);
end $$;

create or replace function public.approve_worker_receipt_atomic(
  p_receipt_id uuid, p_actor_user_id uuid, p_expected_worker_id uuid,
  p_expected_amount numeric, p_expected_project_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.worker_receipts%rowtype;
  o public.worker_reimbursements%rowtype;
  v_company uuid;
  v_reused boolean := false; v_expense uuid; v_before jsonb;
begin
  select * into r from public.worker_receipts where id=p_receipt_id for update;
  if not found then raise exception using errcode='P0002',message='Receipt not found.'; end if;
  if r.canonical_ingested_at is null then raise exception 'LEGACY_UNVERIFIED: Receipt approval is blocked.'; end if;
  v_company := private.assert_worker_receipt_approval_actor(p_actor_user_id);
  select id into v_expense from public.expenses where source_worker_receipt_id=r.id for update;
  if v_expense is not null and exists(select 1 from public.expense_review_issues where expense_id=v_expense and resolved_at is null) then
    raise exception 'Resolve Worker Receipt review blockers before approval.';
  end if;
  if (r.status in ('Pending','Approved')) is not true then
    raise exception using errcode='23514',message='Receipt is not approvable.';
  end if;
  p_expected_amount:=round(p_expected_amount,2);
  if r.worker_id is null or r.worker_id is distinct from p_expected_worker_id
    or r.amount is null or r.amount <= 0 or r.amount::text in ('NaN','Infinity','-Infinity')
    or r.amount is distinct from p_expected_amount
    or r.project_id is distinct from p_expected_project_id then
    raise exception using errcode='23514',message='Invalid or changed receipt worker, amount or project.';
  end if;
  perform 1 from public.workers where id=r.worker_id for update;
  if not found then raise exception using errcode='23514',message='Receipt worker not found.'; end if;
  if r.project_id is not null then
    perform 1 from public.projects where id=r.project_id and organization_id=v_company for share;
    if not found then raise exception using errcode='42501',message='Receipt project is outside the company.'; end if;
  end if;
  select * into o from public.worker_reimbursements where source_worker_receipt_id=r.id for update;
  if found then
    if r.status is distinct from 'Approved' or r.reimbursement_id is distinct from o.id
      or o.worker_id is distinct from r.worker_id or o.amount is distinct from r.amount
      or o.project_id is distinct from r.project_id then
      raise exception using errcode='23514',message='HISTORICAL_LINK_CONFLICT';
    end if;
    perform private.validate_worker_reimbursement_sources(array[o.id],r.worker_id);
    v_reused := true;
  else
    if r.status is distinct from 'Pending' or r.reimbursement_id is not null then
      raise exception using errcode='23514',message='HISTORICAL_LINK_CONFLICT';
    end if;
    insert into public.worker_reimbursements
      (source_worker_receipt_id,worker_id,project_id,amount,vendor,description,receipt_url,status,reimbursement_date)
    values (r.id,r.worker_id,r.project_id,r.amount,r.vendor,
      coalesce(nullif(concat_ws(' · ',nullif(r.vendor,''),nullif(r.expense_type,'')),''),r.description),
      r.receipt_url,'pending',(current_timestamp at time zone 'UTC')::date)
    returning * into o;
    update public.worker_receipts set reimbursement_id=o.id,status='Approved',rejection_reason=null
    where id=r.id returning * into r;
    if not found then raise exception using errcode='23514',message='Receipt link failed.'; end if;
  end if;
  if v_expense is not null and not v_reused then
    select to_jsonb(s) into v_before from public.expense_operations s where expense_id=v_expense for update;
    update public.expenses set source='worker_reimbursement',source_id=o.id::text where id=v_expense;
    update public.expense_operations set review_state='approved',approved_at=clock_timestamp(),approved_by=p_actor_user_id,revision=revision+1
      where expense_id=v_expense;
    insert into public.expense_operation_events(expense_id,actor_id,action,before_state,after_state)
      values(v_expense,p_actor_user_id,'worker_approve',v_before,jsonb_build_object('receipt_id',r.id,'obligation_id',o.id,'status','draft'));
  end if;
  return jsonb_build_object('receipt',to_jsonb(r),'obligation',to_jsonb(o),
    'receipt_id',r.id,'reimbursement_id',o.id,'amount',o.amount,'reused',v_reused);
end;
$$;

create or replace function public.create_paid_reimbursement_expense()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.worker_payments%rowtype;
  v_expense_id uuid;
  v_source_id public.expenses.source_id%type;
  v_line_count integer := 0;
  v_vendor text;
  v_notes text;
begin
  if lower(btrim(coalesce(new.status, ''))) <> 'paid' or new.payment_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and lower(btrim(coalesce(old.status, ''))) = 'paid'
    and old.payment_id is not distinct from new.payment_id
  then
    return new;
  end if;

  select wp.*
  into v_payment
  from public.worker_payments wp
  where wp.id = new.payment_id;
  if not found then
    raise exception using errcode = '23514', message = 'Reimbursement worker payment is missing.';
  end if;

  select e.id
  into v_expense_id
  from public.expenses e
  where e.source = 'worker_reimbursement'
    and e.source_id::text = new.id::text
  for update;

  if found then
    if not exists (
      select 1
      from public.expenses e
      where e.id = v_expense_id
        and e.source_type = 'reimbursement'
        and lower(btrim(coalesce(e.status, ''))) in ('draft','approved','paid')
        and e.worker_id is not distinct from new.worker_id
        and e.project_id is not distinct from new.project_id
        and e.amount is not distinct from new.amount
        and e.total is not distinct from new.amount
    ) then
      raise exception using errcode = '23514', message = 'Existing reimbursement expense does not match the reimbursement.';
    end if;
    select count(*) into v_line_count
    from public.expense_lines el
    where el.expense_id = v_expense_id
      and el.project_id is not distinct from new.project_id
      and el.amount is not distinct from new.amount;
    if v_line_count <> 1 or (select count(*) from public.expense_lines where expense_id=v_expense_id) <> 1 then
      raise exception using errcode = '23514', message = 'Existing reimbursement expense line is incomplete.';
    end if;
    update public.expenses set status='paid',payment_method=v_payment.payment_method,
      expense_date=case when status='draft' then coalesce(v_payment.payment_date,current_date) else expense_date end
    where id=v_expense_id and lower(btrim(status)) in ('draft','approved');
    return new;
  end if;

  v_source_id := new.id;
  v_vendor := coalesce(nullif(btrim(coalesce(new.vendor, '')), ''), 'Worker Reimbursement');
  v_notes := coalesce(
    nullif(btrim(coalesce(v_payment.note, '')), ''),
    nullif(btrim(coalesce(new.description, '')), '')
  );

  insert into public.expenses (
    expense_date,
    vendor_name,
    vendor,
    payment_method,
    reference_no,
    notes,
    total,
    amount,
    line_count,
    status,
    source,
    source_id,
    source_type,
    worker_id,
    project_id
  )
  values (
    coalesce(v_payment.payment_date, current_date),
    v_vendor,
    v_vendor,
    coalesce(nullif(btrim(coalesce(v_payment.payment_method, '')), ''), '—'),
    'REIM-' || new.id::text,
    v_notes,
    new.amount,
    new.amount,
    1,
    'paid',
    'worker_reimbursement',
    v_source_id,
    'reimbursement',
    new.worker_id,
    new.project_id
  )
  returning id into v_expense_id;

  insert into public.expense_lines (expense_id, project_id, amount, total)
  values (v_expense_id, new.project_id, new.amount, new.amount);

  return new;
end;
$$;

-- Keep receipt mirrors fail-closed until an explicit atomic correction path is used.
create function private.guard_worker_receipt_expense_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.worker_id,new.project_id,new.amount,new.receipt_url) is distinct from row(old.worker_id,old.project_id,old.amount,old.receipt_url)
    and exists(select 1 from public.expenses where source_worker_receipt_id=old.id) then
    raise exception 'Receipt has a canonical Expense; financial identity cannot be edited independently.';
  end if;
  return new;
end $$;
create trigger worker_receipt_expense_identity before update on public.worker_receipts
for each row execute function private.guard_worker_receipt_expense_identity();
revoke all on function private.guard_worker_receipt_expense_identity() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

commit;
