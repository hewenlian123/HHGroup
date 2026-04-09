INSERT INTO public._e2e_audit_batch
SELECT 'estimate_meta', count(*)::bigint
FROM public.estimate_meta em
WHERE em.estimate_id = '44444444-4444-4444-4444-444444444449'::uuid


UNION ALL
 SELECT 'estimates', count(*)::bigint
FROM public.estimates es
WHERE es.id = '44444444-4444-4444-4444-444444444449'::uuid
   OR es.number ILIKE '%E2E%' OR es.client ILIKE '%E2E%' OR es.project ILIKE '%E2E%'


UNION ALL
 SELECT 'documents', count(*)::bigint
FROM public.documents d
WHERE d.project_id = '11111111-1111-1111-1111-111111111111'::uuid
   OR d.file_url ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
   OR d.file_url LIKE '[[]E2E]%'


UNION ALL
 SELECT 'site_photos', count(*)::bigint
FROM public.site_photos sp
WHERE sp.project_id = '11111111-1111-1111-1111-111111111111'::uuid
   OR sp.description ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
   OR sp.description LIKE '[[]E2E]%'


UNION ALL
 SELECT 'project_tasks', count(*)::bigint
FROM public.project_tasks pt
WHERE pt.project_id = '11111111-1111-1111-1111-111111111111'::uuid


UNION ALL
 SELECT 'projects', count(*)::bigint
FROM public.projects p
WHERE p.id = '11111111-1111-1111-1111-111111111111'::uuid
   OR p.name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%Overlord%','%E2E%','%Seed%'])
   OR p.name LIKE '[[]E2E]%'


UNION ALL
 SELECT 'customers', count(*)::bigint
FROM public.customers cu
WHERE cu.id = '33333333-3333-3333-3333-333333333333'::uuid
   OR cu.name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
   OR cu.name LIKE '[[]E2E]%'


UNION ALL
 SELECT 'subcontractors', count(*)::bigint
FROM public.subcontractors s
WHERE s.name LIKE '[[]E2E] %' OR s.name ILIKE '%E2E%'


UNION ALL
 SELECT 'vendors', count(*)::bigint
FROM public.vendors v
WHERE v.name = '[E2E] Seed Vendor' OR v.name ILIKE '%E2E%' OR v.name ILIKE '%Seed%'


UNION ALL
 SELECT 'accounts', count(*)::bigint
FROM public.accounts a
WHERE a.id = '44444444-4444-4444-4444-444444444442'::uuid OR a.name = '[E2E] Seed Cash' OR a.name ILIKE '%E2E%'


UNION ALL
 SELECT 'payment_accounts', count(*)::bigint
FROM public.payment_accounts pa
WHERE pa.name ILIKE 'E2E-Pay-%' OR pa.name ILIKE '%E2E%'


UNION ALL
 SELECT 'labor_workers', count(*)::bigint
FROM public.labor_workers lw
WHERE lw.id = '22222222-2222-2222-2222-222222222222'::uuid


UNION ALL
 SELECT 'workers', count(*)::bigint
FROM public.workers w
WHERE w.id = '22222222-2222-2222-2222-222222222222'::uuid
   OR w.name ILIKE '%E2E%' OR w.name ILIKE '%Seed%';