-- Receipt / expense uploads: allow anon + authenticated on public.attachments without has_perm.
-- Replaces attachments_perm_* from apply_perm_policies and any duplicate legacy policy names.

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attachments_perm_select" ON public.attachments;
DROP POLICY IF EXISTS "attachments_perm_insert" ON public.attachments;
DROP POLICY IF EXISTS "attachments_perm_update" ON public.attachments;
DROP POLICY IF EXISTS "attachments_perm_delete" ON public.attachments;

DROP POLICY IF EXISTS attachments_select_anon_authenticated ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_anon_authenticated ON public.attachments;
DROP POLICY IF EXISTS attachments_update_anon_authenticated ON public.attachments;
DROP POLICY IF EXISTS attachments_delete_anon_authenticated ON public.attachments;

DROP POLICY IF EXISTS attachments_select_all ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_all ON public.attachments;
DROP POLICY IF EXISTS attachments_update_all ON public.attachments;
DROP POLICY IF EXISTS attachments_delete_all ON public.attachments;

DROP POLICY IF EXISTS "attachments_insert" ON public.attachments;
CREATE POLICY "attachments_insert" ON public.attachments
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "attachments_select" ON public.attachments;
CREATE POLICY "attachments_select" ON public.attachments
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "attachments_update" ON public.attachments;
CREATE POLICY "attachments_update" ON public.attachments
  FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "attachments_delete" ON public.attachments;
CREATE POLICY "attachments_delete" ON public.attachments
  FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO anon, authenticated;
