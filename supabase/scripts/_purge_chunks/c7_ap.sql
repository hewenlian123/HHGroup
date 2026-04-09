$s$;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_id'
  ) THEN
    sql := sql || $s$ OR le.project_id = '11111111-1111-1111-1111-111111111111'::uuid$s$;
  END IF;
  EXECUTE sql;
END
$blk$;

-- ─── 6) AP children then bills (if tables exist) ────────────────────────────
DO $blk$
BEGIN
  IF to_regclass('public.ap_bill_payments') IS NOT NULL AND to_regclass('public.ap_bills') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.ap_bill_payments p
      USING public.ap_bills b
      WHERE p.bill_id = b.id
        AND (
          b.id = '44444444-4444-4444-4444-444444444443'::uuid
          OR b.vendor_name ILIKE '%E2E%'
          OR b.notes ILIKE '%E2E%'
          OR b.bill_no ILIKE '%E2E%'
        )
    $q$;
  END IF;
  IF to_regclass('public.ap_bills') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.ap_bills b
      WHERE b.id = '44444444-4444-4444-4444-444444444443'::uuid
         OR b.vendor_name ILIKE '%E2E%'
         OR b.notes ILIKE '%E2E%'
         OR b.bill_no ILIKE '%E2E%'
    $q$;
  END IF;
END
$blk$;

DELETE FROM public.labor_invoices li
WHERE li.invoice_no = '[E2E]-LI-001'
   OR li.invoice_no ILIKE '%E2E%'
