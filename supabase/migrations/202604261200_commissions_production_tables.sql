-- Production commission model: `commissions` + `commission_payments`.
-- Runs after 202604090000 / 202604251000 so cleanup and anon policies still target legacy names first.
-- Renames legacy tables; payment rows hold only commission_id + payment fields (no project_id / person_name on payments).

ALTER TABLE IF EXISTS public.commission_payment_records
  DROP CONSTRAINT IF EXISTS commission_payment_records_project_id_fkey;

DO $$
BEGIN
  IF to_regclass('public.project_commissions') IS NOT NULL
     AND to_regclass('public.commissions') IS NULL
  THEN
    ALTER TABLE public.project_commissions RENAME TO commissions;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.commission_payment_records') IS NOT NULL
     AND to_regclass('public.commission_payments') IS NULL
  THEN
    ALTER TABLE public.commission_payment_records RENAME TO commission_payments;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.commission_payments DROP COLUMN IF EXISTS project_id;
ALTER TABLE IF EXISTS public.commission_payments DROP COLUMN IF EXISTS person_name;
ALTER TABLE IF EXISTS public.commission_payments DROP COLUMN IF EXISTS reference_no;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'commission_payments' AND column_name = 'notes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'commission_payments' AND column_name = 'note'
  ) THEN
    ALTER TABLE public.commission_payments RENAME COLUMN notes TO note;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.commissions ADD COLUMN IF NOT EXISTS person_id uuid;

DO $$
BEGIN
  IF to_regclass('public.workers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_person_id_fkey')
  THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_person_id_fkey
      FOREIGN KEY (person_id) REFERENCES public.workers(id) ON DELETE SET NULL NOT VALID;
    ALTER TABLE public.commissions VALIDATE CONSTRAINT commissions_person_id_fkey;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.commissions DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS public.idx_commission_payment_records_project_id;
DROP INDEX IF EXISTS public.idx_commission_payment_records_commission_id;
DROP INDEX IF EXISTS public.idx_commission_payment_records_payment_date;
DROP INDEX IF EXISTS public.idx_project_commissions_project_id;
DROP INDEX IF EXISTS public.idx_project_commissions_status;

CREATE INDEX IF NOT EXISTS idx_commission_payments_commission_id ON public.commission_payments (commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_payment_date ON public.commission_payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_commissions_project_id ON public.commissions (project_id);
