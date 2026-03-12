-- Labor module: daily_work_entries, worker_reimbursements, worker_invoices.
-- Run via: supabase db push (or your migration runner).

-- daily_work_entries
CREATE TABLE IF NOT EXISTS public.daily_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  project_id uuid,
  work_date date NOT NULL,
  day_type text CHECK (day_type IN ('full_day', 'half_day', 'absent')),
  daily_rate numeric,
  ot_hours numeric DEFAULT 0,
  total_pay numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
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

-- worker_reimbursements
CREATE TABLE IF NOT EXISTS public.worker_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  project_id uuid,
  amount numeric,
  description text,
  receipt_url text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_worker_id ON public.worker_reimbursements (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_created_at ON public.worker_reimbursements (created_at);

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

-- worker_invoices
CREATE TABLE IF NOT EXISTS public.worker_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  project_id uuid,
  amount numeric,
  invoice_file text,
  status text DEFAULT 'unpaid',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_invoices_worker_id ON public.worker_invoices (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_invoices_created_at ON public.worker_invoices (created_at);
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
