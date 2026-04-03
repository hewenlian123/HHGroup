-- Baseline public.commissions + public.commission_payments when legacy rename did not create them,
-- and align display name column `person` (app + PostgREST).

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  person text NOT NULL,
  role text,
  calculation_mode text DEFAULT 'manual',
  rate numeric DEFAULT 0,
  base_amount numeric DEFAULT 0,
  commission_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text,
  payment_date date,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_project_id ON public.commissions (project_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_commission_id ON public.commission_payments (commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_payment_date ON public.commission_payments (payment_date);

-- Optional worker link (used by app when set).
ALTER TABLE IF EXISTS public.commissions ADD COLUMN IF NOT EXISTS person_id uuid;

DO $$
BEGIN
  IF to_regclass('public.workers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_person_id_fkey')
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'person_id'
     )
  THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_person_id_fkey
      FOREIGN KEY (person_id) REFERENCES public.workers(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE public.commissions VALIDATE CONSTRAINT commissions_person_id_fkey;
  END IF;
END $$;

-- Legacy column person_name -> person (rename migration may leave person_name only).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'person_name'
  ) THEN
    ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS person text;
    UPDATE public.commissions AS c
    SET person = COALESCE(NULLIF(btrim(c.person_name), ''), '')
    WHERE c.person IS NULL;
    UPDATE public.commissions SET person = '' WHERE person IS NULL;
    ALTER TABLE public.commissions ALTER COLUMN person SET DEFAULT '';
    ALTER TABLE public.commissions ALTER COLUMN person SET NOT NULL;
    ALTER TABLE public.commissions DROP COLUMN person_name;
  END IF;
END $$;

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commissions_all_anon ON public.commissions;
CREATE POLICY commissions_all_anon ON public.commissions
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS commission_payments_all_anon ON public.commission_payments;
CREATE POLICY commission_payments_all_anon ON public.commission_payments
  FOR ALL TO anon USING (true) WITH CHECK (true);
