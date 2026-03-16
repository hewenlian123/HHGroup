-- Tag test/seeded tasks so they can be bulk-deleted (e.g. DELETE FROM project_tasks WHERE is_test = true).
-- Tests and seed scripts should set is_test = true when creating test data.

ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.project_tasks.is_test IS 'When true, row is test/seed data and can be wiped by cleanup scripts.';

CREATE INDEX IF NOT EXISTS idx_project_tasks_is_test ON public.project_tasks (is_test) WHERE is_test = true;
