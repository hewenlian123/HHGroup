-- Business date for worker reimbursements (filtering / reports). Distinct from created_at.
-- Backfill: created_at::date when present, else CURRENT_DATE.

ALTER TABLE public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS reimbursement_date date;

UPDATE public.worker_reimbursements wr
SET reimbursement_date = COALESCE((wr.created_at::date), CURRENT_DATE)::date
WHERE wr.reimbursement_date IS NULL;

ALTER TABLE public.worker_reimbursements
  ALTER COLUMN reimbursement_date SET DEFAULT (CURRENT_DATE);

ALTER TABLE public.worker_reimbursements
  ALTER COLUMN reimbursement_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_reimbursement_date
  ON public.worker_reimbursements (reimbursement_date);
