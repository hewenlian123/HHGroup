/**
 * GET /api/system/guardian
 *
 * System Guardian: probes each critical module independently and returns a
 * structured health report. Failures are also written to System Logs.
 * Covers all sidebar modules (projects, labor, finance, workers, system).
 *
 * Returns:
 *   { ok: boolean, checks: [{ name, ok, error? }], checkedAt: ISO string }
 */

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { addSystemLog } from "@/lib/system-log-store";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export type GuardianCheck = {
  name: string;
  ok: boolean;
  error?: string;
};

export type GuardianResult = {
  ok: boolean;
  checks: GuardianCheck[];
  checkedAt: string;
};

// ── individual check helpers ─────────────────────────────────────────────────

async function checkDatabase(c: SupabaseClient): Promise<GuardianCheck> {
  try {
    const { error } = await c.from("projects").select("id").limit(1);
    if (error) return { name: "Database", ok: false, error: error.message };
    return { name: "Database", ok: true };
  } catch (e) {
    return { name: "Database", ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

async function checkStorage(c: SupabaseClient): Promise<GuardianCheck> {
  try {
    // list() with limit:1 works with anon key when the bucket RLS allows reads.
    // A 404 / StorageApiError means the bucket doesn't exist or is misconfigured.
    const { error } = await c.storage.from("worker-receipts").list("", { limit: 1 });
    if (error) return { name: "Storage", ok: false, error: error.message };
    return { name: "Storage", ok: true };
  } catch (e) {
    return { name: "Storage", ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

async function checkDataIntegrity(origin: string): Promise<GuardianCheck> {
  try {
    const res = await fetch(`${origin}/api/system/integrity`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      orphanedTasks?: { count?: number };
      ghostTasks?: { count?: number };
      duplicateTasks?: { count?: number };
      staleTestData?: { tasks?: { count?: number }; projects?: { count?: number } };
      errors?: string[];
    };
    const orphanCount = data.orphanedTasks?.count ?? 0;
    const ghostCount = data.ghostTasks?.count ?? 0;
    const dupCount = data.duplicateTasks?.count ?? 0;
    const staleTasks = data.staleTestData?.tasks?.count ?? 0;
    const staleProjects = data.staleTestData?.projects?.count ?? 0;
    const hasIssues =
      orphanCount > 0 || ghostCount > 0 || dupCount > 0 || staleTasks > 0 || staleProjects > 0;
    if (res.status >= 500 || (data.ok === false && hasIssues)) {
      const msg =
        (data.errors?.length ?? 0) > 0
          ? (data.errors ?? []).join("; ")
          : hasIssues
            ? [
                orphanCount && `${orphanCount} orphan`,
                ghostCount && `${ghostCount} ghost`,
                dupCount && `${dupCount} duplicate`,
                staleTasks + staleProjects > 0 && "stale test data",
              ]
                .filter(Boolean)
                .join("; ")
            : "Integrity check failed";
      return { name: "Data integrity", ok: false, error: msg };
    }
    if (hasIssues) {
      const parts: string[] = [];
      if (orphanCount > 0) parts.push(`${orphanCount} orphan`);
      if (ghostCount > 0) parts.push(`${ghostCount} ghost`);
      if (dupCount > 0) parts.push(`${dupCount} duplicate`);
      if (staleTasks > 0 || staleProjects > 0) parts.push("stale test data");
      return { name: "Data integrity", ok: false, error: parts.join("; ") };
    }
    return { name: "Data integrity", ok: true };
  } catch (e) {
    return {
      name: "Data integrity",
      ok: false,
      error: e instanceof Error ? e.message : "Unreachable",
    };
  }
}

async function checkEndpoint(
  origin: string,
  urlPath: string,
  displayName: string
): Promise<GuardianCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${origin}${urlPath}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    // 2xx, 4xx (route exists, rejected input) → route is alive
    // 404, 5xx → problem
    const ok = res.status !== 404 && res.status < 500;
    return {
      name: displayName,
      ok,
      ...(ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (e) {
    return { name: displayName, ok: false, error: e instanceof Error ? e.message : "Unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

async function checkTable(
  c: SupabaseClient,
  table: string,
  displayName: string
): Promise<GuardianCheck> {
  try {
    const { error } = await c.from(table).select("id").limit(1);
    if (error) return { name: displayName, ok: false, error: error.message };
    return { name: displayName, ok: true };
  } catch (e) {
    return {
      name: displayName,
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse<GuardianResult>> {
  const safeResult = (checks: GuardianCheck[], ok: boolean): NextResponse<GuardianResult> =>
    NextResponse.json({
      ok,
      checks,
      checkedAt: new Date().toISOString(),
    });

  try {
    const origin = new URL(request.url).origin;
    const c = getServerSupabase();

    const notConfigured = (name: string): GuardianCheck => ({
      name,
      ok: false,
      error: "Supabase not configured",
    });

    // Run all checks in parallel (one per sidebar module / table)
    const [
      database,
      storage,
      receiptUpload,
      projects,
      workers,
      labor,
      reimbursements,
      expenses,
      workerPayments,
      invoices,
      customers,
      commissionPayments,
      paymentsReceived,
      deposits,
      bills,
      workerAdvances,
      accounts,
      workerInvoices,
      vendors,
      subcontractors,
      receiptUploads,
      documents,
      activityLogs,
      backups,
      dataIntegrity,
    ] = await Promise.all([
      c ? checkDatabase(c) : Promise.resolve(notConfigured("Database")),
      c ? checkStorage(c) : Promise.resolve(notConfigured("Storage")),
      checkEndpoint(origin, "/api/upload-receipt/options", "Receipt Upload"),
      c ? checkTable(c, "projects", "Projects") : Promise.resolve(notConfigured("Projects")),
      c ? checkTable(c, "workers", "Workers") : Promise.resolve(notConfigured("Workers")),
      c ? checkTable(c, "labor_entries", "Labor") : Promise.resolve(notConfigured("Labor")),
      c
        ? checkTable(c, "worker_reimbursements", "Reimbursements")
        : Promise.resolve(notConfigured("Reimbursements")),
      c ? checkTable(c, "expenses", "Expenses") : Promise.resolve(notConfigured("Expenses")),
      c
        ? checkTable(c, "worker_payments", "Worker Payments")
        : Promise.resolve(notConfigured("Worker Payments")),
      c ? checkTable(c, "invoices", "Invoices") : Promise.resolve(notConfigured("Invoices")),
      c ? checkTable(c, "customers", "Customers") : Promise.resolve(notConfigured("Customers")),
      c
        ? checkTable(c, "project_commissions", "Commission Payments")
        : Promise.resolve(notConfigured("Commission Payments")),
      c
        ? checkTable(c, "payments_received", "Payments Received")
        : Promise.resolve(notConfigured("Payments Received")),
      c ? checkTable(c, "deposits", "Deposits") : Promise.resolve(notConfigured("Deposits")),
      c ? checkTable(c, "bills", "Bills") : Promise.resolve(notConfigured("Bills")),
      c
        ? checkTable(c, "worker_advances", "Worker Advances")
        : Promise.resolve(notConfigured("Worker Advances")),
      c ? checkTable(c, "accounts", "Accounts") : Promise.resolve(notConfigured("Accounts")),
      c
        ? checkTable(c, "worker_invoices", "Worker Invoices")
        : Promise.resolve(notConfigured("Worker Invoices")),
      c ? checkTable(c, "vendors", "Vendors") : Promise.resolve(notConfigured("Vendors")),
      c
        ? checkTable(c, "subcontractors", "Subcontractors")
        : Promise.resolve(notConfigured("Subcontractors")),
      c
        ? checkTable(c, "worker_receipts", "Receipt Uploads")
        : Promise.resolve(notConfigured("Receipt Uploads")),
      c ? checkTable(c, "documents", "Documents") : Promise.resolve(notConfigured("Documents")),
      c
        ? checkTable(c, "activity_logs", "Activity Logs")
        : Promise.resolve(notConfigured("Activity Logs")),
      checkEndpoint(origin, "/api/system/backup", "Backups"),
      checkDataIntegrity(origin),
    ]);

    const checks: GuardianCheck[] = [
      database,
      storage,
      receiptUpload,
      projects,
      workers,
      labor,
      reimbursements,
      expenses,
      workerPayments,
      invoices,
      customers,
      commissionPayments,
      paymentsReceived,
      deposits,
      bills,
      workerAdvances,
      accounts,
      workerInvoices,
      vendors,
      subcontractors,
      receiptUploads,
      documents,
      activityLogs,
      backups,
      dataIntegrity,
    ];
    const ok = checks.every((ch) => ch.ok);

    // Log every failure to System Logs so they appear on the logs page
    try {
      for (const ch of checks) {
        if (!ch.ok) {
          addSystemLog({
            module: "Guardian",
            type: "Error",
            message: `${ch.name} check failed: ${ch.error ?? "unknown"}`,
          });
        }
      }
    } catch {
      // avoid failing the response if logging fails
    }

    return safeResult(checks, ok);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const checks: GuardianCheck[] = [{ name: "Guardian", ok: false, error: message }];
    return safeResult(checks, false);
  }
}
