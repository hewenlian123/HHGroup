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
OR li.memo ILIKE '%E2E%';

DELETE FROM public.worker_invoices wi
WHERE wi.id = '44444444-4444-4444-4444-444444444446'::uuid
   OR wi.invoice_file ILIKE '%E2E%';

-- estimate_items / estimate_meta / estimate_snapshots cascade when parent estimate is removed
DELETE FROM public.estimates es
WHERE es.id = '44444444-4444-4444-4444-444444444449'::uuid
   OR es.number ILIKE '%E2E%'
   OR es.client ILIKE '%E2E%'
   OR es.project ILIKE '%E2E%';

-- ─── 7) Documents / photos / tasks / links ───────────────────────────────────
DELETE FROM public.documents d
WHERE d.project_id = '11111111-1111-1111-1111-111111111111'::uuid
   OR d.file_url ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
   OR d.file_url LIKE '[[]E2E]%';

DELETE FROM public.site_photos sp
WHERE sp.project_id = '11111111-1111-1111-1111-111111111111'::uuid
   OR sp.description ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
OR sp.description LIKE '[[]E2E]%';

DELETE FROM public.project_tasks pt
WHERE pt.project_id = '11111111-1111-1111-1111-111111111111'::uuid;

DO $blk$
BEGIN
  IF to_regclass('public.project_subcontractors') IS NOT NULL THEN
    EXECUTE $q$
DELETE FROM public.project_subcontractors ps
      WHERE ps.project_id = '11111111-1111-1111-1111-111111111111'::uuid
    $q$;
  END IF;
END
$blk$;

-- ─── 8) Projects / customers ────────────────────────────────────────────────
DELETE FROM public.projects p
WHERE p.id = '11111111-1111-1111-1111-111111111111'::uuid
   OR p.name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%Overlord%','%E2E%','%Seed%'])
   OR p.name LIKE '[[]E2E]%';

DELETE FROM public.customers cu
WHERE cu.id = '33333333-3333-3333-3333-333333333333'::uuid
   OR cu.name ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%E2E%','%Seed%'])
   OR cu.name LIKE '[[]E2E]%';

-- ─── 9) Vendors / accounts / categories / subs / workers ─────────────────────
DELETE FROM public.vendors v
WHERE v.name = '[E2E] Seed Vendor' OR v.name ILIKE '%E2E%' OR v.name ILIKE '%Seed%';

DELETE FROM public.accounts a
WHERE a.id = '44444444-4444-4444-4444-444444444442'::uuid
   OR a.name = '[E2E] Seed Cash'
   OR a.name ILIKE '%E2E%';

DO $blk$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.categories c
      WHERE c.name LIKE '[[]E2E] %' OR c.name ILIKE '%E2E%'
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
