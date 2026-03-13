-- Automatically sync labor_workers from workers: whenever a worker is inserted or updated,
-- upsert the same (id, name) into labor_workers so labor_entries.worker_id can resolve.

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

-- One-time backfill: ensure all existing workers are in labor_workers (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'labor_workers')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    INSERT INTO public.labor_workers (id, name)
    SELECT id, name FROM public.workers
    ON CONFLICT (id) DO UPDATE SET name = excluded.name;
  END IF;
END $$;
