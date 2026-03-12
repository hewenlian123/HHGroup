-- Reconcile workers table: add new columns for workers module without breaking
-- the existing labor-db.ts which uses role/half_day_rate.
-- Safe to run multiple times (IF NOT EXISTS / DO $$).

-- Add trade (mirrors role for workers module; role kept for labor-db compatibility)
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS trade text;

-- Backfill trade from role so existing rows are consistent
UPDATE public.workers SET trade = role WHERE trade IS NULL AND role IS NOT NULL;

-- Add daily_rate (separate from half_day_rate used by labor-db)
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS daily_rate numeric DEFAULT 0;

-- Add default_ot_rate
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS default_ot_rate numeric DEFAULT 0;

-- Update status check to accept both case styles (Active/Inactive and active/inactive)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'workers'
      AND constraint_name = 'workers_status_check'
  ) THEN
    ALTER TABLE public.workers DROP CONSTRAINT workers_status_check;
  END IF;
END $$;

ALTER TABLE public.workers
  ADD CONSTRAINT workers_status_check_v2
  CHECK (status IN ('active', 'inactive', 'Active', 'Inactive'));

COMMENT ON COLUMN public.workers.trade IS 'Trade/specialty (mirrors role for workers module)';
COMMENT ON COLUMN public.workers.daily_rate IS 'Full-day rate for payroll';
COMMENT ON COLUMN public.workers.default_ot_rate IS 'Default overtime rate';
