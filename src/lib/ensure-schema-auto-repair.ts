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

  // 3. expense_lines table columns
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS total numeric`,
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS category text DEFAULT 'Other'`,

  // 4. payments_received table columns (table may not exist yet; ALTER will no-op or fail gracefully)
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS customer_name text`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS attachment_url text`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS deposit_account text`,

  // 5. labor_entries table columns
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'`,
  `ALTER TABLE public.labor_entries ADD COLUMN IF NOT EXISTS worker_payment_id uuid`,
  `ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS labor_entry_ids uuid[]`,

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

  // 9c. receipt_queue (finance receipt intake; E2E + app expect table when using direct DB URL)
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
