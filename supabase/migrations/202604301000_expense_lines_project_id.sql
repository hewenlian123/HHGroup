-- expense_lines.project_id was dropped in 20260325075614_remote_schema.sql; the app writes
-- line-level project on quick expense / receipt queue (createQuickExpense). PostgREST then
-- errors with "Could not find the 'project_id' column of 'expense_lines' in the schema cache"
-- unless the column exists. Header-level project remains on public.expenses.project_id.

ALTER TABLE IF EXISTS public.expense_lines
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_lines_project_id ON public.expense_lines (project_id)
  WHERE project_id IS NOT NULL;
