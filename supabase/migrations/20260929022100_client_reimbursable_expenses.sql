-- Client reimbursable expenses. Additive only.
-- Does not update existing expense or expense_lines rows.
-- client_reimbursable defaults false, so current job cost is unchanged.

begin;
set lock_timeout = '5s';
set statement_timeout = '60s';

create sequence if not exists public.client_reimbursement_request_seq;
revoke all on sequence public.client_reimbursement_request_seq from public, anon, authenticated;

create table if not exists public.client_reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null references public.projects (id) on delete restrict,
  request_no text not null unique,
  requested_on date not null,
  document_id uuid null references public.documents (id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

comment on table public.client_reimbursement_requests is
  'A client reimbursement PDF request. It does not change canonical project cost.';

alter table public.client_reimbursement_requests enable row level security;
drop policy if exists client_reimbursement_requests_admin on public.client_reimbursement_requests;
create policy client_reimbursement_requests_admin
  on public.client_reimbursement_requests
  for all
  to authenticated
  using (private.can_manage_company())
  with check (private.can_manage_company());

grant select, insert, update on public.client_reimbursement_requests to authenticated;
revoke all on public.client_reimbursement_requests from anon;

alter table public.expense_lines
  add column if not exists client_reimbursable boolean not null default false,
  add column if not exists client_reimbursement_status text,
  add column if not exists client_reimbursement_requested_on date,
  add column if not exists client_reimbursement_reimbursed_on date,
  add column if not exists client_reimbursement_amount numeric,
  add column if not exists client_reimbursement_payment_id uuid,
  add column if not exists client_reimbursement_request_id uuid;

-- NOT VALID avoids a full scan of existing expense lines. New writes are checked.
alter table public.expense_lines drop constraint if exists expense_lines_client_reimbursement_status_check;
alter table public.expense_lines
  add constraint expense_lines_client_reimbursement_status_check
  check (
    client_reimbursement_status is null
    or client_reimbursement_status in ('not_requested', 'requested', 'reimbursed')
  ) not valid;

alter table public.expense_lines drop constraint if exists expense_lines_client_reimbursement_payment_fkey;
alter table public.expense_lines
  add constraint expense_lines_client_reimbursement_payment_fkey
  foreign key (client_reimbursement_payment_id) references public.payments_received (id) on delete set null
  not valid;

alter table public.expense_lines drop constraint if exists expense_lines_client_reimbursement_request_fkey;
alter table public.expense_lines
  add constraint expense_lines_client_reimbursement_request_fkey
  foreign key (client_reimbursement_request_id) references public.client_reimbursement_requests (id) on delete set null
  not valid;

-- squawk-ignore require-concurrent-index-creation
create index if not exists expense_lines_client_reimbursable_idx
  on public.expense_lines (project_id)
  where client_reimbursable;

comment on column public.expense_lines.client_reimbursable is
  'True when the project client should repay this line. Existing lines stay false. The line amount still counts in job cost.';
comment on column public.expense_lines.client_reimbursement_status is
  'not_requested, requested, or reimbursed. Null until the line is marked reimbursable. Not an expense workflow status.';
comment on column public.expense_lines.client_reimbursement_amount is
  'Amount the client reimbursed. It is not subtracted from expense_lines.amount.';

create or replace function private.invalidate_expense_review_on_edit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; s public.expense_operations%rowtype;
begin
  if tg_table_name='expenses' then
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
    -- Client reimbursement flags are settlement with the client, not a coding change.
    if tg_op='UPDATE' and row(new.expense_id,new.project_id,new.category,new.cost_code,new.description,new.name,new.amount,new.qty,new.unit_cost,new.total)
      is not distinct from row(old.expense_id,old.project_id,old.category,old.cost_code,old.description,old.name,old.amount,old.qty,old.unit_cost,old.total)
    then return new; end if;
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

create or replace function public.set_expense_line_client_reimbursable(
  p_expense_id uuid,
  p_line_id uuid,
  p_reimbursable boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked integer;
begin
  if auth.uid() is null or not private.can_manage_company() then
    raise exception 'Company administrator required.' using errcode='42501';
  end if;
  if p_reimbursable then
    update public.expense_lines
    set client_reimbursable = true,
        client_reimbursement_status = coalesce(client_reimbursement_status, 'not_requested')
    where expense_id = p_expense_id
      and (p_line_id is null or id = p_line_id);
  else
    select count(*) into v_blocked
    from public.expense_lines
    where expense_id = p_expense_id
      and (p_line_id is null or id = p_line_id)
      and client_reimbursement_status in ('requested', 'reimbursed');
    if v_blocked > 0 then
      raise exception 'A requested or reimbursed line cannot be unmarked.' using errcode='23514';
    end if;
    update public.expense_lines
    set client_reimbursable = false,
        client_reimbursement_status = null,
        client_reimbursement_requested_on = null,
        client_reimbursement_reimbursed_on = null,
        client_reimbursement_amount = null,
        client_reimbursement_payment_id = null,
        client_reimbursement_request_id = null
    where expense_id = p_expense_id
      and (p_line_id is null or id = p_line_id);
  end if;
end $$;

create or replace function public.reserve_client_reimbursement_request(
  p_line_ids uuid[],
  p_requested_on date
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_org uuid;
  v_ready integer;
  v_request uuid;
  v_no text;
begin
  if auth.uid() is null or not private.can_manage_company() then
    raise exception 'Company administrator required.' using errcode='42501';
  end if;
  if p_requested_on is null or p_line_ids is null or cardinality(p_line_ids) < 1 then
    raise exception 'Choose at least one expense line.' using errcode='23514';
  end if;

  perform 1
  from public.expense_lines
  where id = any(p_line_ids)
  for update;

  select count(*) filter (
    where el.client_reimbursable
      and coalesce(el.client_reimbursement_status, 'not_requested') = 'not_requested'
      and el.project_id is not null
      and e.status in ('approved', 'reviewed', 'done', 'completed', 'paid', 'reimbursed', 'reimbursable')
  ), min(el.project_id::text)::uuid
  into v_ready, v_project
  from public.expense_lines el
  join public.expenses e on e.id = el.expense_id
  where el.id = any(p_line_ids);

  if v_ready is distinct from cardinality(p_line_ids) then
    raise exception 'Every selected line must be an approved client-reimbursable expense that has not been requested.' using errcode='23514';
  end if;
  if (select count(distinct project_id) from public.expense_lines where id = any(p_line_ids)) <> 1 then
    raise exception 'A reimbursement request can include only one project.' using errcode='23514';
  end if;

  select organization_id into v_org from public.projects where id = v_project;
  if v_org is null then
    raise exception 'Project organization is unavailable.' using errcode='23514';
  end if;

  v_no := 'CR-' || to_char(p_requested_on, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.client_reimbursement_request_seq')::text, 4, '0');

  insert into public.client_reimbursement_requests(
    organization_id, project_id, request_no, requested_on
  ) values (v_org, v_project, v_no, p_requested_on)
  returning id into v_request;

  return jsonb_build_object('request_id', v_request, 'request_no', v_no);
end $$;

create or replace function public.attach_client_reimbursement_document(
  p_request_id uuid,
  p_line_ids uuid[],
  p_document_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_on date;
  v_project uuid;
begin
  if auth.uid() is null or not private.can_manage_company() then
    raise exception 'Company administrator required.' using errcode='42501';
  end if;
  if p_document_id is null or p_request_id is null then
    raise exception 'Save the reimbursement PDF before marking lines requested.' using errcode='23514';
  end if;
  select requested_on, project_id into v_requested_on, v_project
  from public.client_reimbursement_requests
  where id = p_request_id
  for update;
  if v_requested_on is null then
    raise exception 'Reimbursement request was not found.' using errcode='23514';
  end if;
  if exists (
    select 1 from public.expense_lines
    where id = any(p_line_ids)
      and (
        project_id is distinct from v_project
        or not client_reimbursable
        or coalesce(client_reimbursement_status, 'not_requested') <> 'not_requested'
      )
  ) or (select count(*) from public.expense_lines where id = any(p_line_ids)) is distinct from cardinality(p_line_ids) then
    raise exception 'The selected expenses changed before the request was saved.' using errcode='23514';
  end if;

  update public.client_reimbursement_requests
  set document_id = p_document_id
  where id = p_request_id;

  update public.expense_lines
  set client_reimbursement_status = 'requested',
      client_reimbursement_requested_on = v_requested_on,
      client_reimbursement_request_id = p_request_id
  where id = any(p_line_ids);
end $$;

create or replace function public.settle_client_reimbursement(
  p_line_ids uuid[],
  p_reimbursed_on date,
  p_amount numeric,
  p_payment_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum numeric;
begin
  if auth.uid() is null or not private.can_manage_company() then
    raise exception 'Company administrator required.' using errcode='42501';
  end if;
  if p_reimbursed_on is null or p_line_ids is null or cardinality(p_line_ids) < 1 then
    raise exception 'Choose the reimbursed lines and date.' using errcode='23514';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the reimbursed amount.' using errcode='23514';
  end if;
  if p_payment_id is not null and not exists (
    select 1 from public.payments_received where id = p_payment_id
  ) then
    raise exception 'That customer payment was not found.' using errcode='23514';
  end if;

  select coalesce(sum(amount), 0) into v_sum
  from public.expense_lines
  where id = any(p_line_ids)
    and client_reimbursable
    and client_reimbursement_status in ('not_requested', 'requested');
  if (select count(*) from public.expense_lines
      where id = any(p_line_ids)
        and client_reimbursable
        and client_reimbursement_status in ('not_requested', 'requested'))
     is distinct from cardinality(p_line_ids) then
    raise exception 'Only open client-reimbursable lines can be marked reimbursed.' using errcode='23514';
  end if;
  if round(v_sum, 2) is distinct from round(p_amount, 2) then
    raise exception 'Reimbursed amount must equal the selected expense total.' using errcode='23514';
  end if;

  update public.expense_lines
  set client_reimbursement_status = 'reimbursed',
      client_reimbursement_reimbursed_on = p_reimbursed_on,
      client_reimbursement_amount = amount,
      client_reimbursement_payment_id = p_payment_id
  where id = any(p_line_ids);
end $$;

revoke all on function public.set_expense_line_client_reimbursable(uuid, uuid, boolean) from public, anon;
revoke all on function public.reserve_client_reimbursement_request(uuid[], date) from public, anon;
revoke all on function public.attach_client_reimbursement_document(uuid, uuid[], uuid) from public, anon;
revoke all on function public.settle_client_reimbursement(uuid[], date, numeric, uuid) from public, anon;
grant execute on function public.set_expense_line_client_reimbursable(uuid, uuid, boolean) to authenticated;
grant execute on function public.reserve_client_reimbursement_request(uuid[], date) to authenticated;
grant execute on function public.attach_client_reimbursement_document(uuid, uuid[], uuid) to authenticated;
grant execute on function public.settle_client_reimbursement(uuid[], date, numeric, uuid) to authenticated;

commit;
