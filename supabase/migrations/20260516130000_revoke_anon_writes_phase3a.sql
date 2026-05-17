-- Phase 3A: no-risk Supabase tightening.
-- Goal: prevent anonymous writes while preserving current authenticated app flows.
-- This migration intentionally does not remove anon SELECT policies.

DO $$
DECLARE
  target_table text;
  target_policy record;
  anon_select_allowed boolean;
  target_tables text[] := ARRAY[
    'projects',
    'customers',
    'invoices',
    'invoice_items',
    'invoice_payments',
    'estimates',
    'estimate_items',
    'project_change_orders',
    'project_change_order_items',
    'expenses',
    'expense_lines',
    'expense_attachments',
    'payment_received_attachments',
    'bank_transactions',
    'workers',
    'labor_entries',
    'worker_payments',
    'worker_advances',
    'worker_reimbursements',
    'worker_receipts',
    'company_profile',
    'categories',
    'payment_methods',
    'expense_options',
    'payment_accounts',
    'vendors',
    'commissions',
    'commission_payments'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT has_table_privilege('anon', format('public.%I', target_table), 'SELECT')
    INTO anon_select_allowed;

    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon', target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', target_table);

    FOR target_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
        AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_policy.policyname, target_table);
    END LOOP;

    IF anon_select_allowed THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', target_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3a_' || target_table || '_anon_select', target_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (true)',
        'phase3a_' || target_table || '_anon_select',
        target_table
      );
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3a_' || target_table || '_authenticated_select', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3a_' || target_table || '_authenticated_insert', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3a_' || target_table || '_authenticated_update', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'phase3a_' || target_table || '_authenticated_delete', target_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      'phase3a_' || target_table || '_authenticated_select',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      'phase3a_' || target_table || '_authenticated_insert',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      'phase3a_' || target_table || '_authenticated_update',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)',
      'phase3a_' || target_table || '_authenticated_delete',
      target_table
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  target_bucket text;
  policy_prefix text;
  target_policy record;
  public_read_allowed boolean;
  insert_buckets text[] := ARRAY[
    'branding',
    'receipts',
    'expense-attachments',
    'payment-attachments',
    'worker-receipts',
    'commission-receipts',
    'commission-payment-receipts',
    'punch-photos'
  ];
  update_buckets text[] := ARRAY[
    'branding',
    'receipts',
    'expense-attachments',
    'payment-attachments'
  ];
  delete_buckets text[] := ARRAY[
    'branding',
    'receipts',
    'expense-attachments',
    'payment-attachments',
    'punch-photos'
  ];
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  FOREACH target_bucket IN ARRAY insert_buckets LOOP
    policy_prefix := 'phase3a_' || regexp_replace(target_bucket, '[^a-zA-Z0-9]+', '_', 'g') || '_authenticated';

    SELECT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND cmd IN ('ALL', 'SELECT')
        AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
        AND (
          coalesce(qual, '') ILIKE '%' || target_bucket || '%'
          OR coalesce(with_check, '') ILIKE '%' || target_bucket || '%'
        )
    )
    INTO public_read_allowed;

    FOR target_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
        AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
        AND (
          coalesce(qual, '') ILIKE '%' || target_bucket || '%'
          OR coalesce(with_check, '') ILIKE '%' || target_bucket || '%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', target_policy.policyname);
    END LOOP;

    IF public_read_allowed THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'phase3a_' || regexp_replace(target_bucket, '[^a-zA-Z0-9]+', '_', 'g') || '_public_read');
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = %L)',
        'phase3a_' || regexp_replace(target_bucket, '[^a-zA-Z0-9]+', '_', 'g') || '_public_read',
        target_bucket
      );
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_prefix || '_insert');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)',
      policy_prefix || '_insert',
      target_bucket
    );

    IF target_bucket = ANY(update_buckets) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_prefix || '_update');
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
        policy_prefix || '_update',
        target_bucket,
        target_bucket
      );
    END IF;

    IF target_bucket = ANY(delete_buckets) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_prefix || '_delete');
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)',
        policy_prefix || '_delete',
        target_bucket
      );
    END IF;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
