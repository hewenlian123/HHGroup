-- Align labor_workers with workers so labor_entries.worker_id and Worker Balances use the same UUIDs
-- as worker_advances / worker_payments / worker_reimbursements (all reference public.workers.id).
--
-- 1) Re-assert sync trigger: same id on INSERT/UPDATE name into labor_workers.
-- 2) Backfill labor_workers from workers.
-- 3) Re-point labor_entries from orphan labor_workers rows (id not in workers) to the unique
--    workers row with the same normalized name, then remove orphan labor_workers rows.

CREATE OR REPLACE FUNCTION public.sync_worker_to_labor_workers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'labor_workers'
  ) THEN
    INSERT INTO public.labor_workers (id, name)
    VALUES (NEW.id, NEW.name)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_worker_to_labor_workers_trigger ON public.workers;
CREATE TRIGGER sync_worker_to_labor_workers_trigger
  AFTER INSERT OR UPDATE OF name ON public.workers
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_worker_to_labor_workers();

-- Ensure every workers row exists in labor_workers (idempotent).
INSERT INTO public.labor_workers (id, name)
SELECT id, name FROM public.workers
ON CONFLICT (id) DO UPDATE SET name = excluded.name;

-- Move labor_entries off labor_workers UUIDs that are not in workers, when exactly one workers
-- row matches by normalized name.
DO $$
BEGIN
  IF to_regclass('public.labor_entries') IS NOT NULL THEN
    WITH orphans AS (
      SELECT lw.id AS old_id, lw.name AS lw_name
      FROM public.labor_workers lw
      WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = lw.id)
    ),
    univ AS (
      SELECT o.old_id, w.id AS new_id
      FROM orphans o
      INNER JOIN public.workers w
        ON lower(trim(both from coalesce(w.name, ''))) = lower(trim(both from coalesce(o.lw_name, '')))
      WHERE (
        SELECT COUNT(*)::int
        FROM public.workers w2
        WHERE lower(trim(both from coalesce(w2.name, ''))) = lower(trim(both from coalesce(o.lw_name, '')))
      ) = 1
    )
    UPDATE public.labor_entries le
    SET worker_id = u.new_id
    FROM univ u
    WHERE le.worker_id = u.old_id;
  END IF;
END $$;

-- Remove labor_workers rows that are not backed by workers (orphan copies / stale ids).
DELETE FROM public.labor_workers lw
WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = lw.id);

-- Final upsert so labor_workers mirrors workers exactly.
INSERT INTO public.labor_workers (id, name)
SELECT id, name FROM public.workers
ON CONFLICT (id) DO UPDATE SET name = excluded.name;
