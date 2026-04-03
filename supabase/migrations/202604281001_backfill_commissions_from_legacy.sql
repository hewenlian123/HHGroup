-- Copy data from legacy tables (project_commissions / commission_payment_records)
-- into the production tables the app reads (commissions / commission_payments).
-- Safe to re-run: only inserts rows whose id is not already present.

DO $_$
BEGIN
  IF to_regclass('public.project_commissions') IS NOT NULL
     AND to_regclass('public.commissions') IS NOT NULL THEN
    INSERT INTO public.commissions (
      id, project_id, person, role, calculation_mode, rate, base_amount, commission_amount, notes, created_at
    )
    SELECT
      pc.id,
      pc.project_id,
      COALESCE(NULLIF(btrim(pc.person_name), ''), ''),
      pc.role,
      lower(pc.calculation_mode::text),
      pc.rate,
      pc.base_amount,
      pc.commission_amount,
      pc.notes,
      pc.created_at
    FROM public.project_commissions pc
    WHERE NOT EXISTS (SELECT 1 FROM public.commissions c WHERE c.id = pc.id);
  END IF;

  IF to_regclass('public.commission_payment_records') IS NOT NULL
     AND to_regclass('public.commission_payments') IS NOT NULL THEN
    INSERT INTO public.commission_payments (
      id, commission_id, amount, payment_method, payment_date, note, created_at
    )
    SELECT
      pr.id,
      pr.commission_id,
      pr.amount,
      pr.payment_method,
      pr.payment_date,
      CASE
        WHEN pr.reference_no IS NOT NULL AND btrim(COALESCE(pr.reference_no, '')) <> '' THEN
          CASE
            WHEN pr.notes IS NOT NULL AND btrim(pr.notes) <> '' THEN pr.notes || chr(10) || 'Ref: ' || pr.reference_no
            ELSE 'Ref: ' || pr.reference_no
          END
        ELSE pr.notes
      END,
      pr.created_at
    FROM public.commission_payment_records pr
    WHERE NOT EXISTS (SELECT 1 FROM public.commission_payments p WHERE p.id = pr.id)
      AND EXISTS (SELECT 1 FROM public.commissions c WHERE c.id = pr.commission_id);
  END IF;
END
$_$;

NOTIFY pgrst, 'reload schema';
