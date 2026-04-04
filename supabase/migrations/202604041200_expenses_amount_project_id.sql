-- Align local / older DBs with quick expense + list: header amount mirror and optional project link.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS amount numeric;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS project_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expenses_project_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'projects'
    ) THEN
      ALTER TABLE public.expenses
        ADD CONSTRAINT expenses_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.expenses.amount IS 'Optional mirror of total for legacy UI / reports; expense_lines remain canonical for splits.';
