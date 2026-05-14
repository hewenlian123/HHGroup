-- Payments received attachments: multiple receipt files per AR payment.

CREATE TABLE IF NOT EXISTS public.payment_received_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments_received(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT 'Payment attachment',
  mime_type text NULL,
  size_bytes bigint NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'pdf')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_received_attachments_payment_id
  ON public.payment_received_attachments (payment_id);

ALTER TABLE public.payment_received_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_received_attachments_select_anon_authenticated
  ON public.payment_received_attachments;
DROP POLICY IF EXISTS payment_received_attachments_insert_anon_authenticated
  ON public.payment_received_attachments;
DROP POLICY IF EXISTS payment_received_attachments_update_anon_authenticated
  ON public.payment_received_attachments;
DROP POLICY IF EXISTS payment_received_attachments_delete_anon_authenticated
  ON public.payment_received_attachments;

CREATE POLICY payment_received_attachments_select_anon_authenticated
  ON public.payment_received_attachments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY payment_received_attachments_insert_anon_authenticated
  ON public.payment_received_attachments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY payment_received_attachments_update_anon_authenticated
  ON public.payment_received_attachments FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY payment_received_attachments_delete_anon_authenticated
  ON public.payment_received_attachments FOR DELETE
  TO anon, authenticated
  USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-attachments', 'payment-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false, name = EXCLUDED.name;

DROP POLICY IF EXISTS "payment_attachments_select" ON storage.objects;
CREATE POLICY "payment_attachments_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'payment-attachments');

DROP POLICY IF EXISTS "payment_attachments_insert" ON storage.objects;
CREATE POLICY "payment_attachments_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'payment-attachments');

DROP POLICY IF EXISTS "payment_attachments_update" ON storage.objects;
CREATE POLICY "payment_attachments_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'payment-attachments')
WITH CHECK (bucket_id = 'payment-attachments');

DROP POLICY IF EXISTS "payment_attachments_delete" ON storage.objects;
CREATE POLICY "payment_attachments_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'payment-attachments');

INSERT INTO public.payment_received_attachments (
  payment_id,
  file_url,
  file_name,
  mime_type,
  size_bytes,
  file_type
)
SELECT
  p.id,
  p.attachment_url,
  COALESCE(
    NULLIF(regexp_replace(split_part(p.attachment_url, '?', 1), '^.*/', ''), ''),
    'Payment attachment'
  ),
  NULL,
  NULL,
  CASE
    WHEN lower(p.attachment_url) ~ '\.pdf(\?|#|$)' THEN 'pdf'
    ELSE 'image'
  END
FROM public.payments_received p
WHERE p.attachment_url IS NOT NULL
  AND btrim(p.attachment_url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_received_attachments a
    WHERE a.payment_id = p.id
      AND a.file_url = p.attachment_url
  );

NOTIFY pgrst, 'reload schema';
