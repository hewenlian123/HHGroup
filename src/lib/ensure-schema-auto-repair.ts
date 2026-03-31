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
