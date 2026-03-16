/**
 * GET /api/system/guardian
 *
 * System Guardian: probes each critical module independently and returns a
 * structured health report. Failures are also written to System Logs.
 *
 * Checks:
 *   1. Database          — Supabase SELECT 1 via the projects table
 *   2. Storage           — Supabase Storage: list worker-receipts bucket (1 item)
 *   3. Receipt Upload    — GET /api/upload-receipt/options (route liveness)
 *   4. Receipts Module   — Supabase SELECT from worker_receipts
 *   5. Expenses Module   — Supabase SELECT from expenses
 *   6. Invoices Module   — Supabase SELECT from invoices
 *   7. Activity Logs     — Supabase SELECT from activity_logs
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
    const hasIssues = orphanCount > 0 || ghostCount > 0 || dupCount > 0 || staleTasks > 0 || staleProjects > 0;
    if (res.status >= 500 || (data.ok === false && hasIssues)) {
      const msg =
        (data.errors?.length ?? 0) > 0
          ? data.errors.join("; ")
          : hasIssues
            ? [orphanCount && `${orphanCount} orphan`, ghostCount && `${ghostCount} ghost`, dupCount && `${dupCount} duplicate`, (staleTasks + staleProjects) > 0 && "stale test data"]
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
    return { name: "Data integrity", ok: false, error: e instanceof Error ? e.message : "Unreachable" };
  }
}

async function checkEndpoint(origin: string, urlPath: string, displayName: string): Promise<GuardianCheck> {
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
    return { name: displayName, ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse<GuardianResult>> {
  const origin = new URL(request.url).origin;

  const c = getServerSupabase();

  const notConfigured = (name: string): GuardianCheck => ({
    name,
    ok: false,
    error: "Supabase not configured",
  });

  // Run all checks in parallel for speed
  const [database, storage, receiptUpload, receipts, expenses, invoices, activityLogs, dataIntegrity] =
    await Promise.all([
      c ? checkDatabase(c) : Promise.resolve(notConfigured("Database")),
      c ? checkStorage(c) : Promise.resolve(notConfigured("Storage")),
      checkEndpoint(origin, "/api/upload-receipt/options", "Receipt Upload"),
      c ? checkTable(c, "worker_receipts", "Receipts Module") : Promise.resolve(notConfigured("Receipts Module")),
      c ? checkTable(c, "expenses", "Expenses Module") : Promise.resolve(notConfigured("Expenses Module")),
      c ? checkTable(c, "invoices", "Invoices Module") : Promise.resolve(notConfigured("Invoices Module")),
      c ? checkTable(c, "activity_logs", "Activity Logs") : Promise.resolve(notConfigured("Activity Logs")),
      checkDataIntegrity(origin),
    ]);

  const checks: GuardianCheck[] = [
    database,
    storage,
    receiptUpload,
    receipts,
    expenses,
    invoices,
    activityLogs,
    dataIntegrity,
  ];
  const ok = checks.every((ch) => ch.ok);

  // Log every failure to System Logs so they appear on the logs page
  for (const ch of checks) {
    if (!ch.ok) {
      addSystemLog({
        module: "Guardian",
        type: "Error",
        message: `${ch.name} check failed: ${ch.error ?? "unknown"}`,
      });
    }
  }

  return NextResponse.json({
    ok,
    checks,
    checkedAt: new Date().toISOString(),
  });
}
