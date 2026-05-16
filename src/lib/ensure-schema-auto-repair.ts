/**
 * Schema auto-repair: ensure required tables and columns for construction finance.
 * Uses direct Postgres (SUPABASE_DATABASE_URL or DATABASE_URL) only.
 * No-op if URL unset or on error.
 */

import postgres from "postgres";

const AUTO_REPAIR_DDL: string[] = [
  // 1. worker_payments table
  `CREATE TABLE IF NOT EXISTS public.worker_payments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  total_amount numeric not null,
  payment_method text,
  note text,
  created_at timestamptz default now()
)`,

  // 2. expenses table columns
  `ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_status_check`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor_name text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payment_method text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS total numeric`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS line_count integer`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS reference_no text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS notes text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS worker_id uuid`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS status text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS source text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS source_id uuid`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS card_name text`,
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON public.expenses (project_id)
   WHERE project_id IS NOT NULL`,

  // 3. expense_lines table columns
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS total numeric`,
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS category text DEFAULT 'Other'`,
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS cost_code text NULL`,
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS memo text NULL`,
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_expense_lines_project_id ON public.expense_lines (project_id)
   WHERE project_id IS NOT NULL`,

  // 4. payments_received table columns (table may not exist yet; ALTER will no-op or fail gracefully)
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS customer_name text`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS attachment_url text`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS deposit_account text`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed'`,
  `ALTER TABLE public.invoice_payments
   ADD COLUMN IF NOT EXISTS payment_received_id uuid NULL
   REFERENCES public.payments_received(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_received_id
   ON public.invoice_payments (payment_received_id)`,
  `CREATE TABLE IF NOT EXISTS public.payment_received_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments_received(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT 'Payment attachment',
  mime_type text NULL,
  size_bytes bigint NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'pdf')),
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_received_attachments_payment_id
   ON public.payment_received_attachments (payment_id)`,
  `ALTER TABLE public.payment_received_attachments ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS payment_received_attachments_select_anon_authenticated
   ON public.payment_received_attachments`,
  `CREATE POLICY payment_received_attachments_select_anon_authenticated
   ON public.payment_received_attachments FOR SELECT
   TO anon, authenticated
   USING (true)`,
  `DROP POLICY IF EXISTS payment_received_attachments_insert_anon_authenticated
   ON public.payment_received_attachments`,
  `CREATE POLICY payment_received_attachments_insert_anon_authenticated
   ON public.payment_received_attachments FOR INSERT
   TO anon, authenticated
   WITH CHECK (true)`,
  `DROP POLICY IF EXISTS payment_received_attachments_update_anon_authenticated
   ON public.payment_received_attachments`,
  `CREATE POLICY payment_received_attachments_update_anon_authenticated
   ON public.payment_received_attachments FOR UPDATE
   TO anon, authenticated
   USING (true)
   WITH CHECK (true)`,
  `DROP POLICY IF EXISTS payment_received_attachments_delete_anon_authenticated
   ON public.payment_received_attachments`,
  `CREATE POLICY payment_received_attachments_delete_anon_authenticated
   ON public.payment_received_attachments FOR DELETE
   TO anon, authenticated
   USING (true)`,
  `INSERT INTO storage.buckets (id, name, public)
   VALUES ('payment-attachments', 'payment-attachments', false)
   ON CONFLICT (id) DO UPDATE SET public = false, name = EXCLUDED.name`,
  `DROP POLICY IF EXISTS "payment_attachments_select" ON storage.objects`,
  `CREATE POLICY "payment_attachments_select"
   ON storage.objects FOR SELECT
   TO anon, authenticated
   USING (bucket_id = 'payment-attachments')`,
  `DROP POLICY IF EXISTS "payment_attachments_insert" ON storage.objects`,
  `CREATE POLICY "payment_attachments_insert"
   ON storage.objects FOR INSERT
   TO anon, authenticated
   WITH CHECK (bucket_id = 'payment-attachments')`,
  `DROP POLICY IF EXISTS "payment_attachments_update" ON storage.objects`,
  `CREATE POLICY "payment_attachments_update"
   ON storage.objects FOR UPDATE
   TO anon, authenticated
   USING (bucket_id = 'payment-attachments')
   WITH CHECK (bucket_id = 'payment-attachments')`,
  `DROP POLICY IF EXISTS "payment_attachments_delete" ON storage.objects`,
  `CREATE POLICY "payment_attachments_delete"
   ON storage.objects FOR DELETE
   TO anon, authenticated
   USING (bucket_id = 'payment-attachments')`,
  `INSERT INTO public.payment_received_attachments (
  payment_id,
  file_url,
  file_name,
  mime_type,
  size_bytes,
  file_type
)
SELECT
  p.id,
  p.attachment_url,
  COALESCE(
    NULLIF(regexp_replace(split_part(p.attachment_url, '?', 1), '^.*/', ''), ''),
    'Payment attachment'
  ),
  NULL,
  NULL,
  CASE
    WHEN lower(p.attachment_url) ~ '\\.pdf(\\?|#|$)' THEN 'pdf'
    ELSE 'image'
  END
FROM public.payments_received p
WHERE p.attachment_url IS NOT NULL
  AND btrim(p.attachment_url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_received_attachments a
    WHERE a.payment_id = p.id
      AND a.file_url = p.attachment_url
  )`,
  `WITH candidates AS (
  SELECT
    p.id AS payment_received_id,
    ip.id AS invoice_payment_id,
    count(*) OVER (PARTITION BY p.id) AS payment_match_count,
    count(*) OVER (PARTITION BY ip.id) AS ledger_match_count
  FROM public.payments_received p
  JOIN public.invoice_payments ip
    ON ip.invoice_id = p.invoice_id
   AND COALESCE(ip.status, 'Posted') <> 'Voided'
   AND abs(COALESCE(ip.amount, 0)::numeric - COALESCE(p.amount, 0)::numeric) < 0.000001
   AND COALESCE(ip.paid_at, ip.payment_date)::date = p.payment_date::date
   AND COALESCE(NULLIF(btrim(ip.memo), ''), '') =
       COALESCE(NULLIF(btrim(COALESCE(p.notes, p.deposit_account)), ''), '')
  WHERE p.id IS NOT NULL
    AND COALESCE(p.status, '') <> 'void'
    AND ip.payment_received_id IS NULL
)
UPDATE public.invoice_payments ip
SET payment_received_id = candidates.payment_received_id
FROM candidates
WHERE ip.id = candidates.invoice_payment_id
  AND candidates.payment_match_count = 1
  AND candidates.ledger_match_count = 1`,

  // 5. labor_entries table columns
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Draft'`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS submitted_at timestamptz`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS submitted_by text`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS approved_at timestamptz`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS approved_by text`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS locked_at timestamptz`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS locked_by text`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS cost_amount numeric NULL`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS morning boolean NOT NULL DEFAULT false`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS afternoon boolean NOT NULL DEFAULT false`,
  `UPDATE public.labor_entries
   SET status = 'Draft'
   WHERE status IS NULL OR status NOT IN ('Draft', 'Submitted', 'Approved', 'Locked')`,
  `ALTER TABLE public.labor_entries ALTER COLUMN status SET DEFAULT 'Draft'`,
  `ALTER TABLE public.labor_entries ALTER COLUMN status SET NOT NULL`,
  `ALTER TABLE public.labor_entries DROP CONSTRAINT IF EXISTS labor_entries_status_check`,
  `ALTER TABLE public.labor_entries
   ADD CONSTRAINT labor_entries_status_check
   CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Locked'))`,
  `CREATE INDEX IF NOT EXISTS idx_labor_entries_status ON public.labor_entries (status)`,
  `CREATE INDEX IF NOT EXISTS idx_labor_entries_project_id ON public.labor_entries (project_id)
   WHERE project_id IS NOT NULL`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS worker_payment_id uuid`,
  `ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS labor_entry_ids uuid[]`,
  `ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS idempotency_key text`,
  `UPDATE public.worker_payments
   SET idempotency_key = NULL
   WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) = ''`,
  `WITH ranked AS (
     SELECT id, row_number() OVER (
       PARTITION BY idempotency_key
       ORDER BY created_at ASC NULLS LAST, id ASC
     ) AS rn
     FROM public.worker_payments
     WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> ''
   )
   UPDATE public.worker_payments wp
   SET idempotency_key = NULL
   FROM ranked
   WHERE wp.id = ranked.id AND ranked.rn > 1`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_payments_idempotency_key
   ON public.worker_payments (idempotency_key)
   WHERE idempotency_key IS NOT NULL`,

  // 6. labor_workers sync (for schemas where labor_entries FK → labor_workers)
  `CREATE TABLE IF NOT EXISTS public.labor_workers (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
)`,
  // Only use (id, name): production schemas may not have created_at on labor_workers.
  `INSERT INTO public.labor_workers (id, name)
   SELECT w.id, w.name
   FROM public.workers w
   WHERE NOT EXISTS (SELECT 1 FROM public.labor_workers lw WHERE lw.id = w.id)`,

  // 7. worker_receipts table + extensions used by Receipt Upload flow
  `CREATE TABLE IF NOT EXISTS public.worker_receipts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  amount numeric not null default 0,
  receipt_url text,
  status text not null default 'Pending',
  rejection_reason text null,
  reimbursement_id uuid null,
  created_at timestamptz not null default now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_receipts_worker_id ON public.worker_receipts (worker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_receipts_project_id ON public.worker_receipts (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_receipts_status ON public.worker_receipts (status)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_receipts_created_at ON public.worker_receipts (created_at)`,
  `ALTER TABLE public.worker_receipts ADD COLUMN IF NOT EXISTS worker_name text`,
  `ALTER TABLE public.worker_receipts ADD COLUMN IF NOT EXISTS expense_type text DEFAULT 'Other'`,
  `ALTER TABLE public.worker_receipts ADD COLUMN IF NOT EXISTS notes text`,
  `ALTER TABLE public.worker_receipts ADD COLUMN IF NOT EXISTS vendor text`,
  `ALTER TABLE public.worker_receipts ADD COLUMN IF NOT EXISTS description text`,
  `ALTER TABLE public.worker_receipts ADD COLUMN IF NOT EXISTS receipt_date date`,
  // Allow inserts without worker_id when only worker_name is provided (public upload)
  `ALTER TABLE public.worker_receipts ALTER COLUMN worker_id DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_worker_receipts_expense_type ON public.worker_receipts (expense_type)`,

  // Storage bucket + policies (best effort). Will no-op if storage schema unavailable.
  `INSERT INTO storage.buckets (id, name, public)
   VALUES ('worker-receipts', 'worker-receipts', true)
   ON CONFLICT (id) DO NOTHING`,
  `DROP POLICY IF EXISTS "worker_receipts_public_read" ON storage.objects`,
  `CREATE POLICY "worker_receipts_public_read"
   ON storage.objects FOR SELECT
   TO anon, authenticated
   USING (bucket_id = 'worker-receipts')`,
  `DROP POLICY IF EXISTS "worker_receipts_anon_insert" ON storage.objects`,
  `CREATE POLICY "worker_receipts_anon_insert"
   ON storage.objects FOR INSERT
   TO anon, authenticated
   WITH CHECK (bucket_id = 'worker-receipts')`,

  // 8. attachments: table + relax entity_type so Quick Expense can insert entity_type = 'expense'
  `CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  file_path text not null,
  mime_type text null,
  size_bytes bigint null
)`,
  `ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_entity_type_check`,

  // 9. commissions + commission_payments (app + PostgREST expect these names; fixes "table not in schema cache")
  `CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  person text NOT NULL,
  role text,
  calculation_mode text DEFAULT 'manual',
  rate numeric DEFAULT 0,
  base_amount numeric DEFAULT 0,
  commission_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
)`,
  `ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS person_id uuid`,
  `CREATE TABLE IF NOT EXISTS public.commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text,
  payment_date date,
  note text,
  created_at timestamptz DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_commissions_project_id ON public.commissions (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_commission_payments_commission_id ON public.commission_payments (commission_id)`,
  `CREATE INDEX IF NOT EXISTS idx_commission_payments_payment_date ON public.commission_payments (payment_date)`,
  `ALTER TABLE public.commission_payments ADD COLUMN IF NOT EXISTS receipt_url text`,
  `ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS commissions_all_anon ON public.commissions`,
  `CREATE POLICY commissions_all_anon ON public.commissions
   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
  `DROP POLICY IF EXISTS commission_payments_all_anon ON public.commission_payments`,
  `CREATE POLICY commission_payments_all_anon ON public.commission_payments
   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
  `NOTIFY pgrst, 'reload schema'`,

  // 9b. Backfill commissions / commission_payments from legacy project_commissions / commission_payment_records
  `DO $_$
BEGIN
  IF to_regclass('public.project_commissions') IS NOT NULL
     AND to_regclass('public.commissions') IS NOT NULL THEN
    INSERT INTO public.commissions (
      id, project_id, person, role, calculation_mode, rate, base_amount, commission_amount, notes, created_at
    )
    SELECT
      pc.id,
      pc.project_id,
      COALESCE(NULLIF(btrim(pc.person_name), ''), ''),
      pc.role,
      lower(pc.calculation_mode::text),
      pc.rate,
      pc.base_amount,
      pc.commission_amount,
      pc.notes,
      pc.created_at
    FROM public.project_commissions pc
    WHERE NOT EXISTS (SELECT 1 FROM public.commissions c WHERE c.id = pc.id);
  END IF;
  IF to_regclass('public.commission_payment_records') IS NOT NULL
     AND to_regclass('public.commission_payments') IS NOT NULL THEN
    INSERT INTO public.commission_payments (
      id, commission_id, amount, payment_method, payment_date, note, created_at
    )
    SELECT
      pr.id,
      pr.commission_id,
      pr.amount,
      pr.payment_method,
      pr.payment_date,
      CASE
        WHEN pr.reference_no IS NOT NULL AND btrim(COALESCE(pr.reference_no, '')) <> '' THEN
          CASE
            WHEN pr.notes IS NOT NULL AND btrim(pr.notes) <> '' THEN pr.notes || chr(10) || 'Ref: ' || pr.reference_no
            ELSE 'Ref: ' || pr.reference_no
          END
        ELSE pr.notes
      END,
      pr.created_at
    FROM public.commission_payment_records pr
    WHERE NOT EXISTS (SELECT 1 FROM public.commission_payments p WHERE p.id = pr.id)
      AND EXISTS (SELECT 1 FROM public.commissions c WHERE c.id = pr.commission_id);
  END IF;
END
$_$`,
  `NOTIFY pgrst, 'reload schema'`,

  // 9c. project_change_orders metadata used by detail/list views.
  `ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS title text NULL`,
  `ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS description text NULL`,
  `ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS amount numeric GENERATED ALWAYS AS (total) STORED`,
  `ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS cost_impact numeric NULL`,
  `ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS schedule_impact_days integer NULL`,
  `ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS date date NULL`,
  `ALTER TABLE public.project_change_orders ADD COLUMN IF NOT EXISTS approved_by text NULL`,
  `NOTIFY pgrst, 'reload schema'`,

  // 9d. punch_list columns used by Operations / Punch List.
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS location text NULL`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS assigned_worker_id uuid NULL`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS status text NULL DEFAULT 'open'`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS photo_url text NULL`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS notes text NULL`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS created_at timestamptz NULL DEFAULT now()`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS description text NULL`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Medium'`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS created_by text NULL`,
  `ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS photo_id uuid NULL`,
  `CREATE INDEX IF NOT EXISTS idx_punch_list_photo_id ON public.punch_list (photo_id)`,
  `DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'punch_list' AND column_name = 'notes'
  ) THEN
    UPDATE public.punch_list
    SET description = notes
    WHERE description IS NULL AND notes IS NOT NULL;
  END IF;

  UPDATE public.punch_list SET status = 'assigned' WHERE status = 'in_progress';
  UPDATE public.punch_list SET status = 'completed' WHERE status = 'resolved';
END
$$`,
  `NOTIFY pgrst, 'reload schema'`,

  // 9e. bank_transactions (cash reconciliation / accounts overview)
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  txn_date date not null,
  description text not null default '',
  amount numeric not null default 0,
  status text not null default 'unmatched' check (status in ('unmatched', 'reconciled')),
  reconcile_type text null check (reconcile_type in ('Expense', 'Income', 'Transfer')),
  reconciled_at timestamptz null,
  reconciled_by text null,
  linked_expense_id uuid null references public.expenses(id) on delete set null,
  vendor_name text null,
  payment_method text null,
  notes text null
)`,
  `ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS reconciled_by text null`,
  `CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$`,
  `DROP TRIGGER IF EXISTS trg_bank_transactions_updated_at ON public.bank_transactions`,
  `CREATE TRIGGER trg_bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at()`,
  `CREATE INDEX IF NOT EXISTS idx_bank_transactions_txn_date
  ON public.bank_transactions (txn_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_transactions_status_txn_date
  ON public.bank_transactions (status, txn_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bank_transactions_linked_expense_id
  ON public.bank_transactions (linked_expense_id)
  WHERE linked_expense_id IS NOT NULL`,
  `ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bank_transactions TO anon, authenticated, service_role`,
  `DROP POLICY IF EXISTS bank_transactions_select_all ON public.bank_transactions`,
  `DROP POLICY IF EXISTS bank_transactions_insert_all ON public.bank_transactions`,
  `DROP POLICY IF EXISTS bank_transactions_update_all ON public.bank_transactions`,
  `DROP POLICY IF EXISTS bank_transactions_delete_all ON public.bank_transactions`,
  `DROP POLICY IF EXISTS bank_transactions_anon_select ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_anon_select
  ON public.bank_transactions FOR SELECT TO anon USING (true)`,
  `DROP POLICY IF EXISTS bank_transactions_anon_insert ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_anon_insert
  ON public.bank_transactions FOR INSERT TO anon WITH CHECK (true)`,
  `DROP POLICY IF EXISTS bank_transactions_anon_update ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_anon_update
  ON public.bank_transactions FOR UPDATE TO anon USING (true) WITH CHECK (true)`,
  `DROP POLICY IF EXISTS bank_transactions_anon_delete ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_anon_delete
  ON public.bank_transactions FOR DELETE TO anon USING (true)`,
  `DROP POLICY IF EXISTS bank_transactions_authenticated_select ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_authenticated_select
  ON public.bank_transactions FOR SELECT TO authenticated USING (true)`,
  `DROP POLICY IF EXISTS bank_transactions_authenticated_insert ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_authenticated_insert
  ON public.bank_transactions FOR INSERT TO authenticated WITH CHECK (true)`,
  `DROP POLICY IF EXISTS bank_transactions_authenticated_update ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_authenticated_update
  ON public.bank_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
  `DROP POLICY IF EXISTS bank_transactions_authenticated_delete ON public.bank_transactions`,
  `CREATE POLICY bank_transactions_authenticated_delete
  ON public.bank_transactions FOR DELETE TO authenticated USING (true)`,
  `COMMENT ON COLUMN public.bank_transactions.reconciled_by IS 'Optional actor id or label when status=reconciled.'`,
  `NOTIFY pgrst, 'reload schema'`,

  // 9f. receipt_queue (finance receipt intake; E2E + app expect table when using direct DB URL)
  `CREATE TABLE IF NOT EXISTS public.receipt_queue (
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_receipt_queue_status_created
  ON public.receipt_queue (status, created_at DESC)`,
  `ALTER TABLE public.receipt_queue ADD COLUMN IF NOT EXISTS payment_account_id TEXT`,
  `DROP TRIGGER IF EXISTS trg_receipt_queue_updated_at ON public.receipt_queue`,
  `CREATE TRIGGER trg_receipt_queue_updated_at
  BEFORE UPDATE ON public.receipt_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at()`,
  `ALTER TABLE public.receipt_queue ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS receipt_queue_select_all ON public.receipt_queue`,
  `CREATE POLICY receipt_queue_select_all
  ON public.receipt_queue FOR SELECT TO anon, authenticated USING (true)`,
  `DROP POLICY IF EXISTS receipt_queue_insert_all ON public.receipt_queue`,
  `CREATE POLICY receipt_queue_insert_all
  ON public.receipt_queue FOR INSERT TO anon, authenticated WITH CHECK (true)`,
  `DROP POLICY IF EXISTS receipt_queue_update_all ON public.receipt_queue`,
  `CREATE POLICY receipt_queue_update_all
  ON public.receipt_queue FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)`,
  `DROP POLICY IF EXISTS receipt_queue_delete_all ON public.receipt_queue`,
  `CREATE POLICY receipt_queue_delete_all
  ON public.receipt_queue FOR DELETE TO anon, authenticated USING (true)`,
  `NOTIFY pgrst, 'reload schema'`,

  // 10. commission-receipts bucket (private; app uses signed URLs in receipt_url)
  `INSERT INTO storage.buckets (id, name, public)
   VALUES ('commission-receipts', 'commission-receipts', false)
   ON CONFLICT (id) DO UPDATE SET public = false, name = EXCLUDED.name`,
  `DROP POLICY IF EXISTS "commission_receipts_public_read" ON storage.objects`,
  `CREATE POLICY "commission_receipts_public_read"
   ON storage.objects FOR SELECT
   TO anon, authenticated
   USING (bucket_id = 'commission-receipts')`,
  `DROP POLICY IF EXISTS "commission_receipts_anon_insert" ON storage.objects`,
  `CREATE POLICY "commission_receipts_anon_insert"
   ON storage.objects FOR INSERT
   TO anon, authenticated
   WITH CHECK (bucket_id = 'commission-receipts')`,
];

export type SchemaAutoRepairResult = {
  ok: boolean;
  hasDatabaseUrl: boolean;
  message: string;
  applied?: number;
  errors?: string[];
};

/**
 * Run schema auto-repair DDL. Requires SUPABASE_DATABASE_URL or DATABASE_URL.
 * Returns result summary; does not throw.
 */
export async function runSchemaAutoRepair(): Promise<SchemaAutoRepairResult> {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return {
      ok: false,
      hasDatabaseUrl: Boolean(process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL),
      message:
        "Schema auto-repair is disabled in production. Apply reviewed Supabase migrations instead.",
    };
  }

  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    return {
      ok: false,
      hasDatabaseUrl: false,
      message:
        "Direct database URL is required for schema auto-repair. Set SUPABASE_DATABASE_URL or DATABASE_URL in .env.local (Supabase → Project Settings → Database → Connection string), then restart the dev server.",
    };
  }

  const errors: string[] = [];
  let applied = 0;

  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });
    for (const statement of AUTO_REPAIR_DDL) {
      try {
        await sql.unsafe(statement);
        applied++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        // Continue with next statement (e.g. table might not exist yet for ALTER)
      }
    }
    await sql.end();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      hasDatabaseUrl: true,
      message: `Schema auto-repair failed: ${msg}`,
      applied,
      errors: errors.length > 0 ? errors : [msg],
    };
  }

  const ok = errors.length === 0;
  return {
    ok,
    hasDatabaseUrl: true,
    message:
      ok && applied > 0
        ? `Schema auto-repair completed. Applied ${applied} statement(s). If you still see "column not in schema cache", reload the schema cache in Supabase Dashboard → Project Settings → API.`
        : ok
          ? "Schema auto-repair completed. No changes needed."
          : `Schema auto-repair completed with ${errors.length} error(s). Some statements may have been skipped (e.g. table not yet created). Applied ${applied} statement(s).`,
    applied,
    ...(errors.length > 0 && { errors }),
  };
}
