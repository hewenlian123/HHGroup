-- Explicit task authority closes anonymous intake; signed-in company members
-- retain the narrow upload/submit contract without receipt read/update privileges.
set lock_timeout = '5s';
set statement_timeout = '60s';
alter policy worker_receipts_public_intake_insert on storage.objects to authenticated;
alter policy worker_receipts_public_submit on public.worker_receipts to authenticated;
revoke execute on function private.worker_receipt_upload_exists(text) from anon;
grant execute on function private.worker_receipt_upload_exists(text) to authenticated;
alter policy company_financial_storage_boundary on storage.objects
  with check (
    bucket_id not in ('expense-attachments','payment-attachments','receipts','worker-receipts')
    or (bucket_id='worker-receipts' and private.can_access_company())
    or private.can_manage_company()
  );
notify pgrst,'reload schema';
