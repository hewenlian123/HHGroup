-- =============================================================================
-- Production catch-up (manual SQL Editor / psql) — idempotent where possible
-- =============================================================================
-- Preferred for ongoing deploys: GitHub Actions runs `supabase db push` before
-- Vercel (see .github/workflows/ci.yml) using secret SUPABASE_DB_URL.
--
-- Use THIS file when:
--   - migration history on production is out of sync with supabase_migrations, or
--   - you need a one-shot paste into Supabase Dashboard → SQL Editor.
--
-- Contents (newest-first batches, safe to re-run for IF NOT EXISTS sections):
--   1) 202604241300_schema_code_column_alignment.sql  (generated columns + alters)
--   2) 202604231000_fix_worker_id_alignment.sql       (labor_workers / workers)
--   3) 202604221000_add_client_name_to_projects.sql
--   4) 202604161000_add_missing_columns.sql
--
-- This does NOT replace the full chain in supabase/migrations/*.sql. For a new
-- database or full parity, run:  supabase db push --db-url "$SUPABASE_DB_URL"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 202604161000_add_missing_columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.punch_list
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.workers(id) ON DELETE SET NULL;

ALTER TABLE public.project_change_orders
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.workers(id) ON DELETE SET NULL;

ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS payment_method text NULL;

-- -----------------------------------------------------------------------------
-- 202604221000_add_client_name_to_projects
-- -----------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name text;

UPDATE public.projects p
SET client_name = btrim(p.client::text)
WHERE (p.client_name IS NULL OR btrim(p.client_name) = '')
  AND p.client IS NOT NULL
  AND btrim(p.client::text) <> '';

COMMENT ON COLUMN public.projects.client_name IS 'Display/client name mirror; keep in sync with client where used.';

-- -----------------------------------------------------------------------------
-- 202604231000_fix_worker_id_alignment
-- -----------------------------------------------------------------------------
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

INSERT INTO public.labor_workers (id, name)
SELECT id, name FROM public.workers
ON CONFLICT (id) DO UPDATE SET name = excluded.name;

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
        ON lower(trim(both FROM coalesce(w.name, ''))) = lower(trim(both FROM coalesce(o.lw_name, '')))
      WHERE (
        SELECT COUNT(*)::int
        FROM public.workers w2
        WHERE lower(trim(both FROM coalesce(w2.name, ''))) = lower(trim(both FROM coalesce(o.lw_name, '')))
      ) = 1
    )
    UPDATE public.labor_entries le
    SET worker_id = u.new_id
    FROM univ u
    WHERE le.worker_id = u.old_id;
  END IF;
END $$;

DELETE FROM public.labor_workers lw
WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = lw.id);

INSERT INTO public.labor_workers (id, name)
SELECT id, name FROM public.workers
ON CONFLICT (id) DO UPDATE SET name = excluded.name;

-- -----------------------------------------------------------------------------
-- 202604241300_schema_code_column_alignment
-- -----------------------------------------------------------------------------
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_by text NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (file_name) STORED;

ALTER TABLE public.expense_lines
  ADD COLUMN IF NOT EXISTS name text NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (vendor_name) STORED;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON public.expenses (project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS quantity numeric GENERATED ALWAYS AS (qty) STORED;

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS payment_date date GENERATED ALWAYS AS (paid_at) STORED;

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS reference text GENERATED ALWAYS AS (memo) STORED;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (btrim(invoice_no || ' ' || client_name)) STORED;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_am_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_pm_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE public.labor_entries
      ADD COLUMN project_id uuid GENERATED ALWAYS AS (COALESCE(project_am_id, project_pm_id)) STORED;
  END IF;
END $$;

ALTER TABLE public.labor_entries
  ADD COLUMN IF NOT EXISTS hours numeric NULL;

ALTER TABLE public.labor_entries
  ADD COLUMN IF NOT EXISTS notes text NULL;

ALTER TABLE public.project_change_orders
  ADD COLUMN IF NOT EXISTS amount numeric GENERATED ALWAYS AS (total) STORED;

ALTER TABLE public.project_material_selections
  ADD COLUMN IF NOT EXISTS photo_url text NULL;

ALTER TABLE public.worker_payments
  ADD COLUMN IF NOT EXISTS amount numeric GENERATED ALWAYS AS (total_amount) STORED;

ALTER TABLE public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS vendor text NULL;

ALTER TABLE public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL;

ALTER TABLE public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.worker_reimbursements
  ADD COLUMN IF NOT EXISTS description text NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worker_reimbursements' AND column_name = 'description'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worker_reimbursements' AND column_name = 'notes'
  ) THEN
    UPDATE public.worker_reimbursements wr
    SET description = wr.notes
    WHERE wr.description IS NULL AND wr.notes IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.bank_transactions.reconciled_by IS 'Optional actor id or label when status=reconciled.';
COMMENT ON COLUMN public.expenses.project_id IS 'Optional header-level project; expense_lines.project_id remains line-level.';
COMMENT ON COLUMN public.labor_entries.project_id IS 'COALESCE(AM project, PM project) when both exist on daily labor schema.';
COMMENT ON COLUMN public.worker_payments.amount IS 'Generated mirror of total_amount for API compatibility.';
