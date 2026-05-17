-- Phase 3B-1: remove anonymous read access from the first bank/labor/payroll batch.
-- Code prep has moved these reads behind guarded server APIs. This migration does not
-- touch storage, workers, receipts, expenses, invoices, projects, customers, or attachments.

DO $$
DECLARE
  target_table text;
  target_policy record;
  target_tables text[] := ARRAY[
    'bank_transactions',
    'labor_entries',
    'labor_payments',
    'worker_payments',
    'worker_advances',
    'worker_reimbursements'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon', target_table);
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM PUBLIC', target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', target_table);

    FOR target_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
        AND cmd IN ('ALL', 'SELECT')
        AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_policy.policyname, target_table);
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3b1_' || target_table || '_authenticated_select', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3b1_' || target_table || '_authenticated_insert', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3b1_' || target_table || '_authenticated_update', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3b1_' || target_table || '_authenticated_delete', target_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      'phase3b1_' || target_table || '_authenticated_select',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      'phase3b1_' || target_table || '_authenticated_insert',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      'phase3b1_' || target_table || '_authenticated_update',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)',
      'phase3b1_' || target_table || '_authenticated_delete',
      target_table
    );
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
