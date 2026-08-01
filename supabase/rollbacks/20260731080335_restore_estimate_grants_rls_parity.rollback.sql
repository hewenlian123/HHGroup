-- Emergency rollback for 20260731080335_restore_estimate_grants_rls_parity.sql.
--
-- This restores the exact legacy anonymous write access observed before the
-- migration. It intentionally weakens access controls and should only be used
-- as a short-lived rollback while the server write path is repaired.

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.estimate_meta,
  public.estimate_categories,
  public.estimate_snapshots,
  public.estimate_templates,
  public.payments_received,
  public.deposits
TO anon;

DROP POLICY IF EXISTS estimate_meta_insert_all ON public.estimate_meta;
CREATE POLICY estimate_meta_insert_all ON public.estimate_meta
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS estimate_meta_update_all ON public.estimate_meta;
CREATE POLICY estimate_meta_update_all ON public.estimate_meta
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS estimate_meta_delete_all ON public.estimate_meta;
CREATE POLICY estimate_meta_delete_all ON public.estimate_meta
  FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS estimate_categories_insert_all ON public.estimate_categories;
CREATE POLICY estimate_categories_insert_all ON public.estimate_categories
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS estimate_categories_update_all ON public.estimate_categories;
CREATE POLICY estimate_categories_update_all ON public.estimate_categories
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS estimate_categories_delete_all ON public.estimate_categories;
CREATE POLICY estimate_categories_delete_all ON public.estimate_categories
  FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS estimate_snapshots_insert_all ON public.estimate_snapshots;
CREATE POLICY estimate_snapshots_insert_all ON public.estimate_snapshots
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS estimate_snapshots_update_all ON public.estimate_snapshots;
CREATE POLICY estimate_snapshots_update_all ON public.estimate_snapshots
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS estimate_snapshots_delete_all ON public.estimate_snapshots;
CREATE POLICY estimate_snapshots_delete_all ON public.estimate_snapshots
  FOR DELETE TO anon USING (true);

NOTIFY pgrst, 'reload schema';
