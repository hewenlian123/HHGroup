/**
 * POST /api/production/wipe-database
 *
 * 1. Deletes ALL rows from main tables in dependency-safe order (no DROP, schema unchanged).
 *    Tables: commission_payment_records, project_commissions, expense_lines, expenses,
 *    labor_entries, worker_receipts, worker_reimbursements, worker_payments,
 *    invoice_payments, invoice_items, deposits, payments_received, invoices,
 *    site_photos, project_budget_items, project_change_order_items, project_change_order_attachments,
 *    project_change_orders, project_tasks, punch_list, project_material_selections,
 *    project_schedule, inspection_log, activity_logs, estimate_meta, estimate_items,
 *    estimate_categories, estimates, material_catalog, projects, workers.
 * 2. Runs Full System Test and UI Tests to confirm the app works with an empty database.
 *
 * Returns: { ok, wipe: { deleted, errors }, systemTest, uiTests, summary }.
 */

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { wipeAllData } from "@/lib/wipe-database";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const host = request.headers.get("host") ?? "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const origin = `${protocol}://${host}`;

  const c = getServerSupabase();
  if (!c) {
    return NextResponse.json(
      {
        ok: false,
        summary: "Supabase not configured.",
        wipe: { deleted: {}, errors: ["Supabase not configured"] },
      },
      { status: 503 }
    );
  }

  const wipe = await wipeAllData(c);

  let systemTest: { ok: boolean; error?: string; details?: unknown } = { ok: false };
  let uiTests: { ok: boolean; error?: string; details?: unknown } = { ok: false };

  try {
    const res = await fetch(`${origin}/api/test/full-system-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; tests?: unknown[] };
    systemTest = {
      ok: res.ok && data.ok === true,
      details: data.tests,
      ...(!(res.ok && data.ok)
        ? { error: (data as { message?: string }).message ?? `HTTP ${res.status}` }
        : {}),
    };
  } catch (e) {
    systemTest = { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }

  try {
    const res = await fetch(`${origin}/api/test/run-ui-tests`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      tests?: unknown[];
      error?: string;
    };
    uiTests = {
      ok: res.ok && data.ok === true,
      details: data.tests,
      ...(!(res.ok && data.ok) ? { error: data.error ?? `HTTP ${res.status}` } : {}),
    };
  } catch (e) {
    uiTests = { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }

  const testsOk = systemTest.ok && uiTests.ok;
  const summary =
    wipe.errors.length > 0
      ? "Wipe completed with errors. Review wipe.errors."
      : testsOk
        ? "Database wiped. System Tests and UI Tests passed — ready for production data."
        : "Database wiped. Some tests failed — resolve before use.";

  return NextResponse.json({
    ok: wipe.errors.length === 0 && testsOk,
    wipe: { deleted: wipe.deleted, errors: wipe.errors },
    systemTest,
    uiTests,
    summary,
  });
}
