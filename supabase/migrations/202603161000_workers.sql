-- Workers module: master list of workers (trade, rates, status).
-- Used for labor entries and payroll; separate from labor_entries.

CREATE TABLE IF NOT EXISTS public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  trade text,
  daily_rate numeric DEFAULT 0,
  default_ot_rate numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers (status);
CREATE INDEX IF NOT EXISTS idx_workers_name ON public.workers (name);

COMMENT ON TABLE public.workers IS 'Worker master data: name, trade, rates, status. Referenced by labor_entries.worker_id.';
