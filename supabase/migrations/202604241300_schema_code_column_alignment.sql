-- Align DB columns with app expectations (audit: scripts/audit-schema-vs-code.mjs).
-- Skips false positives from nested selects (e.g. subcontractors(name) on subcontracts).

-- bank_transactions: who reconciled (app writes reconciled_by)
ALTER TABLE IF EXISTS public.bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_by text NULL;

-- documents: display name mirrors file_name (skip if legacy schema has no file_name)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'file_name'
  ) THEN
    ALTER TABLE public.documents
      ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (file_name) STORED;
  END IF;
END $$;

-- expense_lines: optional line label (app may set independently of memo)
ALTER TABLE IF EXISTS public.expense_lines
  ADD COLUMN IF NOT EXISTS name text NULL;

-- expenses: display name + optional header project (lines keep their own project_id)
ALTER TABLE IF EXISTS public.expenses
  ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (vendor_name) STORED;

ALTER TABLE IF EXISTS public.expenses
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON public.expenses (project_id)
  WHERE project_id IS NOT NULL;

-- invoice_items: quantity alias for qty
ALTER TABLE IF EXISTS public.invoice_items
  ADD COLUMN IF NOT EXISTS quantity numeric GENERATED ALWAYS AS (qty) STORED;

-- invoice_payments: payment_date / reference aliases (paid_at is date in canonical schema)
ALTER TABLE IF EXISTS public.invoice_payments
  ADD COLUMN IF NOT EXISTS payment_date date GENERATED ALWAYS AS (paid_at) STORED;

ALTER TABLE IF EXISTS public.invoice_payments
  ADD COLUMN IF NOT EXISTS reference text GENERATED ALWAYS AS (memo) STORED;

-- invoices: single display label for lists
ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (btrim(invoice_no || ' ' || client_name)) STORED;

-- labor_entries: denormalized project, optional hours/notes for UI and imports
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_am_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_pm_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE IF EXISTS public.labor_entries
      ADD COLUMN project_id uuid GENERATED ALWAYS AS (COALESCE(project_am_id, project_pm_id)) STORED;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.labor_entries
  ADD COLUMN IF NOT EXISTS hours numeric NULL;

ALTER TABLE IF EXISTS public.labor_entries
  ADD COLUMN IF NOT EXISTS notes text NULL;

-- project_change_orders: amount mirrors total
ALTER TABLE IF EXISTS public.project_change_orders
  ADD COLUMN IF NOT EXISTS amount numeric GENERATED ALWAYS AS (total) STORED;

-- project_material_selections: optional photo override / snapshot
ALTER TABLE IF EXISTS public.project_material_selections
  ADD COLUMN IF NOT EXISTS photo_url text NULL;

-- worker_payments: amount mirrors total_amount (batch receipts / legacy selects)
ALTER TABLE IF EXISTS public.worker_payments
  ADD COLUMN IF NOT EXISTS amount numeric GENERATED ALWAYS AS (total_amount) STORED;

-- worker_reimbursements: construction table had notes; app expects description, vendor, status, paid_at
ALTER TABLE IF EXISTS public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS vendor text NULL;

ALTER TABLE IF EXISTS public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL;

ALTER TABLE IF EXISTS public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE IF EXISTS public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS description text NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worker_reimbursements' AND column_name = 'description'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worker_reimbursements' AND column_name = 'notes'
  ) THEN
    UPDATE public.worker_reimbursements wr
    SET description = wr.notes
    WHERE wr.description IS NULL AND wr.notes IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.bank_transactions') IS NOT NULL THEN
    COMMENT ON COLUMN public.bank_transactions.reconciled_by IS 'Optional actor id or label when status=reconciled.';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'project_id'
  ) THEN
    COMMENT ON COLUMN public.expenses.project_id IS 'Optional header-level project; expense_lines.project_id remains line-level.';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_id'
  ) THEN
    COMMENT ON COLUMN public.labor_entries.project_id IS 'COALESCE(AM project, PM project) when both exist on daily labor schema.';
  END IF;
END $$;
COMMENT ON COLUMN public.worker_payments.amount IS 'Generated mirror of total_amount for API compatibility.';
