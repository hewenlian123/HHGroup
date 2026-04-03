-- Private bucket for commission payment attachments (JPG/PNG/PDF).
-- App stores time-limited signed URLs on commission_payments.receipt_url.
-- Preferred id: commission-receipts (replaces commission-payment-receipts for new uploads).

INSERT INTO storage.buckets (id, name, public)
VALUES ('commission-receipts', 'commission-receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false, name = EXCLUDED.name;

DROP POLICY IF EXISTS "commission_receipts_public_read" ON storage.objects;
CREATE POLICY "commission_receipts_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'commission-receipts');

DROP POLICY IF EXISTS "commission_receipts_anon_insert" ON storage.objects;
CREATE POLICY "commission_receipts_anon_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'commission-receipts');
