import { NextResponse } from "next/server";
import postgres from "postgres";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const REQUIRED: { table: string; column?: string }[] = [
  { table: "projects" },
  { table: "workers" },
  { table: "estimates" },
  { table: "project_change_orders" },
  { table: "project_tasks" },
  { table: "punch_list" },
  { table: "project_schedule" },
  { table: "site_photos" },
  { table: "inspection_log" },
  { table: "material_catalog" },
  { table: "worker_receipts" },
  { table: "worker_reimbursements" },
  { table: "expenses", column: "account_id" },
  { table: "expenses", column: "card_name" },
  { table: "expense_lines", column: "amount" },
  { table: "invoices" },
  { table: "labor_entries", column: "status" },
  { table: "activity_logs" },
  { table: "payments_received" },
  { table: "payments_received", column: "customer_name" },
  { table: "payments_received", column: "attachment_url" },
  { table: "worker_payments" },
];

function toKey(t: { table: string; column?: string }): string {
  return t.column ? `${t.table}.${t.column}` : t.table;
}

/**
 * GET /api/schema-check
 * Verifies required database schema exists.
 * Returns { status: "ok", missing: [] } or { status: "error", missing: ["expenses.account_id", ...] }.
 */
export async function GET() {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (url) {
    try {
      const sql = postgres(url, { max: 1, connect_timeout: 10 });
      const missing: string[] = [];

      for (const { table, column } of REQUIRED) {
        if (column) {
          const rows = await sql`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
            LIMIT 1
          `;
          if (rows.length === 0) missing.push(toKey({ table, column }));
        } else {
          const rows = await sql`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = ${table}
            LIMIT 1
          `;
          if (rows.length === 0) missing.push(table);
        }
      }

      await sql.end();

      if (missing.length === 0) {
        return NextResponse.json({ status: "ok", missing: [] });
      }
      return NextResponse.json({ status: "error", missing });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { status: "error", missing: [], message: msg },
        { status: 500 }
      );
    }
  }

  // Fallback: probe with Supabase client when direct DB URL is not set
  const server = getServerSupabase();
  if (!server) {
    return NextResponse.json(
      { status: "error", missing: [], message: "Database not configured" },
      { status: 503 }
    );
  }

  const missing: string[] = [];

  for (const { table, column } of REQUIRED) {
    try {
      if (column) {
        const { error } = await server
          .from(table)
          .select(column)
          .limit(1)
          .maybeSingle();
        const code = (error as { code?: string } | null)?.code;
        const msg = (error as { message?: string } | null)?.message ?? "";
        if (error && (code === "42703" || /column.*(does not exist|not find)|(does not exist|not find).*column/i.test(msg) || msg.includes(column))) {
          missing.push(toKey({ table, column }));
        }
      } else {
        const { error } = await server.from(table).select("id").limit(1).maybeSingle();
        const code = (error as { code?: string } | null)?.code;
        const msg = (error as { message?: string } | null)?.message ?? "";
        if (error && (code === "42P01" || /relation.*does not exist|does not exist|not find|not exist/i.test(msg))) {
          missing.push(table);
        }
      }
    } catch {
      missing.push(column ? toKey({ table, column }) : table);
    }
  }

  if (missing.length === 0) {
    return NextResponse.json({ status: "ok", missing: [] });
  }
  return NextResponse.json({ status: "error", missing });
}