-- MANUAL EMERGENCY ROLLBACK ONLY.
-- Run only after setting this session value on the same database connection:
--   set hh.rollback_confirmation = 'ROLLBACK_RECEIPT_STORAGE_SECURITY_PHASE1_20260728105015';
-- This file intentionally leaves the transaction open for operator inspection.
-- It restores only the captured pre-migration bucket visibility and policies.
-- It never deletes Storage objects or historical rows and never rewrites receipt references.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if current_setting('hh.rollback_confirmation', true)
    is distinct from 'ROLLBACK_RECEIPT_STORAGE_SECURITY_PHASE1_20260728105015'
  then
    raise exception
      'Explicit rollback confirmation is required for Receipt Storage Security Phase 1';
  end if;
end
$$;

update storage.buckets
set public = true
where id = 'receipts';

update storage.buckets
set public = false
where id = 'expense-attachments';

drop policy if exists "expense_attachments_select" on storage.objects;
drop policy if exists "receipts_storage_select" on storage.objects;
drop policy if exists "phase3a_expense_attachments_public_read" on storage.objects;
drop policy if exists "phase3a_expense_attachments_authenticated_insert" on storage.objects;
drop policy if exists "phase3a_expense_attachments_authenticated_update" on storage.objects;
drop policy if exists "phase3a_expense_attachments_authenticated_delete" on storage.objects;
drop policy if exists "phase3a_receipts_public_read" on storage.objects;
drop policy if exists "phase3a_receipts_authenticated_insert" on storage.objects;
drop policy if exists "phase3a_receipts_authenticated_update" on storage.objects;
drop policy if exists "phase3a_receipts_authenticated_delete" on storage.objects;

create policy "expense_attachments_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'expense-attachments');

create policy "receipts_storage_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'receipts');

create policy "phase3a_expense_attachments_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'expense-attachments');

create policy "phase3a_expense_attachments_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'expense-attachments');

create policy "phase3a_expense_attachments_authenticated_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'expense-attachments')
with check (bucket_id = 'expense-attachments');

create policy "phase3a_expense_attachments_authenticated_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'expense-attachments');

create policy "phase3a_receipts_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'receipts');

create policy "phase3a_receipts_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'receipts');

create policy "phase3a_receipts_authenticated_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'receipts')
with check (bucket_id = 'receipts');

create policy "phase3a_receipts_authenticated_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'receipts');

notify pgrst, 'reload schema';

-- Inspect bucket visibility and all ten policies now. The operator must
-- explicitly finish or roll back this open transaction; normal migrations
-- never execute this file.
