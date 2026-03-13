-- Sync labor_workers from workers
-- Run this in Supabase SQL Editor if you see: "Selected worker(s) not found in the database"
-- (labor_entries.worker_id references labor_workers.id; this copies all workers into labor_workers.)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'labor_workers')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    INSERT INTO public.labor_workers (id, name)
    SELECT id, name FROM public.workers
    ON CONFLICT (id) DO UPDATE SET name = excluded.name;
  END IF;
END $$;
