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

/** Mirrors `src/app/api/upload-receipt/options/route.ts` — no business filters on workers. */
export const UPLOAD_RECEIPT_OPTIONS_ROUTE_EXPECTATIONS = {
  query:
    'from("workers").select("id, name").order("name") — no `.eq` / `.filter` in application code.',
  rowRequirements:
    "Worker rows must be visible to the Supabase client the route uses (prefer service role). The handler does not filter by status, is_active, active, or deleted_at; those columns are not selected in the JSON response.",
} as const;

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
  /** Align with seed.sql / constraints (`workers_status_check_v2` allows active|inactive|Active|Inactive). */
  const { error } = await admin.from("workers").upsert(
    {
      id: REIMBURSEMENT_VISUAL_WORKER_ID,
      name: REIMBURSEMENT_VISUAL_WORKER_NAME,
      status: "active",
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message ?? "Failed to upsert reimbursement visual worker.");
}

function pickWorkerDiagnosticFields(row: Record<string, unknown>): Record<string, unknown> {
  const keys = ["id", "name", "status", "is_active", "active", "deleted_at"] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = row[k] !== undefined ? row[k] : "(column absent)";
  }
  return out;
}

function uuidStringsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Align with `GET /api/upload-receipt/options` — handler returns `{ workers, projects }`; tolerate wrappers if proxies change shape. */
export type ParsedUploadReceiptOptions = {
  workers: Array<{ id: string; name: string }>;
  topLevelKeys: string[];
  parsePath: "root.workers" | "data.workers" | "result.workers" | "none";
  rawParseError?: string;
};

export function parseUploadReceiptOptionsResponseBody(text: string): ParsedUploadReceiptOptions {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (e) {
    return {
      workers: [],
      topLevelKeys: [],
      parsePath: "none",
      rawParseError: e instanceof Error ? e.message : String(e),
    };
  }
  const topLevelKeys =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? Object.keys(raw as object)
      : [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      workers: [],
      topLevelKeys,
      parsePath: "none",
      rawParseError: "JSON root is not an object",
    };
  }
  const o = raw as Record<string, unknown>;
  const candidates: Array<{ parsePath: ParsedUploadReceiptOptions["parsePath"]; arr: unknown }> = [
    { parsePath: "root.workers", arr: o.workers },
    {
      parsePath: "data.workers",
      arr:
        o.data !== null && typeof o.data === "object"
          ? (o.data as Record<string, unknown>).workers
          : undefined,
    },
    {
      parsePath: "result.workers",
      arr:
        o.result !== null && typeof o.result === "object"
          ? (o.result as Record<string, unknown>).workers
          : undefined,
    },
  ];
  for (const { parsePath, arr } of candidates) {
    if (!Array.isArray(arr)) continue;
    const workers = arr.map((item) => {
      const row =
        item !== null && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
      };
    });
    return { workers, topLevelKeys, parsePath };
  }
  return {
    workers: [],
    topLevelKeys,
    parsePath: "none",
    rawParseError: "no workers[] array at root, data, or result",
  };
}

function uploadOptionsWorkerHit(workers: Array<{ id: string; name: string }>): boolean {
  return workers.some(
    (w) =>
      uuidStringsEqual(w.id, REIMBURSEMENT_VISUAL_WORKER_ID) ||
      w.name.trim() === REIMBURSEMENT_VISUAL_WORKER_NAME
  );
}

/**
 * After `ensureReimbursementVisualWorker`, log what Playwright sees from the same Next instance as the browser.
 * Does not print secrets.
 */
export async function logUploadReceiptOptionsSnapshot(
  request: APIRequestContext,
  label: string
): Promise<void> {
  const res = await request.get("/api/upload-receipt/options");
  const text = await res.text();
  const parsed = parseUploadReceiptOptionsResponseBody(text);
  const ids = parsed.workers.map((w) => w.id);
  const names = parsed.workers.map((w) => w.name);
  const contains = ids.some((id) => uuidStringsEqual(id, REIMBURSEMENT_VISUAL_WORKER_ID));
  const payload = {
    tag: "[reimbursement-visual][options snapshot after ensure]",
    label,
    httpStatus: res.status(),
    parsePath: parsed.parsePath,
    topLevelJsonKeys: parsed.topLevelKeys,
    workersLength: parsed.workers.length,
    workersContains8888: contains,
    workerIdsFirst5: ids.slice(0, 5),
    workerIdsLast5: ids.slice(Math.max(0, ids.length - 5)),
    workerNamesFirst5: names.slice(0, 5),
    workerNamesLast5: names.slice(Math.max(0, names.length - 5)),
    parseError: parsed.rawParseError ?? null,
  };
  console.log(JSON.stringify(payload, null, 2));
}

/**
 * Poll until the upload-receipt options API returns our worker (same row Playwright upserts).
 * If this times out, Next.js is likely using anon Supabase for `/api/upload-receipt/options` while RLS
 * hides `workers` rows — set SUPABASE_SERVICE_ROLE_KEY for the dev server / Playwright webServer env.
 *
 * Pass `admin` so on timeout we log DB truth vs HTTP response (same DB the test mutates).
 */
export async function waitUntilWorkerAppearsInUploadOptions(
  request: APIRequestContext,
  timeoutMs = 120_000,
  admin?: SupabaseClient | null
): Promise<void> {
  const started = Date.now();
  let lastBody = "";
  let lastWorkerCount = 0;
  let lastWorkersFromApi: Array<{ id: string; name: string }> = [];
  let lastHttpStatus = 0;
  let lastWorkersIds: string[] = [];
  let lastWorkersNames: string[] = [];
  let lastTopLevelJsonKeys: string[] = [];
  let lastParsePath: ParsedUploadReceiptOptions["parsePath"] = "none";
  let lastJsonParseError: string | null = null;
  let lastRawBodySnippet = "";
  while (Date.now() - started < timeoutMs) {
    const res = await request.get("/api/upload-receipt/options");
    lastHttpStatus = res.status();
    if (!res.ok()) {
      lastBody = (await res.text()).slice(0, 400);
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    const text = await res.text();
    lastRawBodySnippet = text.slice(0, 2000);
    const parsed = parseUploadReceiptOptionsResponseBody(text);
    lastJsonParseError = parsed.rawParseError ?? null;
    lastTopLevelJsonKeys = parsed.topLevelKeys;
    lastParsePath = parsed.parsePath;
    const workers = parsed.workers;
    lastWorkersFromApi = workers;
    lastWorkerCount = workers.length;
    lastWorkersIds = workers.map((w) => w.id);
    lastWorkersNames = workers.map((w) => w.name);
    const hit = uploadOptionsWorkerHit(workers);
    if (hit) return;
    await new Promise((r) => setTimeout(r, 600));
  }

  /** One immediate refetch — avoids losing the worker row if it appeared right after the last poll tick. */
  let postLoopRushRefetch: Record<string, unknown> | null = null;
  try {
    const rushRes = await request.get("/api/upload-receipt/options");
    if (rushRes.ok()) {
      const rushText = await rushRes.text();
      const rushParsed = parseUploadReceiptOptionsResponseBody(rushText);
      postLoopRushRefetch = {
        httpStatus: rushRes.status(),
        parsePath: rushParsed.parsePath,
        topLevelJsonKeys: rushParsed.topLevelKeys,
        workersIds: rushParsed.workers.map((w) => w.id),
        workersNames: rushParsed.workers.map((w) => w.name),
        rawBodySnippet: rushText.slice(0, 1500),
        parseError: rushParsed.rawParseError ?? null,
      };
      if (uploadOptionsWorkerHit(rushParsed.workers)) {
        console.log(
          "[reimbursement-visual] Post-loop rush refetch of /api/upload-receipt/options includes E2E worker; continuing."
        );
        return;
      }
      lastWorkersFromApi = rushParsed.workers;
      lastWorkerCount = rushParsed.workers.length;
      lastWorkersIds = rushParsed.workers.map((w) => w.id);
      lastWorkersNames = rushParsed.workers.map((w) => w.name);
      lastTopLevelJsonKeys = rushParsed.topLevelKeys;
      lastParsePath = rushParsed.parsePath;
      lastJsonParseError = rushParsed.rawParseError ?? null;
      lastRawBodySnippet = rushText.slice(0, 2000);
      lastHttpStatus = rushRes.status();
    } else {
      postLoopRushRefetch = {
        httpStatus: rushRes.status(),
        bodySnippet: (await rushRes.text()).slice(0, 400),
      };
    }
  } catch (e) {
    postLoopRushRefetch = { fetchError: e instanceof Error ? e.message : String(e) };
  }

  const listContainsE2eId8888 = lastWorkersIds.some((id) =>
    uuidStringsEqual(id, REIMBURSEMENT_VISUAL_WORKER_ID)
  );

  let dbDiag: Record<string, unknown> | null = null;
  if (admin) {
    const { data: e2eRow } = await admin
      .from("workers")
      .select("*")
      .eq("id", REIMBURSEMENT_VISUAL_WORKER_ID)
      .maybeSingle();
    const { data: first10 } = await admin.from("workers").select("*").order("name").limit(10);
    dbDiag = {
      e2eWorkerByServiceRole: e2eRow
        ? pickWorkerDiagnosticFields(e2eRow as Record<string, unknown>)
        : null,
      first10WorkersByName_serviceRole: ((first10 ?? []) as Record<string, unknown>[]).map((row) =>
        pickWorkerDiagnosticFields(row)
      ),
    };
  }

  loadE2EProcessEnv();
  let playwrightEnvSupabaseHost: string | null = null;
  try {
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    playwrightEnvSupabaseHost = u ? new URL(u).host : null;
  } catch {
    playwrightEnvSupabaseHost = "(invalid NEXT_PUBLIC_SUPABASE_URL in Playwright process)";
  }

  let nextJsDiagnostics: unknown = null;
  try {
    const dres = await request.get("/api/diag/upload-receipt-supabase");
    if (dres.ok()) {
      nextJsDiagnostics = await dres.json();
    } else {
      nextJsDiagnostics = {
        httpStatus: dres.status(),
        bodySnippet: (await dres.text()).slice(0, 400),
      };
    }
  } catch (e) {
    nextJsDiagnostics = { fetchError: e instanceof Error ? e.message : String(e) };
  }

  const diagRec =
    nextJsDiagnostics && typeof nextJsDiagnostics === "object" && nextJsDiagnostics !== null
      ? (nextJsDiagnostics as Record<string, unknown>)
      : null;
  const diagSeesE2eViaOptionsClient = diagRec?.e2eWorker8888VisibleViaOptionsRouteClient === true;

  let optionsRecoveryRefetch: Record<string, unknown> | null = null;
  if (diagSeesE2eViaOptionsClient && !listContainsE2eId8888) {
    const r2 = await request.get("/api/upload-receipt/options");
    const text2 = await r2.text();
    const p2 = parseUploadReceiptOptionsResponseBody(text2);
    const ids2 = p2.workers.map((w) => w.id);
    const names2 = p2.workers.map((w) => w.name);
    const has8888 = ids2.some((id) => uuidStringsEqual(id, REIMBURSEMENT_VISUAL_WORKER_ID));
    optionsRecoveryRefetch = {
      reason:
        "diag e2eWorker8888VisibleViaOptionsRouteClient=true but last poll workers ids lacked 8888 — full refetch",
      httpStatus: r2.status(),
      parsePath: p2.parsePath,
      topLevelJsonKeys: p2.topLevelKeys,
      workersIds: ids2,
      workersNames: names2,
      listContainsE2eId8888: has8888,
      rawBodySnippet: text2.slice(0, 2000),
      parseError: p2.rawParseError ?? null,
    };
    if (r2.ok() && uploadOptionsWorkerHit(p2.workers)) {
      console.log(
        "[reimbursement-visual] Recovery: refetch of /api/upload-receipt/options includes E2E worker after diag mismatch; continuing."
      );
      return;
    }
    console.error(
      "[reimbursement-visual] Recovery refetch did not resolve hit:",
      JSON.stringify(optionsRecoveryRefetch, null, 2)
    );
  }

  const nextHost =
    nextJsDiagnostics &&
    typeof nextJsDiagnostics === "object" &&
    "nextPublicSupabaseHost" in nextJsDiagnostics
      ? (nextJsDiagnostics as { nextPublicSupabaseHost?: string | null }).nextPublicSupabaseHost
      : null;

  const sampleApi = lastWorkersFromApi.slice(0, 10).map((w) => ({
    id: w.id,
    name: w.name,
    status: "(not in API JSON)",
    is_active: "(not in API JSON)",
    active: "(not in API JSON)",
    deleted_at: "(not in API JSON)",
  }));

  const payload = {
    tag: "[reimbursement-visual][upload-receipt/options timeout]",
    routeExpectations: UPLOAD_RECEIPT_OPTIONS_ROUTE_EXPECTATIONS,
    lastHttpStatus,
    lastParsePath,
    lastTopLevelJsonKeys,
    lastJsonParseError,
    lastRawBodySnippet,
    workersLength: lastWorkerCount,
    lastWorkersIds,
    lastWorkersNames,
    listContainsE2eId8888,
    first10FromLastOkResponse: sampleApi,
    note: "Real route returns { workers, projects } with workers at root (see parsePath). Parsed with parseUploadReceiptOptionsResponseBody — tries root.workers, data.workers, result.workers.",
    dbIfAvailable: dbDiag,
    playwrightEnvSupabaseHost,
    nextJsDiagnosticsFromRoute: nextJsDiagnostics,
    postLoopRushRefetch,
    optionsRecoveryRefetch,
    nextAndPlaywrightHostsMatch:
      playwrightEnvSupabaseHost != null &&
      nextHost != null &&
      playwrightEnvSupabaseHost === nextHost,
    urlMismatchHint:
      "If e2eWorkerByServiceRole exists in DB but workersLength omits E2E id, compare playwrightEnvSupabaseHost vs nextJsDiagnosticsFromRoute.nextPublicSupabaseHost (Next must use the same DB as .env.test).",
  };

  console.error(JSON.stringify(payload, null, 2));

  throw new Error(
    `Timeout: "${REIMBURSEMENT_VISUAL_WORKER_NAME}" not in GET /api/upload-receipt/options (${timeoutMs}ms). ` +
      `Route: ${UPLOAD_RECEIPT_OPTIONS_ROUTE_EXPECTATIONS.query} ` +
      `Last OK response: workers.length=${lastWorkerCount}, httpStatus=${lastHttpStatus}. ` +
      `See stderr JSON block [reimbursement-visual][upload-receipt/options timeout]. ` +
      `Non-OK body snippet: ${lastBody || "(none)"}`
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

type ReimbursementExpenseRow = {
  id: string;
  reference_no?: string | null;
  source?: string | null;
  source_id?: string | null;
  vendor?: string | null;
  vendor_name?: string | null;
  total?: number | string | null;
  amount?: number | string | null;
  status?: string | null;
  worker_id?: string | null;
  project_id?: string | null;
};

type ReimbursementExpenseLineRow = {
  id: string;
  expense_id: string;
  amount?: number | string | null;
  total?: number | string | null;
  project_id?: string | null;
  category?: string | null;
};

export async function fetchReimbursementExpenseSnapshot(
  admin: SupabaseClient,
  reimbursementId: string
): Promise<{
  referenceNo: string;
  expenses: ReimbursementExpenseRow[];
  lineRows: ReimbursementExpenseLineRow[];
  lineTotal: number;
}> {
  const referenceNo = `REIM-${reimbursementId}`;
  const columns =
    "id,reference_no,source,source_id,vendor,vendor_name,total,amount,status,worker_id,project_id";
  const rowsById = new Map<string, ReimbursementExpenseRow>();

  const byReference = await admin.from("expenses").select(columns).eq("reference_no", referenceNo);
  if (byReference.error) {
    throw new Error(byReference.error.message ?? "Failed to read reimbursement expense by ref.");
  }
  for (const row of (byReference.data ?? []) as ReimbursementExpenseRow[]) {
    rowsById.set(row.id, row);
  }

  const bySource = await admin.from("expenses").select(columns).eq("source_id", reimbursementId);
  if (bySource.error) {
    throw new Error(bySource.error.message ?? "Failed to read reimbursement expense by source.");
  }
  for (const row of (bySource.data ?? []) as ReimbursementExpenseRow[]) {
    rowsById.set(row.id, row);
  }

  const expenses = [...rowsById.values()];
  let lineRows: ReimbursementExpenseLineRow[] = [];
  if (expenses.length > 0) {
    const lines = await admin
      .from("expense_lines")
      .select("id,expense_id,amount,total,project_id,category")
      .in(
        "expense_id",
        expenses.map((row) => row.id)
      );
    if (lines.error) {
      throw new Error(lines.error.message ?? "Failed to read reimbursement expense lines.");
    }
    lineRows = (lines.data ?? []) as ReimbursementExpenseLineRow[];
  }

  const lineTotal = lineRows.reduce((sum, line) => sum + Number(line.amount ?? line.total ?? 0), 0);
  return { referenceNo, expenses, lineRows, lineTotal };
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
