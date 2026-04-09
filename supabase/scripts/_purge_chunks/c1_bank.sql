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
