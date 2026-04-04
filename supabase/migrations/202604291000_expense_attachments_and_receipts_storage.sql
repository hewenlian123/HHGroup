-- Quick Expense + expenses list: server route /api/quick-expense/upload-attachment uses bucket `expense-attachments`.
-- Browser fallback also tries `receipts` (public URLs for expenses.receipt_url).
-- Without these buckets + policies, production shows "Upload to Supabase Storage failed (bucket/policy/session)".

-- Private bucket; signed URLs from API and from expense list preview (createSignedUrl).
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-attachments', 'expense-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false, name = EXCLUDED.name;

DROP POLICY IF EXISTS "expense_attachments_select" ON storage.objects;
CREATE POLICY "expense_attachments_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'expense-attachments');

DROP POLICY IF EXISTS "expense_attachments_insert" ON storage.objects;
CREATE POLICY "expense_attachments_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'expense-attachments');

DROP POLICY IF EXISTS "expense_attachments_update" ON storage.objects;
CREATE POLICY "expense_attachments_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'expense-attachments')
WITH CHECK (bucket_id = 'expense-attachments');

DROP POLICY IF EXISTS "expense_attachments_delete" ON storage.objects;
CREATE POLICY "expense_attachments_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'expense-attachments');

-- Public bucket for legacy quick-expense browser path (getPublicUrl on expenses.receipt_url).
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true, name = EXCLUDED.name;

DROP POLICY IF EXISTS "receipts_storage_select" ON storage.objects;
CREATE POLICY "receipts_storage_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts_storage_insert" ON storage.objects;
CREATE POLICY "receipts_storage_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts_storage_update" ON storage.objects;
CREATE POLICY "receipts_storage_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'receipts')
WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts_storage_delete" ON storage.objects;
CREATE POLICY "receipts_storage_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'receipts');
