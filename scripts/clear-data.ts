/**
 * Clear all data from the database (keep schema).
 * Uses TRUNCATE via direct Postgres connection when SUPABASE_DATABASE_URL is set
 * (bypasses RLS and is reliable). Otherwise falls back to DELETE via Supabase client.
 *
 * Usage: npx tsx scripts/clear-data.ts
 * Requires: .env.local with SUPABASE_DATABASE_URL (for TRUNCATE) or
 *           NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (for DELETE fallback).
 *
 * Alternatively run scripts/clear-data.sql in Supabase Dashboard → SQL Editor.
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnvFile(filename: string) {
  const p = join(process.cwd(), filename);
  if (!existsSync(p)) return;
  parseEnv(readFileSync(p, "utf8"));
}

function parseEnv(content: string) {
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  });
}

/** Tables in dependency order (children before parents). */
const TRUNCATE_TABLES = [
  "commission_payment_records",
  "project_commissions",
  "expense_lines",
  "expenses",
  "labor_entries",
  "worker_receipts",
  "worker_reimbursement_payments",
  "worker_reimbursements",
  "worker_payments",
  "invoice_payments",
  "invoice_items",
  "deposits",
  "payments_received",
  "invoices",
  "site_photos",
  "project_budget_items",
  "project_change_order_items",
  "project_change_order_attachments",
  "project_change_orders",
  "project_tasks",
  "punch_list",
  "project_material_selections",
  "project_schedule",
  "inspection_log",
  "activity_logs",
  "estimate_meta",
  "estimate_items",
  "estimate_categories",
  "estimate_snapshots",
  "estimates",
  "material_catalog",
  "projects",
  "labor_workers",
  "workers",
];

const VERIFY_TABLES = ["project_tasks", "punch_list", "projects", "workers", "invoices", "expenses"];
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

async function main() {
  loadEnvFile(".env.local");

  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const maskUrl = (u: string) =>
    u ? u.replace(/https?:\/\/([^.]+\.)?([^/]+)/, (_, sub, host) => `${host ? host.slice(0, 8) + "…" : "…"}`) : "?";

  if (dbUrl) {
    // TRUNCATE via direct Postgres (bypasses RLS, most reliable).
    console.log("Using TRUNCATE via SUPABASE_DATABASE_URL. Project:", maskUrl(supabaseUrl || dbUrl));
    const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
    const truncated: string[] = [];
    const errors: string[] = [];
    try {
      for (const table of TRUNCATE_TABLES) {
        try {
          await sql.unsafe(`TRUNCATE TABLE public.${table} CASCADE`);
          truncated.push(table);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/relation.*does not exist|table.*does not exist|could not find/i.test(msg)) continue;
          errors.push(`${table}: ${msg}`);
        }
      }
      console.log("Truncated", truncated.length, "tables:", truncated.join(", "));
      if (errors.length > 0) console.error("Errors:", errors);

      // Verify
      const counts: Record<string, number> = {};
      for (const table of VERIFY_TABLES) {
        try {
          const rows = await sql.unsafe(`SELECT 1 FROM public.${table} LIMIT 1`);
          counts[table] = Array.isArray(rows) ? rows.length : 0;
        } catch {
          counts[table] = -1;
        }
      }
      console.log("Verification (row counts):", counts);
      const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
      if (nonEmpty.length > 0) {
        console.error("Tables still have rows:", nonEmpty.map(([t, n]) => `${t}=${n}`).join(", "));
        process.exit(1);
      }
      console.log("All tables empty.");
    } finally {
      await sql.end();
    }
    process.exit(errors.length > 0 ? 1 : 0);
  }

  // Fallback: DELETE via Supabase client (subject to RLS / API limits).
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "Set SUPABASE_DATABASE_URL in .env.local for reliable TRUNCATE, or set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for DELETE fallback."
    );
    process.exit(1);
  }
  console.log("No SUPABASE_DATABASE_URL; using DELETE via Supabase client. Project:", maskUrl(supabaseUrl));
  console.warn("Tip: Set SUPABASE_DATABASE_URL for TRUNCATE (bypasses RLS). See scripts/clear-data.sql for manual run.");
  const c = createClient(supabaseUrl, serviceKey);
  const deleted: Record<string, number> = {};
  const errors: string[] = [];
  for (const table of TRUNCATE_TABLES) {
    try {
      const { data, error } = await c.from(table).delete().neq("id", NIL_UUID).select("id");
      if (error) {
        if (/relation.*does not exist|table.*does not exist|could not find/i.test(error.message ?? "")) continue;
        errors.push(`${table}: ${error.message}`);
        continue;
      }
      const n = (data ?? []).length;
      if (n > 0) deleted[table] = n;
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log("Deleted:", deleted);
  if (errors.length > 0) console.error("Errors:", errors);
  const counts: Record<string, number> = {};
  for (const table of VERIFY_TABLES) {
    const { count, error } = await c.from(table).select("id", { count: "exact", head: true });
    counts[table] = error && !/relation.*does not exist/i.test(error.message ?? "") ? -1 : (count ?? 0);
  }
  console.log("Verification:", counts);
  const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
  if (nonEmpty.length > 0) {
    console.error("Tables still have rows:", nonEmpty.map(([t, n]) => `${t}=${n}`).join(", "));
    process.exit(1);
  }
  console.log("All tables empty.");
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
