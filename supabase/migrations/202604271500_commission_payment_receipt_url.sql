-- Receipt attachment URL for commission payment rows (jpg/png/pdf in Storage).

ALTER TABLE public.commission_payments
  ADD COLUMN IF NOT EXISTS receipt_url text;

COMMENT ON COLUMN public.commission_payments.receipt_url IS 'Public URL for uploaded receipt (commission-payment-receipts bucket).';

INSERT INTO storage.buckets (id, name, public)
VALUES ('commission-payment-receipts', 'commission-payment-receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "commission_payment_receipts_public_read" ON storage.objects;
CREATE POLICY "commission_payment_receipts_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'commission-payment-receipts');

DROP POLICY IF EXISTS "commission_payment_receipts_anon_insert" ON storage.objects;
CREATE POLICY "commission_payment_receipts_anon_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'commission-payment-receipts');
