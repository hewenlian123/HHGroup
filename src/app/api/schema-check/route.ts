import { NextResponse } from "next/server";
import postgres from "postgres";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getServerSupabase } from "@/lib/supabase-server";
import { safeErrorMessage } from "@/lib/system-response-safety";

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
  { table: "payments_received", column: "status" },
  { table: "payment_received_attachments" },
  { table: "invoice_payments", column: "payment_received_id" },
  { table: "invoice_payments", column: "payment_date" },
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
async function checkDirectSchema(
  sql: ReturnType<typeof postgres>,
  item: { table: string; column?: string }
): Promise<boolean> {
  const { table, column } = item;
  if (column) {
    const rows = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
      LIMIT 1
    `;
    return rows.length > 0;
  }
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
    LIMIT 1
  `;
  return rows.length > 0;
}

function isSafeIdentifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const requestedTable = searchParams.get("table")?.trim() ?? "";
  const requestedColumn = searchParams.get("column")?.trim() ?? "";
  const singleCheck =
    requestedTable !== "" &&
    isSafeIdentifier(requestedTable) &&
    (requestedColumn === "" || isSafeIdentifier(requestedColumn));

  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (url) {
    try {
      const sql = postgres(url, { max: 1, connect_timeout: 10 });
      if (singleCheck) {
        const ok = await checkDirectSchema(sql, {
          table: requestedTable,
          column: requestedColumn || undefined,
        });
        await sql.end();
        return NextResponse.json({
          status: ok ? "ok" : "error",
          missing: ok
            ? []
            : [requestedColumn ? `${requestedTable}.${requestedColumn}` : requestedTable],
        });
      }

      const missing: string[] = [];

      for (const { table, column } of REQUIRED) {
        if (!(await checkDirectSchema(sql, { table, column })))
          missing.push(toKey({ table, column }));
      }

      await sql.end();

      if (missing.length === 0) {
        return NextResponse.json({ status: "ok", missing: [] });
      }
      return NextResponse.json({ status: "error", missing });
    } catch (e) {
      const msg = safeErrorMessage(e);
      return NextResponse.json({ status: "error", missing: [], message: msg }, { status: 500 });
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
  const items = singleCheck
    ? [{ table: requestedTable, column: requestedColumn || undefined }]
    : REQUIRED;

  for (const { table, column } of items) {
    try {
      if (column) {
        const { error } = await server.from(table).select(column).limit(1).maybeSingle();
        const code = (error as { code?: string } | null)?.code;
        const msg = (error as { message?: string } | null)?.message ?? "";
        if (
          error &&
          (code === "42703" ||
            /column.*(does not exist|not find)|(does not exist|not find).*column/i.test(msg) ||
            msg.includes(column))
        ) {
          missing.push(toKey({ table, column }));
        }
      } else {
        const { error } = await server.from(table).select("*").limit(1).maybeSingle();
        const code = (error as { code?: string } | null)?.code;
        const msg = (error as { message?: string } | null)?.message ?? "";
        if (
          error &&
          (code === "42P01" ||
            /relation.*does not exist|does not exist|not find|not exist/i.test(msg))
        ) {
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
