-- Worker daily-rate history + labor entry pay snapshots.
-- Non-destructive: existing labor_entries.cost_amount is preserved and copied into
-- snapshot columns; no historical balances are recalculated.

CREATE TABLE IF NOT EXISTS public.worker_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  rate_type text NOT NULL DEFAULT 'daily',
  daily_rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_to date NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_rate_history_rate_type_check CHECK (rate_type = 'daily'),
  CONSTRAINT worker_rate_history_daily_rate_check CHECK (daily_rate >= 0),
  CONSTRAINT worker_rate_history_date_range_check CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_rate_history_worker_type_from
  ON public.worker_rate_history (worker_id, rate_type, effective_from);

CREATE INDEX IF NOT EXISTS idx_worker_rate_history_effective_lookup
  ON public.worker_rate_history (worker_id, rate_type, effective_from DESC, effective_to);

CREATE INDEX IF NOT EXISTS idx_worker_rate_history_active
  ON public.worker_rate_history (worker_id, rate_type)
  WHERE effective_to IS NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_rate_history_updated_at ON public.worker_rate_history;
CREATE TRIGGER trg_worker_rate_history_updated_at
  BEFORE UPDATE ON public.worker_rate_history
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.labor_entries
  ADD COLUMN IF NOT EXISTS days_worked numeric NULL,
  ADD COLUMN IF NOT EXISTS daily_rate_snapshot numeric NULL,
  ADD COLUMN IF NOT EXISTS amount_snapshot numeric NULL,
  ADD COLUMN IF NOT EXISTS labor_cost_snapshot numeric NULL,
  ADD COLUMN IF NOT EXISTS rate_history_id uuid NULL REFERENCES public.worker_rate_history(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_labor_entries_rate_history_id
  ON public.labor_entries (rate_history_id)
  WHERE rate_history_id IS NOT NULL;

-- Backfill one current history row per worker when none exists.
WITH earliest_labor AS (
  SELECT worker_id, min(work_date) AS first_work_date
  FROM public.labor_entries
  GROUP BY worker_id
)
INSERT INTO public.worker_rate_history (
  worker_id,
  rate_type,
  daily_rate,
  effective_from,
  effective_to,
  notes
)
SELECT
  w.id,
  'daily',
  GREATEST(
    COALESCE(NULLIF(w.daily_rate, 0), NULLIF(w.half_day_rate, 0), 0),
    0
  ),
  COALESCE(e.first_work_date, w.created_at::date, current_date),
  NULL,
  'Backfilled from current worker daily rate'
FROM public.workers w
LEFT JOIN earliest_labor e ON e.worker_id = w.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.worker_rate_history h
  WHERE h.worker_id = w.id
    AND h.rate_type = 'daily'
);

-- Backfill days_worked from AM/PM flags first. For older hour-based rows,
-- small decimal values (0.5 / 1 / 1.5) are treated as day units; larger
-- values are interpreted as conventional hours and converted to days.
UPDATE public.labor_entries
SET days_worked = CASE
  WHEN morning IS TRUE AND afternoon IS TRUE THEN 1
  WHEN morning IS TRUE OR afternoon IS TRUE THEN 0.5
  WHEN hours IS NOT NULL AND hours > 0 AND hours <= 2 THEN hours
  WHEN hours IS NOT NULL AND hours > 0 THEN hours / 8
  ELSE days_worked
END
WHERE days_worked IS NULL;

DO $$
DECLARE
  has_total boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'labor_entries'
      AND column_name = 'total'
  )
  INTO has_total;

  IF has_total THEN
    EXECUTE $sql$
      UPDATE public.labor_entries
      SET amount_snapshot = COALESCE(amount_snapshot, cost_amount, total)
      WHERE amount_snapshot IS NULL
    $sql$;
  ELSE
    UPDATE public.labor_entries
    SET amount_snapshot = COALESCE(amount_snapshot, cost_amount)
    WHERE amount_snapshot IS NULL;
  END IF;
END $$;

UPDATE public.labor_entries
SET labor_cost_snapshot = COALESCE(labor_cost_snapshot, amount_snapshot, cost_amount)
WHERE labor_cost_snapshot IS NULL;

UPDATE public.labor_entries
SET daily_rate_snapshot = amount_snapshot / NULLIF(days_worked, 0)
WHERE daily_rate_snapshot IS NULL
  AND amount_snapshot IS NOT NULL
  AND days_worked IS NOT NULL
  AND days_worked > 0;

WITH matched_history AS (
  SELECT
    le.id AS labor_entry_id,
    h.id AS rate_history_id,
    h.daily_rate
  FROM public.labor_entries le
  JOIN LATERAL (
    SELECT id, daily_rate
    FROM public.worker_rate_history h
    WHERE h.worker_id = le.worker_id
      AND h.rate_type = 'daily'
      AND h.effective_from <= le.work_date
      AND (h.effective_to IS NULL OR h.effective_to >= le.work_date)
    ORDER BY h.effective_from DESC, h.created_at DESC
    LIMIT 1
  ) h ON true
)
UPDATE public.labor_entries le
SET
  rate_history_id = COALESCE(le.rate_history_id, matched_history.rate_history_id),
  daily_rate_snapshot = COALESCE(le.daily_rate_snapshot, matched_history.daily_rate)
FROM matched_history
WHERE le.id = matched_history.labor_entry_id
  AND (le.rate_history_id IS NULL OR le.daily_rate_snapshot IS NULL);

ALTER TABLE public.worker_rate_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.worker_rate_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.worker_rate_history TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.worker_rate_history FROM anon;

DROP POLICY IF EXISTS worker_rate_history_authenticated_select ON public.worker_rate_history;
DROP POLICY IF EXISTS worker_rate_history_authenticated_insert ON public.worker_rate_history;
DROP POLICY IF EXISTS worker_rate_history_authenticated_update ON public.worker_rate_history;
DROP POLICY IF EXISTS worker_rate_history_authenticated_delete ON public.worker_rate_history;

CREATE POLICY worker_rate_history_authenticated_select
  ON public.worker_rate_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY worker_rate_history_authenticated_insert
  ON public.worker_rate_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY worker_rate_history_authenticated_update
  ON public.worker_rate_history
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY worker_rate_history_authenticated_delete
  ON public.worker_rate_history
  FOR DELETE
  TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
