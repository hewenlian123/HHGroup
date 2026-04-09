DO $$
DECLARE n bigint;
  sql text;
BEGIN
  sql := $s$
    SELECT count(*)::bigint FROM public.labor_entries le
    WHERE le.id = '66666666-6666-6666-6666-666666666661'::uuid
       OR le.worker_id = '22222222-2222-2222-2222-222222222222'::uuid
       OR le.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
       OR le.cost_code = '[E2E]'
  $s$;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'project_id'
  ) THEN
    sql := sql || $s$ OR le.project_id = '11111111-1111-1111-1111-111111111111'::uuid$s$;
  END IF;
  EXECUTE sql INTO n;
  INSERT INTO _e2e_audit_batch VALUES ('labor_entries', n);

  IF to_regclass('public.bank_transactions') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*)::bigint FROM public.bank_transactions bt
      WHERE bt.description ILIKE '%E2E%' OR bt.vendor_name ILIKE '%E2E%' OR bt.notes ILIKE '%E2E%'
         OR bt.description ILIKE '%Seed%' OR bt.vendor_name ILIKE '%Seed%' OR bt.notes ILIKE '%Seed%'
    $q$ INTO n;
    INSERT INTO _e2e_audit_batch VALUES ('bank_transactions (e2e-ish)', n);
  END IF;

  IF to_regclass('public.ap_bill_payments') IS NOT NULL AND to_regclass('public.ap_bills') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*)::bigint FROM public.ap_bill_payments p
      WHERE EXISTS (
        SELECT 1 FROM public.ap_bills b
        WHERE b.id = p.bill_id
          AND (b.id = '44444444-4444-4444-4444-444444444443'::uuid
            OR b.vendor_name ILIKE '%E2E%' OR b.notes ILIKE '%E2E%' OR b.bill_no ILIKE '%E2E%')
      )
    $q$ INTO n;
    INSERT INTO _e2e_audit_batch VALUES ('ap_bill_payments', n);
  END IF;

  IF to_regclass('public.ap_bills') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*)::bigint FROM public.ap_bills b
      WHERE b.id = '44444444-4444-4444-4444-444444444443'::uuid
         OR b.vendor_name ILIKE '%E2E%' OR b.notes ILIKE '%E2E%' OR b.bill_no ILIKE '%E2E%'
    $q$ INTO n;
    INSERT INTO _e2e_audit_batch VALUES ('ap_bills', n);
  END IF;

  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*)::bigint FROM public.categories c
      WHERE c.name LIKE '[[]E2E] %' OR c.name ILIKE '%E2E%'
    $q$ INTO n;
    INSERT INTO _e2e_audit_batch VALUES ('categories', n);
  END IF;

  IF to_regclass('public.project_subcontractors') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*)::bigint FROM public.project_subcontractors ps
      WHERE ps.project_id = '11111111-1111-1111-1111-111111111111'::uuid
    $q$ INTO n;
    INSERT INTO _e2e_audit_batch VALUES ('project_subcontractors', n);
  END IF;
END $$;
