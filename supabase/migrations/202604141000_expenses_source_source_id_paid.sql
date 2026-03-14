-- Expenses: source/source_id for worker_reimbursement dedupe; add 'paid' status.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS source_id text;
COMMENT ON COLUMN public.expenses.source IS 'Origin e.g. worker_reimbursement for linking and dedupe.';
COMMENT ON COLUMN public.expenses.source_id IS 'ID of source record (e.g. worker_reimbursements.id).';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'expenses'
      AND constraint_name = 'expenses_status_check'
  ) THEN
    ALTER TABLE public.expenses DROP CONSTRAINT expenses_status_check;
  END IF;
END $$;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('pending', 'needs_review', 'approved', 'reimbursed', 'paid'));

COMMENT ON COLUMN public.expenses.status IS 'pending | needs_review | approved | reimbursed | paid';

CREATE INDEX IF NOT EXISTS idx_expenses_source_source_id ON public.expenses (source, source_id) WHERE source IS NOT NULL AND source_id IS NOT NULL;
