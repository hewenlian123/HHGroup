-- Align worker_payments RLS with JWT-authenticated PostgREST clients.
-- Migration 202604271519_worker_payments.sql granted anon; sessions use role "authenticated".

DO $$
BEGIN
  IF to_regclass('public.worker_payments') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY worker_payments_authenticated_select
      ON public.worker_payments
      FOR SELECT
      TO authenticated
      USING (true)
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY worker_payments_authenticated_insert
      ON public.worker_payments
      FOR INSERT
      TO authenticated
      WITH CHECK (true)
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY worker_payments_authenticated_update
      ON public.worker_payments
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_delete'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY worker_payments_authenticated_delete
      ON public.worker_payments
      FOR DELETE
      TO authenticated
      USING (true)
    $pol$;
  END IF;
END $$;
