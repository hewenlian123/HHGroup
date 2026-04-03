-- worker_payments: one payment can cover multiple reimbursements (batch).
-- worker_reimbursements.payment_id links to worker_payments.id.

CREATE TABLE IF NOT EXISTS public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  total_amount numeric NOT NULL,
  payment_method text,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_payments_worker_id ON public.worker_payments (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_payments_created_at ON public.worker_payments (created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workers') THEN
    ALTER TABLE public.worker_payments
      ADD CONSTRAINT worker_payments_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.worker_reimbursements ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.worker_payments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_payment_id ON public.worker_reimbursements (payment_id);

ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS worker_payments_select_all ON public.worker_payments;
CREATE POLICY worker_payments_select_all ON public.worker_payments FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS worker_payments_insert_all ON public.worker_payments;
CREATE POLICY worker_payments_insert_all ON public.worker_payments FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS worker_payments_update_all ON public.worker_payments;
CREATE POLICY worker_payments_update_all ON public.worker_payments FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS worker_payments_delete_all ON public.worker_payments;
CREATE POLICY worker_payments_delete_all ON public.worker_payments FOR DELETE TO anon USING (true);
