);

DELETE FROM public.commissions c
WHERE c.person ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
   OR c.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%']);
