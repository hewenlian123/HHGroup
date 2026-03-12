-- Expense receipt upload + status + worker.
-- Storage bucket "receipts" must be created in Supabase Dashboard (Storage → New bucket) or via API.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'reimbursed'));

-- worker_id: optional reference to workers table (may not exist in all projects)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL;
  ELSE
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS worker_id uuid;
  END IF;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN public.expenses.receipt_url IS 'Public or signed URL for receipt file in storage bucket receipts';
COMMENT ON COLUMN public.expenses.status IS 'pending | approved | reimbursed';
COMMENT ON COLUMN public.expenses.worker_id IS 'Optional worker for reimbursement tracking';
