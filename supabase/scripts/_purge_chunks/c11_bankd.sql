$q$;
  END IF;
END
$blk$;

DELETE FROM public.subcontractors s
WHERE s.name LIKE '[[]E2E] %' OR s.name ILIKE '%E2E%';

DELETE FROM public.labor_workers lw
WHERE lw.id = '22222222-2222-2222-2222-222222222222'::uuid;

DELETE FROM public.workers w
WHERE w.id = '22222222-2222-2222-2222-222222222222'::uuid
   OR w.name ILIKE '%E2E%'
   OR w.name ILIKE '%Seed%';

DELETE FROM public.payment_accounts pa
WHERE pa.name ILIKE 'E2E-Pay-%' OR pa.name ILIKE '%E2E%';

-- ─── 10) Bank rows that are clearly test data (after expense unlink) ───────
DO $blk$
BEGIN
  IF to_regclass('public.bank_transactions') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.bank_transactions bt
      WHERE bt.description ILIKE '%E2E%' OR bt.vendor_name ILIKE '%E2E%' OR bt.notes ILIKE '%E2E%'
         OR bt.description ILIKE '%[E2E]%' OR bt.vendor_name ILIKE '%[E2E]%' OR bt.notes ILIKE '%[E2E]%'
    $q$;
  END IF;
END
$blk$;
