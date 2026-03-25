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
