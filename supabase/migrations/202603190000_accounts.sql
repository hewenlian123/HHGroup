-- Payment sources: credit cards, debit cards, bank accounts, cash.
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('Credit Card', 'Debit Card', 'Bank', 'Cash', 'Other')),
  last_four text,
  notes text
);

CREATE INDEX IF NOT EXISTS accounts_name_idx ON public.accounts (name);
CREATE INDEX IF NOT EXISTS accounts_type_idx ON public.accounts (type);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_select_all ON public.accounts;
CREATE POLICY accounts_select_all ON public.accounts FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS accounts_insert_all ON public.accounts;
CREATE POLICY accounts_insert_all ON public.accounts FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS accounts_update_all ON public.accounts;
CREATE POLICY accounts_update_all ON public.accounts FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS accounts_delete_all ON public.accounts;
CREATE POLICY accounts_delete_all ON public.accounts FOR DELETE TO anon USING (true);

-- Link expenses to an account (payment source).
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.expenses.account_id IS 'Payment source account when using Accounts module.';
