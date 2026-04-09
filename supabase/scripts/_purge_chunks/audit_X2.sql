INSERT INTO public._e2e_audit_batch
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
;
