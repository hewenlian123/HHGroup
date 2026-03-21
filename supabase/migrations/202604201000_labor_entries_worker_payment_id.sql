-- Link labor_entries to worker_payments when a payout settles that row (without overwriting approval workflow status).
-- labor_entries.status stays Draft|Submitted|Approved|Locked; settlement is worker_payment_id IS NOT NULL.

ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS worker_payment_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'worker_payments'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'labor_entries'
      AND constraint_name = 'labor_entries_worker_payment_id_fkey'
  ) THEN
    ALTER TABLE public.labor_entries
      ADD CONSTRAINT labor_entries_worker_payment_id_fkey
      FOREIGN KEY (worker_payment_id) REFERENCES public.worker_payments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_labor_entries_worker_payment_id ON public.labor_entries (worker_payment_id);

COMMENT ON COLUMN public.labor_entries.worker_payment_id IS 'Set when this entry is included in a worker_payments payout; null means not yet paid out.';
