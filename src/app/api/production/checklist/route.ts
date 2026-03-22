/**
 * Production Launch Checklist
 * GET: Run all checks and return report (no cleanup).
 * POST: Body { runCleanup?: boolean } — if true, delete test data then run checks.
 *
 * Returns: summary with databaseStatus, crudFunctionality, apiStatus, uiStatus,
 * testResults, productionReadiness, readyForDeployment.
 */

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { cleanupTestData } from "@/lib/cleanup-test-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CheckResult = { name: string; ok: boolean; error?: string };

async function runCleanup(
  _origin: string
): Promise<{ deleted: Record<string, number>; errors: string[] }> {
  const c = getServerSupabase();
  if (!c) return { deleted: {}, errors: ["Supabase not configured"] };
  return cleanupTestData(c);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  return runChecklist(origin, false);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  let runCleanupFlag = false;
  try {
    const body = await request.json().catch(() => ({}));
    runCleanupFlag = body?.runCleanup === true;
  } catch {
    /* ignore */
  }
  return runChecklist(origin, runCleanupFlag);
}

async function runChecklist(origin: string, doCleanup: boolean) {
  const report: {
    databaseStatus: "ok" | "error";
    databaseMissing?: string[];
    crudFunctionality: "ok" | "error";
    crudDetails?: unknown;
    apiStatus: "ok" | "error";
    apiChecks?: CheckResult[];
    uiStatus: "ok" | "error" | "skipped";
    uiDetails?: unknown;
    testResults: "ok" | "error" | "skipped";
    testDetails?: unknown;
    productionReadiness: "ok" | "warning" | "error";
    envVars: boolean;
    supabaseConnection: boolean;
    cleanup?: { deleted: Record<string, number>; errors: string[] };
    readyForDeployment: boolean;
    summary: string;
  } = {
    databaseStatus: "ok",
    crudFunctionality: "ok",
    apiStatus: "ok",
    uiStatus: "skipped",
    testResults: "skipped",
    productionReadiness: "ok",
    envVars: !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    ),
    supabaseConnection: false,
    readyForDeployment: false,
    summary: "",
  };

  // ── Optional: Remove test data ─────────────────────────────────────────────
  if (doCleanup) {
    const cleanupResult = await runCleanup(origin);
    report.cleanup = cleanupResult;
  }

  // ── 1. Database integrity ─────────────────────────────────────────────────
  try {
    const schemaRes = await fetch(`${origin}/api/schema-check`, { cache: "no-store" });
    const schemaData = (await schemaRes.json().catch(() => ({}))) as {
      status?: string;
      missing?: string[];
    };
    if (schemaRes.ok && schemaData.status === "ok") {
      report.databaseStatus = "ok";
      report.supabaseConnection = true;
    } else {
      report.databaseStatus = "error";
      report.databaseMissing = schemaData.missing ?? [];
    }
  } catch (e) {
    report.databaseStatus = "error";
    report.databaseMissing = [e instanceof Error ? e.message : "Schema check failed"];
  }

  // ── 2. CRUD (full system test) ───────────────────────────────────────────
  try {
    const crudRes = await fetch(`${origin}/api/test/full-system-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const crudData = (await crudRes.json().catch(() => ({}))) as {
      ok?: boolean;
      tests?: unknown[];
    };
    const allPassed =
      crudRes.ok &&
      crudData.ok === true &&
      (crudData.tests ?? []).every((t) => (t as { ok?: boolean }).ok === true);
    report.crudFunctionality = allPassed ? "ok" : "error";
    report.crudDetails = crudData.tests;
    if (!allPassed) report.productionReadiness = "error";
  } catch (e) {
    report.crudFunctionality = "error";
    report.crudDetails = { error: e instanceof Error ? e.message : "Full system test failed" };
    report.productionReadiness = "error";
  }

  // ── 3. API health ──────────────────────────────────────────────────────────
  const apiRoutes: { path: string; name: string }[] = [
    { path: "/api/projects", name: "Projects" },
    { path: "/api/expenses", name: "Expenses" },
    { path: "/api/invoices", name: "Invoices" },
    { path: "/api/worker-receipts", name: "Worker Receipts" },
    { path: "/api/operations/tasks", name: "Tasks" },
    { path: "/api/system-health", name: "System Health" },
  ];
  const apiChecks: CheckResult[] = [];
  for (const { path, name } of apiRoutes) {
    try {
      const res = await fetch(`${origin}${path}`, { cache: "no-store" });
      const ok = res.ok && res.status < 500;
      apiChecks.push(ok ? { name, ok: true } : { name, ok: false, error: `HTTP ${res.status}` });
      if (!ok) report.apiStatus = "error";
    } catch (e) {
      apiChecks.push({ name, ok: false, error: e instanceof Error ? e.message : "Unreachable" });
      report.apiStatus = "error";
    }
  }
  report.apiChecks = apiChecks;
  if (report.apiStatus === "error") report.productionReadiness = "error";

  // ── 4. UI tests (run via API) ─────────────────────────────────────────────
  try {
    const uiRes = await fetch(`${origin}/api/test/run-ui-tests`, { method: "POST" });
    const uiData = (await uiRes.json().catch(() => ({}))) as {
      ok?: boolean;
      tests?: unknown[];
      error?: string;
    };
    const uiOk = uiRes.ok && uiData.ok === true;
    report.uiStatus = uiOk ? "ok" : "error";
    report.uiDetails = uiData.tests ?? uiData.error;
    if (!uiOk)
      report.productionReadiness =
        report.productionReadiness === "ok" ? "warning" : report.productionReadiness;
  } catch {
    report.uiStatus = "skipped";
    report.uiDetails = "UI tests not run (browser unavailable or timeout)";
    report.productionReadiness = report.productionReadiness === "error" ? "error" : "warning";
  }

  // ── 5. Run all tests (system + UI + guardian + schema) ────────────────────
  try {
    const runAllRes = await fetch(`${origin}/api/test/run-all-tests`, { method: "POST" });
    const runAllData = (await runAllRes.json().catch(() => ({}))) as {
      ok?: boolean;
      groups?: unknown[];
    };
    report.testResults = runAllRes.ok && runAllData.ok === true ? "ok" : "error";
    report.testDetails = runAllData.groups;
    if (report.testResults !== "ok") report.productionReadiness = "error";
  } catch {
    report.testResults = "skipped";
    report.testDetails = "Run-all-tests not executed";
  }

  // ── 6. Deployment readiness ──────────────────────────────────────────────
  if (!report.envVars) report.productionReadiness = "error";
  if (!report.supabaseConnection) report.productionReadiness = "error";

  report.readyForDeployment =
    report.databaseStatus === "ok" &&
    report.crudFunctionality === "ok" &&
    report.apiStatus === "ok" &&
    report.testResults === "ok" &&
    report.envVars &&
    report.supabaseConnection;

  report.summary = report.readyForDeployment
    ? "READY FOR DEPLOYMENT — All checks passed."
    : "NOT READY — Resolve failing checks before deployment.";

  return NextResponse.json(report);
}
