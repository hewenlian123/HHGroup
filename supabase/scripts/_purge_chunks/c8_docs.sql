OR li.memo ILIKE '%E2E%';

DELETE FROM public.worker_invoices wi
WHERE wi.id = '44444444-4444-4444-4444-444444444446'::uuid
   OR wi.invoice_file ILIKE '%E2E%';

-- estimate_items / estimate_meta / estimate_snapshots cascade when parent estimate is removed
DELETE FROM public.estimates es
WHERE es.id = '44444444-4444-4444-4444-444444444449'::uuid
   OR es.number ILIKE '%E2E%'
   OR es.client ILIKE '%E2E%'
   OR es.project ILIKE '%E2E%';

-- ─── 7) Documents / photos / tasks / links ───────────────────────────────────
DELETE FROM public.documents d
WHERE d.project_id = '11111111-1111-1111-1111-111111111111'::uuid
   OR d.file_url ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
   OR d.file_url LIKE '[[]E2E]%';

DELETE FROM public.site_photos sp
WHERE sp.project_id = '11111111-1111-1111-1111-111111111111'::uuid
   OR sp.description ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
