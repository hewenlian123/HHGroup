-- Backfill denormalized labor_entry_ids from labor_entries.worker_payment_id (historical receipts).
UPDATE public.worker_payments wp
SET labor_entry_ids = s.ids
FROM (
  SELECT
    le.worker_payment_id AS pid,
    array_agg(le.id ORDER BY le.work_date DESC NULLS LAST, le.id) AS ids
  FROM public.labor_entries le
  WHERE le.worker_payment_id IS NOT NULL
  GROUP BY le.worker_payment_id
) s
WHERE wp.id = s.pid
  AND (
    wp.labor_entry_ids IS NULL
    OR coalesce(array_length(wp.labor_entry_ids, 1), 0) = 0
  );
