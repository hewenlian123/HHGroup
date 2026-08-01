-- Restore the table grants expected by the existing Estimate read and
-- server-side write paths. Row-level security remains enabled.

GRANT SELECT ON TABLE
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_snapshots
TO anon;

-- Estimate-generated invoice previews resolve the linked project through the
-- existing compatibility anon read path. Keep the current SELECT policy usable
-- without restoring any anonymous writes.
GRANT SELECT ON TABLE public.projects TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_snapshots
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_snapshots,
  public.estimate_payment_schedule_items,
  public.estimate_templates,
  public.payments_received,
  public.deposits
TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_snapshots,
  public.estimate_payment_schedule_items,
  public.estimate_templates,
  public.payments_received,
  public.deposits
FROM anon;

DROP POLICY IF EXISTS estimate_meta_insert_all ON public.estimate_meta;
DROP POLICY IF EXISTS estimate_meta_update_all ON public.estimate_meta;
DROP POLICY IF EXISTS estimate_meta_delete_all ON public.estimate_meta;

DROP POLICY IF EXISTS estimate_categories_insert_all ON public.estimate_categories;
DROP POLICY IF EXISTS estimate_categories_update_all ON public.estimate_categories;
DROP POLICY IF EXISTS estimate_categories_delete_all ON public.estimate_categories;

DROP POLICY IF EXISTS estimate_snapshots_insert_all ON public.estimate_snapshots;
DROP POLICY IF EXISTS estimate_snapshots_update_all ON public.estimate_snapshots;
DROP POLICY IF EXISTS estimate_snapshots_delete_all ON public.estimate_snapshots;

NOTIFY pgrst, 'reload schema';
