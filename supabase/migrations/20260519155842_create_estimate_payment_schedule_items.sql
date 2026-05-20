-- Phase 1 payment schedule persistence for estimates.
-- Customer-facing fixed-amount milestones. Writes are server/admin only.

CREATE TABLE IF NOT EXISTS public.estimate_payment_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NULL,
  amount numeric NOT NULL DEFAULT 0,
  due_date date NULL,
  status text NOT NULL DEFAULT 'draft',
  invoice_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_payment_schedule_items_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT estimate_payment_schedule_items_status_check CHECK (status IN ('draft', 'invoiced', 'paid'))
);

CREATE INDEX IF NOT EXISTS estimate_payment_schedule_items_estimate_id_idx
  ON public.estimate_payment_schedule_items (estimate_id);

CREATE INDEX IF NOT EXISTS estimate_payment_schedule_items_invoice_id_idx
  ON public.estimate_payment_schedule_items (invoice_id);

CREATE INDEX IF NOT EXISTS estimate_payment_schedule_items_estimate_sort_idx
  ON public.estimate_payment_schedule_items (estimate_id, sort_order);

DROP TRIGGER IF EXISTS trg_estimate_payment_schedule_items_updated_at
  ON public.estimate_payment_schedule_items;

CREATE TRIGGER trg_estimate_payment_schedule_items_updated_at
  BEFORE UPDATE ON public.estimate_payment_schedule_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.estimate_payment_schedule_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.estimate_payment_schedule_items FROM anon;
REVOKE ALL ON TABLE public.estimate_payment_schedule_items FROM authenticated;

GRANT SELECT ON TABLE public.estimate_payment_schedule_items TO anon;
GRANT SELECT ON TABLE public.estimate_payment_schedule_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.estimate_payment_schedule_items TO service_role;

DROP POLICY IF EXISTS estimate_payment_schedule_items_anon_select
  ON public.estimate_payment_schedule_items;
CREATE POLICY estimate_payment_schedule_items_anon_select
  ON public.estimate_payment_schedule_items
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS estimate_payment_schedule_items_authenticated_select
  ON public.estimate_payment_schedule_items;
CREATE POLICY estimate_payment_schedule_items_authenticated_select
  ON public.estimate_payment_schedule_items
  FOR SELECT
  TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
