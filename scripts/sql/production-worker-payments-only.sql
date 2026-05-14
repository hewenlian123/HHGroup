-- Production-safe worker_payments bootstrap (idempotent).
-- Only CREATE / ALTER / POLICY additions, plus non-destructive idempotency cleanup.
-- No drops and no deletes.

DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS "pgcrypto"';
END $$;

CREATE TABLE IF NOT EXISTS public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  labor_entry_ids uuid[],
  idempotency_key text
);

DO $$
DECLARE
  has_amount boolean;
  amount_is_generated boolean;
BEGIN
  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS id uuid';
  EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN id SET DEFAULT gen_random_uuid()';
  EXECUTE 'UPDATE public.worker_payments SET id = gen_random_uuid() WHERE id IS NULL';
  EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN id SET NOT NULL';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'worker_payments'
      AND c.contype = 'p'
  ) THEN
    EXECUTE 'ALTER TABLE public.worker_payments ADD CONSTRAINT worker_payments_pkey PRIMARY KEY (id)';
  END IF;

  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS worker_id uuid';
  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS total_amount numeric';

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'worker_payments'
      AND column_name = 'amount'
  )
  INTO has_amount;

  IF has_amount THEN
    EXECUTE 'UPDATE public.worker_payments SET total_amount = amount WHERE total_amount IS NULL AND amount IS NOT NULL';
  END IF;

  EXECUTE 'UPDATE public.worker_payments SET total_amount = 0 WHERE total_amount IS NULL';
  EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN total_amount SET DEFAULT 0';
  EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN total_amount SET NOT NULL';

  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS payment_method text';
  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS note text';
  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS created_at timestamptz';
  EXECUTE 'UPDATE public.worker_payments SET created_at = now() WHERE created_at IS NULL';
  EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN created_at SET DEFAULT now()';
  EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN created_at SET NOT NULL';
  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS labor_entry_ids uuid[]';
  EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS idempotency_key text';

  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'worker_payments'
        AND column_name = 'amount'
    ),
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'worker_payments'
        AND column_name = 'amount'
        AND is_generated <> 'NEVER'
    )
  INTO has_amount, amount_is_generated;

  IF NOT has_amount THEN
    EXECUTE 'ALTER TABLE public.worker_payments ADD COLUMN amount numeric GENERATED ALWAYS AS (total_amount) STORED';
  ELSIF NOT amount_is_generated THEN
    EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN amount DROP NOT NULL';
    EXECUTE 'ALTER TABLE public.worker_payments ALTER COLUMN amount SET DEFAULT 0';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_worker_payments_worker_id ON public.worker_payments (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_payments_created_at ON public.worker_payments (created_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'workers'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'worker_payments'
      AND c.conname = 'worker_payments_worker_id_fkey'
  ) THEN
    ALTER TABLE public.worker_payments
      ADD CONSTRAINT worker_payments_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.worker_reimbursements') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.worker_reimbursements ADD COLUMN IF NOT EXISTS payment_id uuid';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_payment_id ON public.worker_reimbursements (payment_id)';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'worker_reimbursements'
        AND c.conname = 'worker_reimbursements_payment_id_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE public.worker_reimbursements ADD CONSTRAINT worker_reimbursements_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.worker_payments(id) ON DELETE SET NULL NOT VALID';
    END IF;
  END IF;
END $$;

UPDATE public.worker_payments
SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL
  AND btrim(idempotency_key) = '';

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY idempotency_key
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.worker_payments
  WHERE idempotency_key IS NOT NULL
    AND btrim(idempotency_key) <> ''
)
UPDATE public.worker_payments wp
SET idempotency_key = NULL
FROM ranked
WHERE wp.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_payments_idempotency_key
  ON public.worker_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_select_all'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_select_all ON public.worker_payments FOR SELECT TO anon USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_insert_all'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_insert_all ON public.worker_payments FOR INSERT TO anon WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_update_all'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_update_all ON public.worker_payments FOR UPDATE TO anon USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_delete_all'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_delete_all ON public.worker_payments FOR DELETE TO anon USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_select'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_authenticated_select ON public.worker_payments FOR SELECT TO authenticated USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_insert'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_authenticated_insert ON public.worker_payments FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_update'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_authenticated_update ON public.worker_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_payments'
      AND policyname = 'worker_payments_authenticated_delete'
  ) THEN
    EXECUTE 'CREATE POLICY worker_payments_authenticated_delete ON public.worker_payments FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;
