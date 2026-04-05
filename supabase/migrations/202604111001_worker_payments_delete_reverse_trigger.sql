-- BEFORE DELETE on worker_payments: reverse settlement so DB stays consistent even if row is removed outside the app API.
CREATE OR REPLACE FUNCTION public.fn_worker_payments_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
BEGIN
  UPDATE public.worker_reimbursements
  SET
    status = 'pending',
    paid_at = NULL,
    payment_id = NULL
  WHERE payment_id = OLD.id;

  UPDATE public.labor_entries
  SET
    worker_payment_id = NULL,
    status = CASE
      WHEN lower(trim(COALESCE(status, ''))) = 'paid' THEN 'Approved'
      ELSE status
    END
  WHERE worker_payment_id = OLD.id;

  IF OLD.labor_entry_ids IS NOT NULL AND coalesce(cardinality(OLD.labor_entry_ids), 0) > 0 THEN
    UPDATE public.labor_entries le
    SET status = 'Approved'
    WHERE le.worker_id = OLD.worker_id
      AND le.id = ANY (OLD.labor_entry_ids)
      AND lower(trim(COALESCE(le.status, ''))) = 'paid';
  END IF;

  RETURN OLD;
END;
$f$;

DO $$
BEGIN
  IF to_regclass('public.worker_payments') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_worker_payments_before_delete ON public.worker_payments;
  CREATE TRIGGER trg_worker_payments_before_delete
    BEFORE DELETE ON public.worker_payments
    FOR EACH ROW
    EXECUTE PROCEDURE public.fn_worker_payments_before_delete();
END $$;

COMMENT ON FUNCTION public.fn_worker_payments_before_delete() IS 'Unlinks labor_entries and reopens worker_reimbursements when a worker_payments row is deleted.';
