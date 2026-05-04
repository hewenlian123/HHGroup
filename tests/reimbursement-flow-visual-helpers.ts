/**
 * Shared setup for reimbursement-flow-visual Playwright spec:
 * ensure dedicated worker row, cleanup prior receipts/reimbursements/expenses, API assertions.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { APIRequestContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

/** Stable UUID for Playwright reimbursement flow (must not collide with seed.sql IDs). */
export const REIMBURSEMENT_VISUAL_WORKER_ID = "88888888-8888-8888-8888-888888888888";

export const REIMBURSEMENT_VISUAL_WORKER_NAME = "E2E Reimbursement Worker";
export const REIMBURSEMENT_VISUAL_VENDOR = "E2E Home Depot";
export const REIMBURSEMENT_VISUAL_AMOUNT = "12.34";
export const REIMBURSEMENT_VISUAL_NOTES = "E2E reimbursement receipt";

/** Minimal 1×1 PNG — same bytes as quick-expense-upload.spec.ts */
export const MIN_RECEIPT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

export const REIMBURSEMENT_VISUAL_SCREENSHOT_DIR = "test-results/reimbursement-visual";

export function ensureScreenshotDir(): void {
  try {
    mkdirSync(REIMBURSEMENT_VISUAL_SCREENSHOT_DIR, { recursive: true });
  } catch {
    /* exists */
  }
}

export function screenshotPath(stepFileBase: string): string {
  return `${REIMBURSEMENT_VISUAL_SCREENSHOT_DIR}/${stepFileBase}.png`;
}

export function getReimbursementVisualAdmin(): SupabaseClient | null {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key);
}

/**
 * Delete receipts/reimbursements for the dedicated worker and any expenses tied by REIM-{id}.
 */
export async function cleanupReimbursementVisualTestData(admin: SupabaseClient): Promise<void> {
  const workerId = REIMBURSEMENT_VISUAL_WORKER_ID;

  const { data: reims } = await admin
    .from("worker_reimbursements")
    .select("id")
    .eq("worker_id", workerId);
  const reimbIds = ((reims ?? []) as { id: string }[]).map((r) => r.id);
  const refNos = reimbIds.map((id) => `REIM-${id}`);

  if (refNos.length > 0) {
    const { data: expRows } = await admin.from("expenses").select("id").in("reference_no", refNos);
    const expIds = ((expRows ?? []) as { id: string }[]).map((e) => e.id);
    if (expIds.length > 0) {
      await admin.from("expense_lines").delete().in("expense_id", expIds);
      await admin.from("expenses").delete().in("id", expIds);
    }
  }

  const { data: strayExp } = await admin
    .from("expenses")
    .select("id")
    .eq("worker_id", workerId)
    .like("reference_no", "REIM-%");
  const strayIds = ((strayExp ?? []) as { id: string }[]).map((e) => e.id);
  if (strayIds.length > 0) {
    await admin.from("expense_lines").delete().in("expense_id", strayIds);
    await admin.from("expenses").delete().in("id", strayIds);
  }

  await admin.from("worker_receipts").delete().eq("worker_id", workerId);
  await admin.from("worker_reimbursements").delete().eq("worker_id", workerId);
}

/**
 * Upsert dedicated worker so `/api/upload-receipt/options` lists them.
 */
export async function ensureReimbursementVisualWorker(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("workers").upsert(
    {
      id: REIMBURSEMENT_VISUAL_WORKER_ID,
      name: REIMBURSEMENT_VISUAL_WORKER_NAME,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message ?? "Failed to upsert reimbursement visual worker.");
}

/**
 * Poll until the upload-receipt options API returns our worker (same row Playwright upserts).
 * If this times out, Next.js is likely using anon Supabase for `/api/upload-receipt/options` while RLS
 * hides `workers` rows — set SUPABASE_SERVICE_ROLE_KEY for the dev server / Playwright webServer env.
 */
export async function waitUntilWorkerAppearsInUploadOptions(
  request: APIRequestContext,
  timeoutMs = 120_000
): Promise<void> {
  const started = Date.now();
  let lastBody = "";
  let lastWorkerCount = 0;
  while (Date.now() - started < timeoutMs) {
    const res = await request.get("/api/upload-receipt/options");
    if (!res.ok()) {
      lastBody = (await res.text()).slice(0, 400);
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    const j = (await res.json()) as { workers?: Array<{ id: string; name: string }> };
    const workers = j.workers ?? [];
    lastWorkerCount = workers.length;
    const hit = workers.some(
      (w) =>
        w.id === REIMBURSEMENT_VISUAL_WORKER_ID ||
        w.name?.trim() === REIMBURSEMENT_VISUAL_WORKER_NAME
    );
    if (hit) return;
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(
    `Timeout: "${REIMBURSEMENT_VISUAL_WORKER_NAME}" not in GET /api/upload-receipt/options (${timeoutMs}ms). ` +
      `Upsert uses the service role; the options route needs SUPABASE_SERVICE_ROLE_KEY on the Next.js process so it can list workers. ` +
      `Last successful response had workers.length=${lastWorkerCount}. Non-OK body snippet: ${lastBody || "(none)"}`
  );
}

export async function fetchReimbursementStatus(
  admin: SupabaseClient,
  reimbursementId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("worker_reimbursements")
    .select("status")
    .eq("id", reimbursementId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to read reimbursement.");
  const row = data as { status?: string | null } | null;
  return row?.status != null ? String(row.status) : null;
}

export async function countExpensesByReferenceNo(
  request: APIRequestContext,
  referenceNo: string
): Promise<number> {
  const res = await request.get("/api/expenses");
  if (!res.ok()) return -1;
  const json = (await res.json()) as { expenses?: Array<{ referenceNo?: string | null }> };
  const list = json.expenses ?? [];
  return list.filter((e) => (e.referenceNo ?? "").trim() === referenceNo).length;
}
