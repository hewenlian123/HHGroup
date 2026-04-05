-- Realign expenses.status CHECK with the app (TypeScript + createQuickExpense / receipt queue).
-- Fixes production where 202604141000 narrowed the CHECK (dropped reviewed, reimbursable, draft)
-- and/or legacy default 'Draft'::text caused inserts without status to violate lowercase-only CHECK.

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

-- Lowercase trim for comparison; map unknown / legacy UI labels to allowed values.
UPDATE public.expenses
SET status = lower(btrim(status))
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

-- Avoid default 'Draft' from remote_schema conflicting with CHECK (app uses lowercase 'draft' / 'pending').
ALTER TABLE public.expenses
  ALTER COLUMN status SET DEFAULT 'pending';

COMMENT ON COLUMN public.expenses.status IS 'pending | needs_review | reviewed | approved | reimbursed | reimbursable | paid | draft';
