-- ─── 4) Receipt queue ───────────────────────────────────────────────────────
DELETE FROM public.receipt_queue rq
WHERE rq.file_name ILIKE 'queue-%'
   OR rq.file_name ILIKE 'receipt-layout-%'
   OR rq.file_name ILIKE 'rq-%'
   OR rq.file_name ILIKE '%E2E%'
   OR rq.file_name ILIKE '%Seed%';

-- ─── 5) Payroll / labor ─────────────────────────────────────────────────────
UPDATE public.labor_entries le
SET worker_payment_id = NULL
WHERE le.worker_id = '22222222-2222-2222-2222-222222222222'::uuid;

DELETE FROM public.worker_reimbursements wr
WHERE wr.description = '[E2E] SEED reimb'
   OR wr.description ILIKE '%E2E%'
   OR wr.vendor ILIKE '%E2E%';

DELETE FROM public.worker_payments wp
WHERE wp.worker_id = '22222222-2222-2222-2222-222222222222'::uuid;

DO $blk$
DECLARE sql text;
BEGIN
  sql := $s$
    DELETE FROM public.labor_entries le
    WHERE le.id = '66666666-6666-6666-6666-666666666661'::uuid
       OR le.worker_id = '22222222-2222-2222-2222-222222222222'::uuid
       OR le.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
       OR le.cost_code = '[E2E]'
