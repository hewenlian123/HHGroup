-- Worker payment idempotency for retry-safe payroll payments.
-- Non-destructive: keep all payment rows, only clear duplicate idempotency keys before enforcing uniqueness.

ALTER TABLE public.worker_payments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.worker_payments
SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL
  AND btrim(idempotency_key) = '';

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY idempotency_key
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.worker_payments
  WHERE idempotency_key IS NOT NULL
    AND btrim(idempotency_key) <> ''
)
UPDATE public.worker_payments wp
SET idempotency_key = NULL
FROM ranked
WHERE wp.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_payments_idempotency_key
  ON public.worker_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
