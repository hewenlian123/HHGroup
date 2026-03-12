-- Alter daily_work_entries from ot_amount to ot_hours + total_pay (for DBs created with the old schema).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_work_entries' AND column_name = 'ot_amount'
  ) THEN
    ALTER TABLE public.daily_work_entries ADD COLUMN IF NOT EXISTS ot_hours numeric NOT NULL DEFAULT 0;
    ALTER TABLE public.daily_work_entries ADD COLUMN IF NOT EXISTS total_pay numeric NOT NULL DEFAULT 0;
    UPDATE public.daily_work_entries e SET
      total_pay = CASE e.day_type
        WHEN 'absent' THEN COALESCE(e.ot_amount, 0)
        WHEN 'half_day' THEN (e.daily_rate * 0.5) + COALESCE(e.ot_amount, 0)
        ELSE e.daily_rate + COALESCE(e.ot_amount, 0)
      END,
      ot_hours = 0;
    ALTER TABLE public.daily_work_entries DROP COLUMN IF EXISTS ot_amount;
  END IF;
END $$;
