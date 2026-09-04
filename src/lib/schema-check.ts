import "server-only";

import postgres from "postgres";
import { getServerSupabase } from "@/lib/supabase-server";
import { safeErrorMessage } from "@/lib/system-response-safety";

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

export type SchemaCheckBody = {
  status: "ok" | "error";
  missing: string[];
  message?: string;
};

export type SchemaCheckResult = {
  body: SchemaCheckBody;
  status: 200 | 500 | 503;
};

function toKey(item: { table: string; column?: string }): string {
  return item.column ? `${item.table}.${item.column}` : item.table;
}

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

export async function runSchemaCheck(
  requested: { table?: string; column?: string } = {}
): Promise<SchemaCheckResult> {
  const requestedTable = requested.table?.trim() ?? "";
  const requestedColumn = requested.column?.trim() ?? "";
  const singleCheck = requestedTable !== "";
  const items = singleCheck
    ? [{ table: requestedTable, column: requestedColumn || undefined }]
    : REQUIRED;
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (url) {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });
    try {
      const missing: string[] = [];
      for (const item of items) {
        if (!(await checkDirectSchema(sql, item))) missing.push(toKey(item));
      }
      return {
        body: {
          status: missing.length === 0 ? "ok" : "error",
          missing,
        },
        status: 200,
      };
    } catch (error) {
      return {
        body: {
          status: "error",
          missing: [],
          message: safeErrorMessage(error),
        },
        status: 500,
      };
    } finally {
      await sql.end();
    }
  }

  const server = getServerSupabase();
  if (!server) {
    return {
      body: {
        status: "error",
        missing: [],
        message: "Database not configured",
      },
      status: 503,
    };
  }

  const missing: string[] = [];
  for (const { table, column } of items) {
    try {
      if (column) {
        const { error } = await server.from(table).select(column).limit(1).maybeSingle();
        const code = (error as { code?: string } | null)?.code;
        const message = (error as { message?: string } | null)?.message ?? "";
        if (
          error &&
          (code === "42703" ||
            /column.*(does not exist|not find)|(does not exist|not find).*column/i.test(message) ||
            message.includes(column))
        ) {
          missing.push(toKey({ table, column }));
        }
      } else {
        const { error } = await server.from(table).select("*").limit(1).maybeSingle();
        const code = (error as { code?: string } | null)?.code;
        const message = (error as { message?: string } | null)?.message ?? "";
        if (
          error &&
          (code === "42P01" ||
            /relation.*does not exist|does not exist|not find|not exist/i.test(message))
        ) {
          missing.push(table);
        }
      }
    } catch {
      missing.push(toKey({ table, column }));
    }
  }

  return {
    body: {
      status: missing.length === 0 ? "ok" : "error",
      missing,
    },
    status: 200,
  };
}
