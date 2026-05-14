-- Link AR payments to invoice ledger rows so Payment Received edits can sync safely.

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS payment_received_id uuid NULL
    REFERENCES public.payments_received(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_received_id
  ON public.invoice_payments (payment_received_id);

WITH candidates AS (
  SELECT
    p.id AS payment_received_id,
    ip.id AS invoice_payment_id,
    count(*) OVER (PARTITION BY p.id) AS payment_match_count,
    count(*) OVER (PARTITION BY ip.id) AS ledger_match_count
  FROM public.payments_received p
  JOIN public.invoice_payments ip
    ON ip.invoice_id = p.invoice_id
   AND COALESCE(ip.status, 'Posted') <> 'Voided'
   AND abs(COALESCE(ip.amount, 0)::numeric - COALESCE(p.amount, 0)::numeric) < 0.000001
   AND COALESCE(ip.paid_at, ip.payment_date)::date = p.payment_date::date
   AND COALESCE(NULLIF(btrim(ip.memo), ''), '') =
       COALESCE(NULLIF(btrim(COALESCE(p.notes, p.deposit_account)), ''), '')
  WHERE p.id IS NOT NULL
    AND COALESCE(p.status, '') <> 'void'
    AND ip.payment_received_id IS NULL
)
UPDATE public.invoice_payments ip
SET payment_received_id = candidates.payment_received_id
FROM candidates
WHERE ip.id = candidates.invoice_payment_id
  AND candidates.payment_match_count = 1
  AND candidates.ledger_match_count = 1;

NOTIFY pgrst, 'reload schema';
