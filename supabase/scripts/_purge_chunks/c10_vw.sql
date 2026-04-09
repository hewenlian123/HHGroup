DELETE FROM public.project_subcontractors ps
      WHERE ps.project_id = '11111111-1111-1111-1111-111111111111'::uuid
    $q$;
  END IF;
END
$blk$;

-- ─── 8) Projects / customers ────────────────────────────────────────────────
DELETE FROM public.projects p
WHERE p.id = '11111111-1111-1111-1111-111111111111'::uuid
   OR p.name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%Overlord%','%E2E%','%Seed%'])
   OR p.name LIKE '[[]E2E]%';

DELETE FROM public.customers cu
WHERE cu.id = '33333333-3333-3333-3333-333333333333'::uuid
   OR cu.name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
   OR cu.name LIKE '[[]E2E]%';

-- ─── 9) Vendors / accounts / categories / subs / workers ─────────────────────
DELETE FROM public.vendors v
WHERE v.name = '[E2E] Seed Vendor' OR v.name ILIKE '%E2E%' OR v.name ILIKE '%Seed%';

DELETE FROM public.accounts a
WHERE a.id = '44444444-4444-4444-4444-444444444442'::uuid
   OR a.name = '[E2E] Seed Cash'
   OR a.name ILIKE '%E2E%';

DO $blk$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.categories c
      WHERE c.name LIKE '[[]E2E] %' OR c.name ILIKE '%E2E%'
