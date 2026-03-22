/**
 * Server-only: ensure expenses has source, source_id (migration 202604141000).
 * No-op if columns exist or DB URL unset. Used before Mark as Paid to avoid duplicate expenses.
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

let ensured = false;

export async function ensureExpensesSourceColumns(): Promise<void> {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || ensured) return;
  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expenses'
      AND column_name IN ('source', 'source_id')
      ORDER BY column_name
    `;
    if (cols.length === 2) {
      ensured = true;
      await sql.end();
      return;
    }
    const migrationPath = join(
      process.cwd(),
      "supabase/migrations/202604141000_expenses_source_source_id_paid.sql"
    );
    const migrationSql = readFileSync(migrationPath, "utf8");
    await sql.unsafe(migrationSql);
    ensured = true;
    await sql.end();
  } catch {
    // No-op; migration may be applied elsewhere or DB not ready
  }
}
