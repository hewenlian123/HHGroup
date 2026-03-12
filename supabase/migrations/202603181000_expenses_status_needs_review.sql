-- Add needs_review to expense status for Quick Expense workflow.
-- Status flow: needs_review -> approved -> reimbursed (pending retained for legacy).

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
  CHECK (status IN ('pending', 'needs_review', 'approved', 'reimbursed'));

COMMENT ON COLUMN public.expenses.status IS 'pending | needs_review | approved | reimbursed';
