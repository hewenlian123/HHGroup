import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How we decide labor payroll settlement (paid vs unpaid for worker payouts).
 * - `payment_link`: source of truth is `labor_entries.worker_payment_id` only; `status` is workflow, not payout.
 * - `status_fallback`: DB has no `worker_payment_id` column — legacy rows may use `status === 'paid'`.
 */
export type LaborPayrollSettlementMode = "payment_link" | "status_fallback";

export type LaborPayrollDisplayStatus = "paid" | "unpaid" | "partial";

/** Alias for UI + clients: payroll line state (use with worker_payment_id). */
export type LaborPaymentStatus = LaborPayrollDisplayStatus;

/** True when the row is linked to a worker_payments row (non-empty id). */
export function hasWorkerPaymentLink(workerPaymentId: string | null | undefined): boolean {
  return String(workerPaymentId ?? "").trim().length > 0;
}

/**
 * Single entry point for labor **payroll** paid/unpaid UI.
 * - `payment_link` (default): uses `worker_payment_id` only — ignores `labor_entries.status`.
 * - `status_fallback`: legacy DB without FK column; uses `workflowStatusForLegacy` (e.g. status === "paid").
 */
export function getLaborPaymentStatus(
  workerPaymentId: string | null | undefined,
  workflowStatusForLegacy?: string | null,
  mode: LaborPayrollSettlementMode = "payment_link"
): LaborPaymentStatus {
  if (mode === "payment_link") {
    return hasWorkerPaymentLink(workerPaymentId) ? "paid" : "unpaid";
  }
  return laborPayrollDisplayStatus(workflowStatusForLegacy, workerPaymentId, "status_fallback");
}

/** Lowercase label for tables (matches Worker Balance wording). */
export function laborPaymentStatusUiLabel(status: LaborPaymentStatus): string {
  if (status === "paid") return "paid";
  if (status === "partial") return "partial";
  return "unpaid";
}

/** Infer mode from a labor_entries SELECT column list that was successfully applied. */
export function laborPayrollSettlementModeFromSelectList(cols: string): LaborPayrollSettlementMode {
  return /\bworker_payment_id\b/.test(cols) ? "payment_link" : "status_fallback";
}

/**
 * Display status for labor payroll (Worker balance, lists, receipt math).
 * `partial` reserved for when partial line settlement exists; not used yet.
 */
export function laborPayrollDisplayStatus(
  status: string | null | undefined,
  workerPaymentId: string | null | undefined,
  mode: LaborPayrollSettlementMode = "payment_link"
): LaborPayrollDisplayStatus {
  if (mode === "payment_link") {
    return hasWorkerPaymentLink(workerPaymentId) ? "paid" : "unpaid";
  }
  if (hasWorkerPaymentLink(workerPaymentId)) return "paid";
  return String(status ?? "")
    .trim()
    .toLowerCase() === "paid"
    ? "paid"
    : "unpaid";
}

/**
 * Worker pay settlement: unpaid for payroll purposes.
 * Prefer `payment_link` whenever `worker_payment_id` is selected (does not use `status` as source of truth).
 */
export function isLaborUnpaidForWorkerPayroll(
  status: string | null | undefined,
  workerPaymentId?: string | null,
  mode: LaborPayrollSettlementMode = "payment_link"
): boolean {
  return laborPayrollDisplayStatus(status, workerPaymentId, mode) !== "paid";
}

/** Same label logic as Labor daily list (session badges). */
export function laborSessionLabel(row: {
  morning?: boolean | null;
  afternoon?: boolean | null;
}): string | null {
  const m = row.morning === true;
  const a = row.afternoon === true;
  if (m && a) return "Full day";
  if (m && !a) return "Morning";
  if (!m && a) return "Afternoon";
  return null;
}

/**
 * labor_entries.worker_id FK references labor_workers(id). Worker Balances list uses labor_workers.
 * Resolve display name from labor_workers first, then workers (legacy / single-table setups).
 */
export async function resolveLaborWorkerForBalance(
  c: SupabaseClient,
  workerId: string
): Promise<{ id: string; name: string } | null> {
  const lw = await c.from("labor_workers").select("id, name").eq("id", workerId).maybeSingle();
  const a = lw.data as { id: string; name: string | null } | null;
  if (a?.id) {
    return { id: a.id, name: (a.name ?? "").trim() || "—" };
  }
  const w = await c.from("workers").select("id, name").eq("id", workerId).maybeSingle();
  const b = w.data as { id: string; name: string | null } | null;
  if (b?.id) {
    return { id: b.id, name: (b.name ?? "").trim() || "—" };
  }
  return null;
}

export function normWorkerBalanceName(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/**
 * worker_payments / worker_advances / worker_reimbursements reference public.workers(id).
 * Worker Balances uses labor_workers.id. When UUIDs drift but names match, remap FK → labor row.
 * Only remaps when exactly one labor_workers row shares the normalized name (avoids ambiguous merges).
 */
export async function createWorkersFkToLaborIdResolver(
  c: SupabaseClient,
  laborWorkers: { id: string; name: string | null }[],
  rawWorkerIds: Iterable<string>
): Promise<(rawWorkerId: string) => string> {
  const laborIdSet = new Set(laborWorkers.map((w) => String(w.id ?? "").trim()).filter(Boolean));
  const nameToLaborIds = new Map<string, string[]>();
  for (const w of laborWorkers) {
    const k = normWorkerBalanceName(w.name);
    if (!k) continue;
    const arr = nameToLaborIds.get(k) ?? [];
    arr.push(String(w.id));
    nameToLaborIds.set(k, arr);
  }

  const orphanIds = new Set<string>();
  for (const id of rawWorkerIds) {
    const t = String(id ?? "").trim();
    if (t && !laborIdSet.has(t)) orphanIds.add(t);
  }

  const workerNamesById = new Map<string, string | null>();
  if (orphanIds.size > 0) {
    const wr = await c
      .from("workers")
      .select("id, name")
      .in("id", [...orphanIds]);
    if (!wr.error && wr.data) {
      for (const row of wr.data as { id: string; name: string | null }[]) {
        workerNamesById.set(String(row.id), row.name);
      }
    }
  }

  return (rawWorkerId: string): string => {
    const id = String(rawWorkerId ?? "").trim();
    if (!id) return rawWorkerId;
    if (laborIdSet.has(id)) return id;
    const nm = workerNamesById.get(id);
    const candidates = nameToLaborIds.get(normWorkerBalanceName(nm)) ?? [];
    if (candidates.length === 1) return candidates[0]!;
    return id;
  };
}

/**
 * All worker_id values to query for financial rows when opening a labor_workers balance by id.
 * Includes the labor id plus any workers.id rows with the same normalized name when labor id is not in workers.
 */
export async function workerIdsForLaborBalanceFinancialQueries(
  c: SupabaseClient,
  laborWorkerId: string
): Promise<string[]> {
  const ids = new Set<string>();
  const lid = laborWorkerId.trim();
  if (!lid) return [];
  ids.add(lid);

  const wSame = await c.from("workers").select("id").eq("id", lid).maybeSingle();
  if (wSame.data && (wSame.data as { id?: string }).id) {
    return [lid];
  }

  const lw = await c.from("labor_workers").select("name").eq("id", lid).maybeSingle();
  const lname = (lw.data as { name?: string | null } | null)?.name;
  const k = normWorkerBalanceName(lname);
  if (!k) return [...ids];

  const { data: wrows, error } = await c.from("workers").select("id, name");
  if (error || !wrows) return [...ids];
  for (const r of wrows as { id: string; name: string | null }[]) {
    if (normWorkerBalanceName(r.name) === k) ids.add(String(r.id));
  }
  return [...ids];
}
