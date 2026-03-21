-- Repair legacy rows that appear "paid" without a worker_payments link (single source of truth).
-- labor_entries: status paid but no worker_payment_id → reopen as Approved workflow.
UPDATE public.labor_entries le
SET status = 'Approved'
WHERE le.worker_payment_id IS NULL
  AND lower(trim(COALESCE(le.status, ''))) = 'paid';

-- worker_reimbursements: paid without payment_id → back to pending (must be settled via worker_payments).
UPDATE public.worker_reimbursements r
SET
  status = 'pending',
  paid_at = NULL
WHERE lower(trim(COALESCE(r.status, ''))) = 'paid'
  AND (r.payment_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.worker_payments wp WHERE wp.id = r.payment_id
  ));
