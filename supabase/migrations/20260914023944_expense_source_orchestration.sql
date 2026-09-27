begin;
set lock_timeout='5s';
set statement_timeout='60s';

create function public.finalize_receipt_queue_operation(p_receipt_id uuid,p_expense_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.receipt_queue%rowtype; e public.expenses%rowtype; v_id uuid; v_amount numeric; v_payload jsonb;
begin
  if auth.uid() is null or not private.can_manage_company() then raise exception 'Company administrator required.' using errcode='42501'; end if;
  if p_receipt_id is null then raise exception 'Receipt identity required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hh:receipt-queue:'||p_receipt_id,0));
  select expense_id into v_id from public.expense_source_links where source_kind='receipt_queue' and source_key=p_receipt_id::text;
  if found then
    if p_expense_id is not null and p_expense_id<>v_id then raise exception 'Receipt already belongs to another Expense.' using errcode='23505'; end if;
    return jsonb_build_object('expense_id',v_id,'reused',true);
  end if;
  select * into q from public.receipt_queue where id=p_receipt_id for update;
  if not found then raise exception 'Receipt not found.' using errcode='P0002'; end if;
  if q.status is distinct from 'pending' or nullif(q.worker_id,'') is not null or q.source_type='reimbursement' then
    raise exception 'Pending company receipt required. Worker receipts use canonical intake.' using errcode='23514';
  end if;
  v_amount:=replace(q.amount,',','')::numeric;
  if v_amount is null or v_amount<0 or v_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid receipt amount.' using errcode='23514'; end if;
  v_amount:=round(v_amount,2);
  if p_expense_id is not null then
    select * into e from public.expenses where id=p_expense_id for update;
    if not found or e.total is distinct from v_amount
      or (nullif(q.project_id,'') is not null and e.project_id is distinct from q.project_id::uuid) then
      raise exception 'Explicit match requires matching amount and project.' using errcode='23514';
    end if;
    v_id:=e.id;
  else
    v_payload:=jsonb_build_object('expenseDate',coalesce(nullif(q.expense_date,''),q.created_at::date::text),
      'vendorName',coalesce(nullif(btrim(q.vendor_name),''),'Unknown'),'status','needs_review',
      'sourceType',case when q.source_type='company' then 'company' else 'receipt_upload' end,
      'source','receipt_queue','sourceId',q.id,'receiptUrl',nullif(q.receipt_public_url,''),
      'paymentAccountId',nullif(q.payment_account_id,''),
      'groups',jsonb_build_array(jsonb_build_object('projectId',nullif(q.project_id,''),'lines',
        jsonb_build_array(jsonb_build_object('projectId',nullif(q.project_id,''),'category',coalesce(nullif(q.category,''),'Other'),'amount',v_amount)))));
    v_id:=(public.create_expense_atomic('receipt-queue:'||q.id,v_payload)->>'expense_id')::uuid;
  end if;
  if nullif(q.storage_path,'') is not null then
    insert into public.attachments(id,entity_type,entity_id,file_name,file_path,mime_type,size_bytes)
    values(q.id,'expense',v_id,q.file_name,q.storage_path,q.mime_type,coalesce(q.size_bytes,0));
  end if;
  insert into public.expense_source_links(expense_id,source_kind,source_key,evidence,created_by)
    values(v_id,'receipt_queue',q.id::text,to_jsonb(q),auth.uid());
  if p_expense_id is null then
    insert into public.expense_operations(expense_id) values(v_id) on conflict do nothing;
  end if;
  insert into public.expense_operation_events(expense_id,actor_id,action,after_state)
    values(v_id,auth.uid(),case when p_expense_id is null then 'receipt_intake' else 'receipt_match' end,to_jsonb(q));
  delete from public.receipt_queue where id=q.id;
  return jsonb_build_object('expense_id',v_id,'reused',false);
end $$;
revoke all on function public.finalize_receipt_queue_operation(uuid,uuid) from public,anon,service_role;
grant execute on function public.finalize_receipt_queue_operation(uuid,uuid) to authenticated;

-- Shared database boundary covers both explicit matching and the legacy create-and-reconcile RPC.
create function private.record_expense_bank_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.expenses%rowtype; v_existing uuid;
begin
  if new.linked_expense_id is not distinct from old.linked_expense_id then return new; end if;
  if new.linked_expense_id is null then
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
create trigger expense_bank_source after update on public.bank_transactions
for each row execute function private.record_expense_bank_source();
revoke all on function private.record_expense_bank_source() from public,anon,authenticated,service_role;

create function public.match_bank_expense_operation(p_bank_id uuid,p_expense_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bank_transactions%rowtype;
begin
  if auth.uid() is null or not private.can_manage_company() then raise exception 'Company administrator required.' using errcode='42501'; end if;
  if p_expense_id is null then raise exception 'Expense identity required.' using errcode='22023'; end if;
  select * into b from public.bank_transactions where id=p_bank_id for update;
  if not found then raise exception 'Bank transaction not found.' using errcode='P0002'; end if;
  if b.linked_expense_id=p_expense_id then return; end if;
  if b.linked_expense_id is not null then raise exception 'Bank transaction already matched.' using errcode='23505'; end if;
  update public.bank_transactions set linked_expense_id=p_expense_id,status='reconciled',reconciled_at=clock_timestamp(),reconciled_by=auth.uid()::text where id=b.id;
end $$;
revoke all on function public.match_bank_expense_operation(uuid,uuid) from public,anon,service_role;
grant execute on function public.match_bank_expense_operation(uuid,uuid) to authenticated;

create function private.invalidate_expense_review_on_edit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; s public.expense_operations%rowtype;
begin
  if tg_table_name='expenses' then
    if row(new.expense_date,new.vendor_name,new.project_id,new.category,new.amount,new.total,new.payment_account_id)
      is not distinct from row(old.expense_date,old.vendor_name,old.project_id,old.category,old.amount,old.total,old.payment_account_id) then return new; end if;
    v_id:=new.id;
    if new.worker_id is not null then return new; end if;
  else
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
create trigger invalidate_expense_review after update on public.expenses for each row execute function private.invalidate_expense_review_on_edit();
create trigger invalidate_expense_review after insert or update or delete on public.expense_lines for each row execute function private.invalidate_expense_review_on_edit();
revoke all on function private.invalidate_expense_review_on_edit() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
