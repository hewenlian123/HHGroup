-- T3 B: one receipt lock + one transaction; no compensating HTTP writes.
set lock_timeout = '5s';
set statement_timeout = '60s';

create function private.assert_worker_receipt_approval_actor(p_actor_user_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := private.company_organization_id();
begin
  if v_company is null or p_actor_user_id is null or not exists (
    select 1 from auth.users u join public.organization_memberships m on m.user_id=u.id
    where u.id=p_actor_user_id and not coalesce(u.is_anonymous,false)
      and u.raw_app_meta_data->>'role' in ('owner','admin')
      and m.organization_id=v_company and m.status='active' and m.role in ('owner','admin')
  ) then
    raise exception using errcode='42501', message='Worker receipt approval requires an active company owner/admin.';
  end if;
  return v_company;
end;
$$;
revoke all on function private.assert_worker_receipt_approval_actor(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.assert_worker_receipt_approval_actor(uuid) to service_role;

create function public.approve_worker_receipt_atomic(
  p_receipt_id uuid, p_actor_user_id uuid, p_expected_worker_id uuid,
  p_expected_amount numeric, p_expected_project_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r public.worker_receipts%rowtype;
  o public.worker_reimbursements%rowtype;
  v_company uuid;
  v_reused boolean := false;
begin
  select * into r from public.worker_receipts where id=p_receipt_id for update;
  if not found then raise exception using errcode='P0002',message='Receipt not found.'; end if;
  v_company := private.assert_worker_receipt_approval_actor(p_actor_user_id);
  if r.status not in ('Pending','Approved') then
    raise exception using errcode='23514',message='Receipt is not approvable.';
  end if;
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
    if r.status <> 'Approved' or r.reimbursement_id is distinct from o.id
      or o.worker_id is distinct from r.worker_id or o.amount is distinct from r.amount
      or o.project_id is distinct from r.project_id then
      raise exception using errcode='23514',message='HISTORICAL_LINK_CONFLICT';
    end if;
    v_reused := true;
  else
    if r.status <> 'Pending' or r.reimbursement_id is not null then
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
  return jsonb_build_object('receipt',to_jsonb(r),'obligation',to_jsonb(o),
    'receipt_id',r.id,'reimbursement_id',o.id,'amount',o.amount,'reused',v_reused);
end;
$$;
revoke all on function public.approve_worker_receipt_atomic(uuid,uuid,uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.approve_worker_receipt_atomic(uuid,uuid,uuid,numeric,uuid) to service_role;

-- Freeze the identity and reviewed financial fields after linking. Existing NULL sources stay NULL.
create function private.guard_worker_receipt_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name='worker_receipts' then
    if old.reimbursement_id is not null then
      if tg_op='DELETE' then raise exception 'Linked receipt cannot be deleted.'; end if;
      if row(new.id,new.reimbursement_id,new.status,new.worker_id,new.project_id,new.amount,new.receipt_url)
        is distinct from row(old.id,old.reimbursement_id,old.status,old.worker_id,old.project_id,old.amount,old.receipt_url) then
        raise exception using errcode='23514',message='Linked receipt financial identity is immutable.';
      end if;
    end if;
  else
    if tg_op='UPDATE' and new.source_worker_receipt_id is distinct from old.source_worker_receipt_id then
      raise exception 'Obligation source cannot be reassigned or backfilled by ordinary updates.';
    end if;
    if tg_op='DELETE' then
      if old.source_worker_receipt_id is not null or old.payment_id is not null then raise exception 'Receipt or paid obligation cannot be deleted.'; end if;
      return old;
    end if;
    if (old.source_worker_receipt_id is not null or old.payment_id is not null
      or exists(select 1 from public.worker_receipts where reimbursement_id=old.id)
      or exists(select 1 from public.expenses where source='worker_reimbursement' and source_id::text=old.id::text))
      and row(new.id,new.source_worker_receipt_id,new.worker_id,new.project_id,new.amount)
      is distinct from row(old.id,old.source_worker_receipt_id,old.worker_id,old.project_id,old.amount) then
      raise exception using errcode='23514',message='Obligation source and financial identity are immutable.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_worker_receipt_identity() from public,anon,authenticated,service_role;
create trigger worker_receipt_identity before update or delete on public.worker_receipts
for each row execute function private.guard_worker_receipt_identity();
create trigger worker_obligation_identity before update or delete on public.worker_reimbursements
for each row execute function private.guard_worker_receipt_identity();

create function private.check_worker_receipt_obligation_link()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.worker_receipts%rowtype; o public.worker_reimbursements%rowtype;
begin
  if tg_table_name='worker_receipts' then
    select * into r from public.worker_receipts where id=new.id;
    if not found then return null; end if;
    -- Grandfather unchanged old links without manufacturing source identities.
    if tg_op='UPDATE' and old.reimbursement_id is not null
      and old.reimbursement_id is not distinct from new.reimbursement_id then return null; end if;
    if r.status <> 'Approved' and r.reimbursement_id is null then return null; end if;
    select * into o from public.worker_reimbursements where id=r.reimbursement_id;
  else
    select * into o from public.worker_reimbursements where id=new.id;
    if not found or o.source_worker_receipt_id is null then return null; end if;
    select * into r from public.worker_receipts where id=o.source_worker_receipt_id;
  end if;
  if r.id is null or o.id is null or r.status <> 'Approved'
    or r.worker_id is null or r.amount is null or r.amount<=0
    or r.amount::text in ('NaN','Infinity','-Infinity')
    or r.reimbursement_id is distinct from o.id or o.source_worker_receipt_id is distinct from r.id
    or r.worker_id is distinct from o.worker_id or r.amount is distinct from o.amount
    or r.project_id is distinct from o.project_id then
    raise exception using errcode='23514',message='Receipt approval and obligation must commit together.';
  end if;
  return null;
end;
$$;
revoke all on function private.check_worker_receipt_obligation_link() from public,anon,authenticated,service_role;
create constraint trigger worker_receipt_obligation_link after insert or update on public.worker_receipts
  deferrable initially deferred for each row execute function private.check_worker_receipt_obligation_link();
create constraint trigger worker_obligation_receipt_link after insert or update on public.worker_reimbursements
  deferrable initially deferred for each row execute function private.check_worker_receipt_obligation_link();
notify pgrst, 'reload schema';
