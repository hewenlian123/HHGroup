DO $blk$
BEGIN
  IF to_regclass('public.bank_transactions') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.bank_transactions bt
      SET linked_expense_id = NULL
      WHERE bt.linked_expense_id IN (
        SELECT e.id
        FROM public.expenses e
        WHERE e.id = '44444444-4444-4444-4444-444444444441'::uuid
           OR e.vendor_name ILIKE ANY (ARRAY[
             'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
           ])
           OR e.vendor ILIKE ANY (ARRAY[
             'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
           ])
           OR e.vendor_name ILIKE '%E2E%' OR e.vendor ILIKE '%E2E%'
           OR e.vendor_name ILIKE '%Seed%' OR e.vendor ILIKE '%Seed%'
           OR e.vendor_name ILIKE '%[E2E]%' OR e.vendor ILIKE '%[E2E]%'
      )
    $q$;
  END IF;
END
$blk$;
DELETE FROM public.attachments a
WHERE a.entity_type = 'expense'
  AND a.entity_id IN (
    SELECT e.id
    FROM public.expenses e
    WHERE e.id = '44444444-4444-4444-4444-444444444441'::uuid
       OR e.vendor_name ILIKE ANY (ARRAY[
         'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
       ])
       OR e.vendor ILIKE ANY (ARRAY[
         'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
       ])
       OR e.vendor_name ILIKE '%E2E%' OR e.vendor ILIKE '%E2E%'
       OR e.vendor_name ILIKE '%Seed%' OR e.vendor ILIKE '%Seed%'
       OR e.vendor_name ILIKE '%[E2E]%' OR e.vendor ILIKE '%[E2E]%'
  );

DELETE FROM public.expense_lines el
WHERE el.expense_id IN (
  SELECT e.id
  FROM public.expenses e
  WHERE e.id = '44444444-4444-4444-4444-444444444441'::uuid
     OR e.vendor_name ILIKE ANY (ARRAY[
       'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
     ])
     OR e.vendor ILIKE ANY (ARRAY[
       'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
     ])
     OR e.vendor_name ILIKE '%E2E%' OR e.vendor ILIKE '%E2E%'
     OR e.vendor_name ILIKE '%Seed%' OR e.vendor ILIKE '%Seed%'
     OR e.vendor_name ILIKE '%[E2E]%' OR e.vendor ILIKE '%[E2E]%'
);

DELETE FROM public.expenses e
WHERE e.id = '44444444-4444-4444-4444-444444444441'::uuid
   OR e.vendor_name ILIKE ANY (ARRAY[
     'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
   ])
   OR e.vendor ILIKE ANY (ARRAY[
     'E2E-QE-%','E2E-RQ-%','E2E-PV-%','E2E-UP-%','E2E-QP-%','E2E-HD-%','E2E-ED-%','E2E-PM-INLINE-%'
   ])
   OR e.vendor_name ILIKE '%E2E%' OR e.vendor ILIKE '%E2E%'
   OR e.vendor_name ILIKE '%Seed%' OR e.vendor ILIKE '%Seed%'
   OR e.vendor_name ILIKE '%[E2E]%' OR e.vendor ILIKE '%[E2E]%';
-- ─── 2) AR: invoice_payments / payments_received / items cascade from invoices ─
DELETE FROM public.invoices i
WHERE i.id = '44444444-4444-4444-4444-444444444447'::uuid
   OR i.client_name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%'])
   OR i.client_name LIKE '[[]E2E]%'
   OR i.invoice_no ILIKE '%E2E%' OR i.invoice_no ILIKE 'E2E-%'
   OR i.notes ILIKE '%E2E%' OR i.notes ILIKE '%Seed%';

-- Orphan invoice_payments (invoice already removed outside this script)
DELETE FROM public.invoice_payments ip
WHERE NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = ip.invoice_id);

-- ─── 3) Commissions ──────────────────────────────────────────────────────────
DELETE FROM public.commission_payments cp
WHERE EXISTS (
  SELECT 1 FROM public.commissions c
  WHERE c.id = cp.commission_id
    AND (
      c.person ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
      OR c.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
    )
);

DELETE FROM public.commissions c
WHERE c.person ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
   OR c.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%']);
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
