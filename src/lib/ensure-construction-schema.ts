/**
 * Server-only: ensure full construction management schema in Supabase (public).
 * Set SUPABASE_DATABASE_URL or DATABASE_URL. Tables created in dependency order.
 */

import postgres from "postgres";

const CORE_DDL: string[] = [
  // ─── COMPANY PROFILE ───
  `CREATE TABLE IF NOT EXISTS public.company_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  org_name text,
  legal_name text,
  phone text,
  email text,
  website text,
  license_number text,
  tax_id text,
  default_tax_pct numeric,
  address1 text,
  address2 text,
  city text,
  state text,
  zip text,
  country text,
  invoice_footer text,
  default_terms text,
  notes text,
  logo_path text,
  logo_url text
)`,
  // Legacy DBs may use company_name / address_line_*; align before relying on org_name (see migration 20260322104500).
  `DO $hh_cp_rename$ BEGIN
    IF to_regclass('public.company_profile') IS NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'company_name')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'org_name') THEN
      EXECUTE 'ALTER TABLE public.company_profile RENAME COLUMN company_name TO org_name';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'address_line1')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'address1') THEN
      EXECUTE 'ALTER TABLE public.company_profile RENAME COLUMN address_line1 TO address1';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'address_line2')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'address2') THEN
      EXECUTE 'ALTER TABLE public.company_profile RENAME COLUMN address_line2 TO address2';
    END IF;
  END $hh_cp_rename$`,
  `ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS org_name text`,
  `UPDATE public.company_profile SET org_name = 'HH Group' WHERE org_name IS NULL OR btrim(org_name) = ''`,
  // ─── PROJECTS ───
  `CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  address text,
  client_name text,
  contract_amount numeric,
  status text DEFAULT 'active',
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
)`,
  // ─── WORKERS ───
  `CREATE TABLE IF NOT EXISTS public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  role text,
  daily_rate numeric,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
)`,
  // ─── PROJECT TASKS ───
  `CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assigned_worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  due_date date,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON public.project_tasks (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_tasks_created_at ON public.project_tasks (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks (status)`,
  `ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`,
  // ─── VENDORS ───
  `CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  email text,
  address text,
  created_at timestamptz DEFAULT now()
)`,
  // ─── SUBCONTRACTORS ───
  `CREATE TABLE IF NOT EXISTS public.subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  email text,
  trade text,
  created_at timestamptz DEFAULT now()
)`,
  // ─── INVOICES (customer invoices) ───
  `CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id),
  invoice_number text,
  amount numeric,
  status text DEFAULT 'unpaid',
  due_date date,
  created_at timestamptz DEFAULT now()
)`,
  // ─── PAYMENTS RECEIVED ───
  `CREATE TABLE IF NOT EXISTS public.payments_received (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id),
  project_id uuid REFERENCES public.projects(id),
  amount numeric,
  payment_method text,
  payment_date date,
  note text,
  created_at timestamptz DEFAULT now()
)`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT ''`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS deposit_account text`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS notes text`,
  `ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS attachment_url text`,
  // ─── BILLS (vendor bills) ───
  `CREATE TABLE IF NOT EXISTS public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id),
  project_id uuid REFERENCES public.projects(id),
  amount numeric,
  status text DEFAULT 'unpaid',
  due_date date,
  created_at timestamptz DEFAULT now()
)`,
  // ─── EXPENSES ───
  `CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id),
  category text,
  amount numeric,
  description text,
  receipt_url text,
  created_at timestamptz DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS public.expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'Other',
  cost_code text,
  memo text,
  amount numeric NOT NULL DEFAULT 0
)`,
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0`,
  `ALTER TABLE public.expense_lines ADD COLUMN IF NOT EXISTS total numeric`,
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
  `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS source_id text`,
  // ─── DAILY LABOR ───
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
  // ─── WORKER REIMBURSEMENTS ───
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
  // ─── WORKER INVOICES ───
  `CREATE TABLE IF NOT EXISTS public.worker_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id),
  project_id uuid REFERENCES public.projects(id),
  amount numeric,
  invoice_file text,
  status text DEFAULT 'unpaid',
  created_at timestamptz DEFAULT now()
)`,
  // ─── WORKER PAYMENTS ───
  `CREATE TABLE IF NOT EXISTS public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id),
  project_id uuid REFERENCES public.projects(id),
  payment_date date DEFAULT current_date,
  amount numeric(12,2),
  payment_method text,
  notes text,
  created_at timestamptz DEFAULT now()
)`,
  // ─── DOCUMENTS ───
  `CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id),
  name text,
  file_url text,
  category text,
  created_at timestamptz DEFAULT now()
)`,
  // ─── COST ALLOCATION ───
  `CREATE TABLE IF NOT EXISTS public.cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id),
  category text,
  amount numeric,
  description text,
  created_at timestamptz DEFAULT now()
)`,
];

function rlsPolicies(table: string): string[] {
  return [
    `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS ${table}_select_all ON public.${table}`,
    `CREATE POLICY ${table}_select_all ON public.${table} FOR SELECT TO anon USING (true)`,
    `DROP POLICY IF EXISTS ${table}_insert_all ON public.${table}`,
    `CREATE POLICY ${table}_insert_all ON public.${table} FOR INSERT TO anon WITH CHECK (true)`,
    `DROP POLICY IF EXISTS ${table}_update_all ON public.${table}`,
    `CREATE POLICY ${table}_update_all ON public.${table} FOR UPDATE TO anon USING (true) WITH CHECK (true)`,
    `DROP POLICY IF EXISTS ${table}_delete_all ON public.${table}`,
    `CREATE POLICY ${table}_delete_all ON public.${table} FOR DELETE TO anon USING (true)`,
  ];
}

const TABLES = [
  "company_profile",
  "projects",
  "workers",
  "project_tasks",
  "vendors",
  "subcontractors",
  "invoices",
  "payments_received",
  "bills",
  "expenses",
  "expense_lines",
  "daily_work_entries",
  "worker_reimbursements",
  "worker_invoices",
  "worker_payments",
  "documents",
  "cost_allocations",
];

const RLS_DDL = TABLES.flatMap(rlsPolicies);
const ALL_DDL = [...CORE_DDL, ...RLS_DDL];

let ensured = false;

/**
 * Create all core construction schema tables (public) if they do not exist.
 * No-op if SUPABASE_DATABASE_URL / DATABASE_URL is unset or on error.
 */
export async function ensureConstructionSchema(): Promise<void> {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;
  if (ensured) return;

  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });
    try {
      for (const statement of ALL_DDL) {
        await sql.unsafe(statement);
      }
      ensured = true;
    } finally {
      await sql.end();
    }
  } catch {
    // No-op on any error so layout never 500s; schema may be ensured elsewhere or DB not ready.
  }
}
