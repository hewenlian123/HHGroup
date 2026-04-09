DROP TABLE IF EXISTS public._e2e_audit_batch;
CREATE UNLOGGED TABLE public._e2e_audit_batch (tbl text NOT NULL, n bigint NOT NULL);

INSERT INTO _e2e_audit_batch
SELECT 'expenses' AS tbl, count(*)::bigint AS n
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


UNION ALL
 SELECT 'expense_lines', count(*)::bigint
FROM public.expense_lines el
WHERE EXISTS (
  SELECT 1 FROM public.expenses e WHERE e.id = el.expense_id AND (
    e.id = '44444444-4444-4444-4444-444444444441'::uuid
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
)


UNION ALL
 SELECT 'attachments (expense)', count(*)::bigint
FROM public.attachments a
WHERE a.entity_type = 'expense'
  AND EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = a.entity_id AND (
      e.id = '44444444-4444-4444-4444-444444444441'::uuid
      OR e.vendor_name ILIKE '%E2E%' OR e.vendor ILIKE '%E2E%'
      OR e.vendor_name ILIKE '%Seed%' OR e.vendor ILIKE '%Seed%'
      OR e.vendor_name ILIKE 'E2E-%' OR e.vendor ILIKE 'E2E-%'
    )
  )


UNION ALL
 SELECT 'invoices', count(*)::bigint
FROM public.invoices i
WHERE i.id = '44444444-4444-4444-4444-444444444447'::uuid
   OR i.client_name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%'])
   OR i.client_name LIKE '[[]E2E]%'
   OR i.invoice_no ILIKE '%E2E%' OR i.invoice_no ILIKE 'E2E-%'
   OR i.notes ILIKE '%E2E%' OR i.notes ILIKE '%Seed%'


UNION ALL
 SELECT 'commissions', count(*)::bigint
FROM public.commissions c
WHERE c.person ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
   OR c.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])


UNION ALL
 SELECT 'commission_payments', count(*)::bigint
FROM public.commission_payments cp
WHERE EXISTS (
  SELECT 1 FROM public.commissions c
  WHERE c.id = cp.commission_id
    AND (
      c.person ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
      OR c.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
    )
)


UNION ALL
 SELECT 'receipt_queue', count(*)::bigint
FROM public.receipt_queue rq
WHERE rq.file_name ILIKE 'queue-%' OR rq.file_name ILIKE 'receipt-layout-%' OR rq.file_name ILIKE 'rq-%'
   OR rq.file_name ILIKE '%E2E%' OR rq.file_name ILIKE '%Seed%'


UNION ALL
 SELECT 'worker_payments', count(*)::bigint
FROM public.worker_payments wp
WHERE wp.worker_id = '22222222-2222-2222-2222-222222222222'::uuid


UNION ALL
 SELECT 'worker_reimbursements', count(*)::bigint
FROM public.worker_reimbursements wr
WHERE wr.description = '[E2E] SEED reimb'
   OR wr.description ILIKE '%E2E%' OR wr.vendor ILIKE '%E2E%'


UNION ALL
 SELECT 'worker_invoices', count(*)::bigint
FROM public.worker_invoices wi
WHERE wi.id = '44444444-4444-4444-4444-444444444446'::uuid
   OR wi.invoice_file ILIKE '%E2E%'


UNION ALL
 SELECT 'labor_invoices', count(*)::bigint
FROM public.labor_invoices li
WHERE li.invoice_no = '[E2E]-LI-001' OR li.invoice_no ILIKE '%E2E%' OR li.memo ILIKE '%E2E%'


UNION ALL
 SELECT 'estimate_items', count(*)::bigint
FROM public.estimate_items ei
WHERE ei.estimate_id = '44444444-4444-4444-4444-444444444449'::uuid
   OR EXISTS (
     SELECT 1 FROM public.estimates es
     WHERE es.id = ei.estimate_id
       AND (es.number ILIKE '%E2E%' OR es.client ILIKE '%E2E%' OR es.project ILIKE '%E2E%')
   )

;