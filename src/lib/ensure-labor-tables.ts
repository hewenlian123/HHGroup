/**
 * Server-only: ensure labor tables exist in Supabase by running DDL via direct Postgres connection.
 * Set SUPABASE_DATABASE_URL (or DATABASE_URL) to your Supabase connection string:
 * Project Settings → Database → Connection string (URI, use transaction pooler for serverless).
 * After tables are created, if the API still returns "schema cache", reload once: Project Settings → API → Reload schema cache.
 */

import postgres from "postgres";

const LABOR_DDL = [
  `CREATE TABLE IF NOT EXISTS public.daily_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id),
  project_id uuid REFERENCES public.projects(id),
  work_date date,
  day_type text,
  daily_rate numeric,
  ot_hours numeric,
  total_pay numeric,
  notes text,
  created_at timestamptz DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_daily_work_entries_work_date ON public.daily_work_entries (work_date)`,
  `CREATE INDEX IF NOT EXISTS idx_daily_work_entries_worker_id ON public.daily_work_entries (worker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_daily_work_entries_project_id ON public.daily_work_entries (project_id)`,
  `CREATE TABLE IF NOT EXISTS public.worker_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id),
  project_id uuid REFERENCES public.projects(id),
  amount numeric,
  description text,
  receipt_url text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_worker_id ON public.worker_reimbursements (worker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_created_at ON public.worker_reimbursements (created_at)`,
  `CREATE TABLE IF NOT EXISTS public.worker_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id),
  project_id uuid REFERENCES public.projects(id),
  amount numeric,
  invoice_file text,
  status text DEFAULT 'unpaid',
  created_at timestamptz DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_invoices_worker_id ON public.worker_invoices (worker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_invoices_created_at ON public.worker_invoices (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_worker_invoices_status ON public.worker_invoices (status)`,
  `ALTER TABLE public.daily_work_entries ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.worker_reimbursements ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.worker_invoices ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS daily_work_entries_select_all ON public.daily_work_entries`,
  `CREATE POLICY daily_work_entries_select_all ON public.daily_work_entries FOR SELECT TO anon USING (true)`,
  `DROP POLICY IF EXISTS daily_work_entries_insert_all ON public.daily_work_entries`,
  `CREATE POLICY daily_work_entries_insert_all ON public.daily_work_entries FOR INSERT TO anon WITH CHECK (true)`,
  `DROP POLICY IF EXISTS daily_work_entries_update_all ON public.daily_work_entries`,
  `CREATE POLICY daily_work_entries_update_all ON public.daily_work_entries FOR UPDATE TO anon USING (true) WITH CHECK (true)`,
  `DROP POLICY IF EXISTS daily_work_entries_delete_all ON public.daily_work_entries`,
  `CREATE POLICY daily_work_entries_delete_all ON public.daily_work_entries FOR DELETE TO anon USING (true)`,
  `DROP POLICY IF EXISTS worker_reimbursements_select_all ON public.worker_reimbursements`,
  `CREATE POLICY worker_reimbursements_select_all ON public.worker_reimbursements FOR SELECT TO anon USING (true)`,
  `DROP POLICY IF EXISTS worker_reimbursements_insert_all ON public.worker_reimbursements`,
  `CREATE POLICY worker_reimbursements_insert_all ON public.worker_reimbursements FOR INSERT TO anon WITH CHECK (true)`,
  `DROP POLICY IF EXISTS worker_reimbursements_update_all ON public.worker_reimbursements`,
  `CREATE POLICY worker_reimbursements_update_all ON public.worker_reimbursements FOR UPDATE TO anon USING (true) WITH CHECK (true)`,
  `DROP POLICY IF EXISTS worker_reimbursements_delete_all ON public.worker_reimbursements`,
  `CREATE POLICY worker_reimbursements_delete_all ON public.worker_reimbursements FOR DELETE TO anon USING (true)`,
  `DROP POLICY IF EXISTS worker_invoices_select_all ON public.worker_invoices`,
  `CREATE POLICY worker_invoices_select_all ON public.worker_invoices FOR SELECT TO anon USING (true)`,
  `DROP POLICY IF EXISTS worker_invoices_insert_all ON public.worker_invoices`,
  `CREATE POLICY worker_invoices_insert_all ON public.worker_invoices FOR INSERT TO anon WITH CHECK (true)`,
  `DROP POLICY IF EXISTS worker_invoices_update_all ON public.worker_invoices`,
  `CREATE POLICY worker_invoices_update_all ON public.worker_invoices FOR UPDATE TO anon USING (true) WITH CHECK (true)`,
  `DROP POLICY IF EXISTS worker_invoices_delete_all ON public.worker_invoices`,
  `CREATE POLICY worker_invoices_delete_all ON public.worker_invoices FOR DELETE TO anon USING (true)`,
];

let ensured = false;

/**
 * Run DDL to create daily_work_entries, worker_reimbursements, worker_invoices if they do not exist.
 * No-op if SUPABASE_DATABASE_URL / DATABASE_URL is not set or on error (logs and returns).
 */
export async function ensureLaborTables(): Promise<void> {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;

  if (ensured) return;

  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  try {
    for (const statement of LABOR_DDL) {
      await sql.unsafe(statement);
    }
    ensured = true;
  } catch (err) {
    console.warn("[ensureLaborTables]", err);
  } finally {
    await sql.end();
  }
}
