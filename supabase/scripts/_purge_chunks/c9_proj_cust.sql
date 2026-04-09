OR sp.description LIKE '[[]E2E]%';

DELETE FROM public.project_tasks pt
WHERE pt.project_id = '11111111-1111-1111-1111-111111111111'::uuid;

DO $blk$
BEGIN
  IF to_regclass('public.project_subcontractors') IS NOT NULL THEN
    EXECUTE $q$
