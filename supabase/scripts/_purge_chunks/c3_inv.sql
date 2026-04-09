-- ─── 2) AR: invoice_payments / payments_received / items cascade from invoices ─
DELETE FROM public.invoices i
WHERE i.id = '44444444-4444-4444-4444-444444444447'::uuid
   OR i.client_name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%'])
   OR i.client_name LIKE '[[]E2E]%'
   OR i.invoice_no ILIKE '%E2E%' OR i.invoice_no ILIKE 'E2E-%'
   OR i.notes ILIKE '%E2E%' OR i.notes ILIKE '%Seed%';

-- Orphan invoice_payments (invoice already removed outside this script)
