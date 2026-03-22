-- Repair legacy rows that appear "paid" without a worker_payments link (single source of truth).
-- labor_entries: status paid but no worker_payment_id → reopen as Approved workflow.
-- Column `worker_payment_id` is added in 202604201000; skip on fresh DBs until then.
DO $repair$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'labor_entries'
      AND c.column_name = 'worker_payment_id'
  ) THEN
    UPDATE public.labor_entries le
    SET status = 'Approved'
    WHERE le.worker_payment_id IS NULL
      AND lower(trim(COALESCE(le.status, ''))) = 'paid';
  END IF;
END $repair$;

-- worker_reimbursements: paid without payment_id → back to pending (must be settled via worker_payments).
DO $repair_wr$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'worker_reimbursements'
      AND c.column_name = 'payment_id'
  ) THEN
    UPDATE public.worker_reimbursements r
    SET
      status = 'pending',
      paid_at = NULL
    WHERE lower(trim(COALESCE(r.status, ''))) = 'paid'
      AND (r.payment_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.worker_payments wp WHERE wp.id = r.payment_id
      ));
  END IF;
END $repair_wr$;
