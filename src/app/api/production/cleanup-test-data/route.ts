/**
 * POST /api/production/cleanup-test-data
 *
 * 1. Deletes all rows matching test/demo patterns (Workflow Test, Test, Test Vendor,
 *    Test Worker, Test Project, Example, Demo) in dependency order across:
 *    project_tasks, punch_list, project_schedule, site_photos, inspection_log,
 *    project_change_orders, worker_receipts, worker_reimbursements, worker_payments,
 *    labor_entries, expenses, expense_lines, invoices, payments_received,
 *    estimates, material_catalog, activity_logs, projects, workers.
 * 2. Runs System Tests (full-system-test), Run All Tests, and UI Tests.
 *
 * Returns: { ok, cleanup: { deleted, errors }, systemTest, runAllTests, uiTests, summary }.
 */

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { cleanupTestData } from "@/lib/cleanup-test-data";

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
        cleanup: { deleted: {}, errors: ["Supabase not configured"] },
      },
      { status: 503 }
    );
  }

  const cleanup = await cleanupTestData(c);

  let systemTest: { ok: boolean; error?: string; details?: unknown } = { ok: false };
  let runAllTests: { ok: boolean; error?: string; details?: unknown } = { ok: false };
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
    const res = await fetch(`${origin}/api/test/run-all-tests`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; groups?: unknown[] };
    runAllTests = {
      ok: res.ok && data.ok === true,
      details: data.groups,
      ...(!(res.ok && data.ok)
        ? { error: (data as { message?: string }).message ?? `HTTP ${res.status}` }
        : {}),
    };
  } catch (e) {
    runAllTests = { ok: false, error: e instanceof Error ? e.message : "Request failed" };
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

  const allTestsOk = systemTest.ok && runAllTests.ok && uiTests.ok;
  const summary =
    cleanup.errors.length > 0
      ? "Cleanup completed with errors. Review cleanup.errors."
      : allTestsOk
        ? "Test data cleaned. System Tests, Full System Test, and UI Tests passed — ready for production."
        : "Test data cleaned. Some tests failed — resolve before deployment.";

  return NextResponse.json({
    ok: cleanup.errors.length === 0 && allTestsOk,
    cleanup: { deleted: cleanup.deleted, errors: cleanup.errors },
    systemTest,
    runAllTests,
    uiTests,
    summary,
  });
}
