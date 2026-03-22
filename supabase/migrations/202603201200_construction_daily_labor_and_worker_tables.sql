-- Construction daily labor + worker reimbursements + worker invoices (simple tracking).
-- daily_work_entries: one row per worker per day per project; day_type, daily_rate, ot_hours, total_pay.
-- worker_reimbursements: receipts for materials/purchases by worker.
-- worker_invoices: 1099/subcontractor invoices (Unpaid/Paid).

-- Daily work: date, project, worker, day type, daily rate, ot_hours, total_pay, notes
CREATE TABLE IF NOT EXISTS public.daily_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date date NOT NULL,
  worker_id uuid NOT NULL,
  project_id uuid,
  day_type text NOT NULL DEFAULT 'full_day' CHECK (day_type IN ('full_day', 'half_day', 'absent')),
  daily_rate numeric NOT NULL DEFAULT 0,
  ot_hours numeric NOT NULL DEFAULT 0,
  total_pay numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_work_entries_work_date ON public.daily_work_entries (work_date);
CREATE INDEX IF NOT EXISTS idx_daily_work_entries_worker_id ON public.daily_work_entries (worker_id);
CREATE INDEX IF NOT EXISTS idx_daily_work_entries_project_id ON public.daily_work_entries (project_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    ALTER TABLE public.daily_work_entries
      ADD CONSTRAINT daily_work_entries_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    ALTER TABLE public.daily_work_entries
      ADD CONSTRAINT daily_work_entries_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Worker reimbursements: worker, project, amount, receipt, notes, date
CREATE TABLE IF NOT EXISTS public.worker_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  project_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  receipt_url text,
  notes text,
  reimbursement_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Older DBs may already have worker_reimbursements without this column (IF NOT EXISTS skips full CREATE).
ALTER TABLE public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS reimbursement_date date NOT NULL DEFAULT current_date;

CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_worker_id ON public.worker_reimbursements (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_date ON public.worker_reimbursements (reimbursement_date);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    ALTER TABLE public.worker_reimbursements
      ADD CONSTRAINT worker_reimbursements_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    ALTER TABLE public.worker_reimbursements
      ADD CONSTRAINT worker_reimbursements_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Worker invoices (1099 / small subs): invoice #, worker, project, amount, status, attachment
CREATE TABLE IF NOT EXISTS public.worker_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  project_id uuid,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid')),
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy `worker_invoices` from 202603120001 lacks invoice_number / invoice_date / attachment_url.
ALTER TABLE public.worker_invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE public.worker_invoices ADD COLUMN IF NOT EXISTS invoice_date date;
ALTER TABLE public.worker_invoices ADD COLUMN IF NOT EXISTS attachment_url text;

UPDATE public.worker_invoices
SET invoice_number = COALESCE(NULLIF(trim(invoice_number), ''), 'INV-' || replace(id::text, '-', ''))
WHERE invoice_number IS NULL;

UPDATE public.worker_invoices
SET invoice_date = COALESCE(invoice_date, (created_at AT TIME ZONE 'UTC')::date, current_date)
WHERE invoice_date IS NULL;

DO $sync_attachment$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worker_invoices' AND column_name = 'invoice_file'
  ) THEN
    UPDATE public.worker_invoices
    SET attachment_url = COALESCE(attachment_url, invoice_file)
    WHERE attachment_url IS NULL AND invoice_file IS NOT NULL;
  END IF;
END $sync_attachment$;

ALTER TABLE public.worker_invoices ALTER COLUMN amount SET DEFAULT 0;
UPDATE public.worker_invoices SET amount = COALESCE(amount, 0) WHERE amount IS NULL;

ALTER TABLE public.worker_invoices ALTER COLUMN invoice_number SET NOT NULL;
ALTER TABLE public.worker_invoices ALTER COLUMN invoice_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_invoices_worker_id ON public.worker_invoices (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_invoices_invoice_date ON public.worker_invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_worker_invoices_status ON public.worker_invoices (status);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    ALTER TABLE public.worker_invoices
      ADD CONSTRAINT worker_invoices_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    ALTER TABLE public.worker_invoices
      ADD CONSTRAINT worker_invoices_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS
ALTER TABLE public.daily_work_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_work_entries_select_all ON public.daily_work_entries;
CREATE POLICY daily_work_entries_select_all ON public.daily_work_entries FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS daily_work_entries_insert_all ON public.daily_work_entries;
CREATE POLICY daily_work_entries_insert_all ON public.daily_work_entries FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS daily_work_entries_update_all ON public.daily_work_entries;
CREATE POLICY daily_work_entries_update_all ON public.daily_work_entries FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS daily_work_entries_delete_all ON public.daily_work_entries;
CREATE POLICY daily_work_entries_delete_all ON public.daily_work_entries FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS worker_reimbursements_select_all ON public.worker_reimbursements;
CREATE POLICY worker_reimbursements_select_all ON public.worker_reimbursements FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS worker_reimbursements_insert_all ON public.worker_reimbursements;
CREATE POLICY worker_reimbursements_insert_all ON public.worker_reimbursements FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS worker_reimbursements_update_all ON public.worker_reimbursements;
CREATE POLICY worker_reimbursements_update_all ON public.worker_reimbursements FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS worker_reimbursements_delete_all ON public.worker_reimbursements;
CREATE POLICY worker_reimbursements_delete_all ON public.worker_reimbursements FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS worker_invoices_select_all ON public.worker_invoices;
CREATE POLICY worker_invoices_select_all ON public.worker_invoices FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS worker_invoices_insert_all ON public.worker_invoices;
CREATE POLICY worker_invoices_insert_all ON public.worker_invoices FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS worker_invoices_update_all ON public.worker_invoices;
CREATE POLICY worker_invoices_update_all ON public.worker_invoices FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS worker_invoices_delete_all ON public.worker_invoices;
CREATE POLICY worker_invoices_delete_all ON public.worker_invoices FOR DELETE TO anon USING (true);
