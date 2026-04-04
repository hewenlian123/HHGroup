-- Dedicated expense attachments (separate from public.attachments polymorphic table).
-- Stores storage path in file_url (same convention as attachments.file_path). Does not touch expenses.receipt_url.

CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'pdf')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON public.expense_attachments (expense_id);

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_attachments_select_anon_authenticated ON public.expense_attachments;
DROP POLICY IF EXISTS expense_attachments_insert_anon_authenticated ON public.expense_attachments;
DROP POLICY IF EXISTS expense_attachments_update_anon_authenticated ON public.expense_attachments;
DROP POLICY IF EXISTS expense_attachments_delete_anon_authenticated ON public.expense_attachments;

CREATE POLICY expense_attachments_select_anon_authenticated
  ON public.expense_attachments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY expense_attachments_insert_anon_authenticated
  ON public.expense_attachments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY expense_attachments_update_anon_authenticated
  ON public.expense_attachments FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY expense_attachments_delete_anon_authenticated
  ON public.expense_attachments FOR DELETE
  TO anon, authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
