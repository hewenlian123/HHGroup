-- Expenses: source_type (company | reimbursement | receipt_upload) and extended status values.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS source_type text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'source'
  ) THEN
    UPDATE public.expenses e
    SET source_type = CASE
      WHEN e.source = 'worker_reimbursement' THEN 'reimbursement'
      WHEN COALESCE(trim(e.source_type::text), '') = '' THEN 'company'
      ELSE e.source_type
    END;
  ELSE
    UPDATE public.expenses e
    SET source_type = CASE
      WHEN COALESCE(trim(e.source_type::text), '') = '' THEN 'company'
      ELSE e.source_type
    END;
  END IF;
END $$;

ALTER TABLE public.expenses
  ALTER COLUMN source_type SET DEFAULT 'company';

COMMENT ON COLUMN public.expenses.source_type IS 'company | reimbursement | receipt_upload';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'expenses'
      AND constraint_name = 'expenses_source_type_check'
  ) THEN
    ALTER TABLE public.expenses DROP CONSTRAINT expenses_source_type_check;
  END IF;
END $$;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN ('company', 'reimbursement', 'receipt_upload')
  );

CREATE INDEX IF NOT EXISTS idx_expenses_source_type ON public.expenses (source_type)
  WHERE source_type IS NOT NULL;

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

-- Normalize legacy/unknown status values so the new check constraint can apply.
-- CHECK uses lowercase literals; coerce stored values to lowercase first.
UPDATE public.expenses
SET status = lower(trim(status))
WHERE status IS NOT NULL AND btrim(status) <> '';

UPDATE public.expenses
SET status = 'pending'
WHERE status IS NOT NULL
  AND status NOT IN (
    'pending',
    'needs_review',
    'reviewed',
    'approved',
    'reimbursed',
    'reimbursable',
    'paid',
    'draft'
  );

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (
    status IS NULL
    OR status IN (
      'pending',
      'needs_review',
      'reviewed',
      'approved',
      'reimbursed',
      'reimbursable',
      'paid',
      'draft'
    )
  );

COMMENT ON COLUMN public.expenses.status IS 'pending | needs_review | reviewed | approved | reimbursed | reimbursable | paid | draft';
