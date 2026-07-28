-- Receipt Storage Security Phase 1
-- Non-destructive: historical database references and Storage objects are preserved.

update storage.buckets
set public = false
where id in ('receipts', 'expense-attachments');

-- Remove every known legacy and Phase 3A browser policy for expense receipt buckets.
drop policy if exists "receipts_storage_select" on storage.objects;
drop policy if exists "receipts_storage_insert" on storage.objects;
drop policy if exists "receipts_storage_update" on storage.objects;
drop policy if exists "receipts_storage_delete" on storage.objects;
drop policy if exists "expense_attachments_select" on storage.objects;
drop policy if exists "expense_attachments_insert" on storage.objects;
drop policy if exists "expense_attachments_update" on storage.objects;
drop policy if exists "expense_attachments_delete" on storage.objects;
drop policy if exists "phase3a_receipts_public_read" on storage.objects;
drop policy if exists "phase3a_receipts_authenticated_insert" on storage.objects;
drop policy if exists "phase3a_receipts_authenticated_update" on storage.objects;
drop policy if exists "phase3a_receipts_authenticated_delete" on storage.objects;
drop policy if exists "phase3a_expense_attachments_public_read" on storage.objects;
drop policy if exists "phase3a_expense_attachments_authenticated_insert" on storage.objects;
drop policy if exists "phase3a_expense_attachments_authenticated_update" on storage.objects;
drop policy if exists "phase3a_expense_attachments_authenticated_delete" on storage.objects;

do $$
declare
  target_policy record;
begin
  -- Defensive cleanup for drifted policy names. The bucket predicates are the target,
  -- not unrelated Storage policies.
  for target_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ~* '(^|[^a-z-])(receipts|expense-attachments)([^a-z-]|$)'
        or coalesce(with_check, '') ~* '(^|[^a-z-])(receipts|expense-attachments)([^a-z-]|$)'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', target_policy.policyname);
  end loop;
end
$$;

create table if not exists public.receipt_storage_cleanup_candidates (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  source_kind text not null check (
    source_kind in ('expense_receipt_url', 'attachment', 'expense_attachment')
  ),
  source_id uuid not null,
  old_bucket text not null check (old_bucket in ('receipts', 'expense-attachments')),
  old_path text not null,
  replacement_bucket text not null default 'expense-attachments'
    check (replacement_bucket = 'expense-attachments'),
  replacement_path text not null,
  created_by uuid null references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'retained')),
  created_at timestamptz not null default now()
);

create index if not exists receipt_storage_cleanup_candidates_expense_created_idx
on public.receipt_storage_cleanup_candidates (expense_id, created_at desc);

alter table public.receipt_storage_cleanup_candidates enable row level security;
revoke all on table public.receipt_storage_cleanup_candidates from public;
revoke all on table public.receipt_storage_cleanup_candidates from anon;
revoke all on table public.receipt_storage_cleanup_candidates from authenticated;
grant select, insert, update on table public.receipt_storage_cleanup_candidates to service_role;

comment on table public.receipt_storage_cleanup_candidates is
  'Server-only evidence for old receipt objects retained after Replace. Phase 1 never deletes them.';

create or replace function public.replace_expense_receipt_reference(
  p_operation_id uuid,
  p_expense_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_expected_reference text,
  p_new_reference text,
  p_old_bucket text,
  p_old_path text,
  p_actor_user_id uuid
)
returns table (changed boolean, idempotent boolean)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  affected_rows integer := 0;
  existing_operation public.receipt_storage_cleanup_candidates%rowtype;
  actor_role text;
begin
  select raw_app_meta_data ->> 'role'
  into actor_role
  from auth.users
  where id = p_actor_user_id;

  if coalesce(actor_role, '') not in ('owner', 'admin') then
    raise exception 'receipt replacement is not authorized';
  end if;

  if p_source_kind not in ('expense_receipt_url', 'attachment', 'expense_attachment')
    or p_new_reference is null
    or btrim(p_new_reference) = ''
    or p_new_reference ~* '^https?://'
    or p_new_reference like '%?%'
    or p_new_reference like '%#%'
    or p_old_bucket not in ('receipts', 'expense-attachments')
    or p_old_path is null
    or btrim(p_old_path) = ''
  then
    raise exception 'invalid receipt replacement input';
  end if;

  select *
  into existing_operation
  from public.receipt_storage_cleanup_candidates
  where operation_id = p_operation_id;

  if found then
    if existing_operation.expense_id = p_expense_id
      and existing_operation.source_kind = p_source_kind
      and existing_operation.source_id = p_source_id
      and existing_operation.replacement_path = p_new_reference
    then
      return query select true, true;
      return;
    end if;
    raise exception 'receipt replacement operation conflict';
  end if;

  if p_source_kind = 'expense_receipt_url' then
    if p_source_id <> p_expense_id then
      return query select false, false;
      return;
    end if;
    update public.expenses
    set receipt_url = p_new_reference
    where id = p_expense_id
      and receipt_url is not distinct from p_expected_reference;
    get diagnostics affected_rows = row_count;
  elsif p_source_kind = 'attachment' then
    update public.attachments
    set file_path = p_new_reference
    where id = p_source_id
      and entity_type = 'expense'
      and entity_id = p_expense_id
      and file_path is not distinct from p_expected_reference;
    get diagnostics affected_rows = row_count;
  else
    update public.expense_attachments
    set file_url = p_new_reference
    where id = p_source_id
      and expense_id = p_expense_id
      and file_url is not distinct from p_expected_reference;
    get diagnostics affected_rows = row_count;
  end if;

  if affected_rows <> 1 then
    return query select false, false;
    return;
  end if;

  insert into public.receipt_storage_cleanup_candidates (
    operation_id,
    expense_id,
    source_kind,
    source_id,
    old_bucket,
    old_path,
    replacement_path,
    created_by
  )
  values (
    p_operation_id,
    p_expense_id,
    p_source_kind,
    p_source_id,
    p_old_bucket,
    p_old_path,
    p_new_reference,
    p_actor_user_id
  );

  insert into public.security_audit_events (user_id, event_type, metadata)
  values (
    p_actor_user_id,
    'receipt_replaced',
    jsonb_build_object(
      'expense_id', p_expense_id,
      'source_kind', p_source_kind,
      'operation_id', p_operation_id
    )
  );

  return query select true, false;
end;
$$;

revoke all on function public.replace_expense_receipt_reference(
  uuid, uuid, text, uuid, text, text, text, text, uuid
) from public;
revoke all on function public.replace_expense_receipt_reference(
  uuid, uuid, text, uuid, text, text, text, text, uuid
) from anon;
revoke all on function public.replace_expense_receipt_reference(
  uuid, uuid, text, uuid, text, text, text, text, uuid
) from authenticated;
grant execute on function public.replace_expense_receipt_reference(
  uuid, uuid, text, uuid, text, text, text, text, uuid
) to service_role;

notify pgrst, 'reload schema';
