-- System-level receipt intake queue (persists across sessions; not modal-only).

CREATE TABLE IF NOT EXISTS public.receipt_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'pending', 'failed')),
  storage_path TEXT,
  receipt_public_url TEXT,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT,
  vendor_name TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  expense_date TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  source_type TEXT NOT NULL DEFAULT 'receipt_upload',
  worker_id TEXT,
  ocr_source TEXT NOT NULL DEFAULT 'none',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_queue_status_created
  ON public.receipt_queue (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_receipt_queue_updated_at ON public.receipt_queue;
CREATE TRIGGER trg_receipt_queue_updated_at
  BEFORE UPDATE ON public.receipt_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.receipt_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_queue_select_all ON public.receipt_queue;
CREATE POLICY receipt_queue_select_all
  ON public.receipt_queue FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS receipt_queue_insert_all ON public.receipt_queue;
CREATE POLICY receipt_queue_insert_all
  ON public.receipt_queue FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS receipt_queue_update_all ON public.receipt_queue;
CREATE POLICY receipt_queue_update_all
  ON public.receipt_queue FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS receipt_queue_delete_all ON public.receipt_queue;
CREATE POLICY receipt_queue_delete_all
  ON public.receipt_queue FOR DELETE TO anon, authenticated USING (true);
