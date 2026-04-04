-- Payment accounts for expenses (Cash, cards, bank — label only; type stored on row).

CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('card', 'cash', 'bank')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_accounts_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS payment_accounts_type_idx ON public.payment_accounts (type);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts (id) ON DELETE SET NULL;

ALTER TABLE public.receipt_queue
  ADD COLUMN IF NOT EXISTS payment_account_id TEXT;

COMMENT ON COLUMN public.expenses.payment_account_id IS 'Selected payment account (Cash, card, bank).';
COMMENT ON COLUMN public.receipt_queue.payment_account_id IS 'UUID of payment_accounts row when confirming from queue.';

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_accounts_select_all ON public.payment_accounts;
CREATE POLICY payment_accounts_select_all
  ON public.payment_accounts FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS payment_accounts_insert_all ON public.payment_accounts;
CREATE POLICY payment_accounts_insert_all
  ON public.payment_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS payment_accounts_update_all ON public.payment_accounts;
CREATE POLICY payment_accounts_update_all
  ON public.payment_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS payment_accounts_delete_all ON public.payment_accounts;
CREATE POLICY payment_accounts_delete_all
  ON public.payment_accounts FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.payment_accounts (name, type)
VALUES
  ('Cash', 'cash'),
  ('Amex', 'card'),
  ('Chase', 'card')
ON CONFLICT (name) DO NOTHING;
