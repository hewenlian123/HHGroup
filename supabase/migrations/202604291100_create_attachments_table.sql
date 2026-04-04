-- Recreate public.attachments when missing (e.g. production was aligned from remote_schema that dropped it).
-- App expects: entity_type + entity_id (see expenses-db addExpenseAttachment, commitments-db, expense detail).

CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  CONSTRAINT attachments_entity_type_check CHECK (
    entity_type IN ('subcontractor', 'bill', 'expense', 'commitment')
  )
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.attachments (entity_type, entity_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_select_all ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_all ON public.attachments;
DROP POLICY IF EXISTS attachments_update_all ON public.attachments;
DROP POLICY IF EXISTS attachments_delete_all ON public.attachments;
DROP POLICY IF EXISTS attachments_select_anon_authenticated ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_anon_authenticated ON public.attachments;
DROP POLICY IF EXISTS attachments_update_anon_authenticated ON public.attachments;
DROP POLICY IF EXISTS attachments_delete_anon_authenticated ON public.attachments;

CREATE POLICY attachments_select_anon_authenticated
  ON public.attachments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY attachments_insert_anon_authenticated
  ON public.attachments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY attachments_update_anon_authenticated
  ON public.attachments FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY attachments_delete_anon_authenticated
  ON public.attachments FOR DELETE
  TO anon, authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
