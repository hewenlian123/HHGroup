import { financialDataUnavailable } from "@/lib/financial-availability";
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

/**
 * Outstanding worker balance after item-level settlement has been applied.
 *
 * `laborOwed` and `reimbursements` must already include only unpaid/unsettled rows.
 * Worker payments are an audit ledger; subtracting the full payments ledger again makes
 * linked payments count twice and lets unlinked legacy payments hide still-unpaid rows.
 */
export function workerOutstandingBalanceFromUnsettledItems({
  laborOwed,
  reimbursements,
  advances = 0,
}: {
  laborOwed: number;
  reimbursements: number;
  advances?: number;
}): number {
  return laborOwed + reimbursements - advances;
}

/**
 * Advances reduce current net-to-pay while they are still open/pending.
 * Once a payment uses an advance deduction, the advance is marked `deducted`;
 * Payroll Summary still counts deducted advances historically, but Worker Balance
 * must stop subtracting them from already-settled unpaid items.
 */
export function isWorkerAdvanceOpenForBalance(status: string | null | undefined): boolean {
  const s = String(status ?? "pending")
    .trim()
    .toLowerCase();
  return s !== "cancelled" && s !== "deducted";
}

/** Map legacy worker_payments.labor_entry_ids arrays back to the payment id that settled them. */
export function laborEntryPaymentIdMapFromWorkerPayments(
  rows: Iterable<{ id?: unknown; labor_entry_ids?: unknown }>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const paymentId = typeof row.id === "string" ? row.id.trim() : "";
    if (!paymentId || !Array.isArray(row.labor_entry_ids)) continue;
    for (const raw of row.labor_entry_ids) {
      const laborId = typeof raw === "string" ? raw.trim() : "";
      if (laborId && !out.has(laborId)) out.set(laborId, paymentId);
    }
  }
  return out;
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
  if (lw.error) financialDataUnavailable("labor_workers", lw.error);
  const a = lw.data as { id: string; name: string | null } | null;
  if (a?.id) {
    return { id: a.id, name: (a.name ?? "").trim() || "—" };
  }
  const w = await c.from("workers").select("id, name").eq("id", workerId).maybeSingle();
  if (w.error) financialDataUnavailable("workers", w.error);
  const b = w.data as { id: string; name: string | null } | null;
  if (b?.id) {
    return { id: b.id, name: (b.name ?? "").trim() || "—" };
  }
  return null;
}

/** Workers and labor_workers share a UUID; display names never establish financial ownership. */
export async function workerIdsForLaborBalanceFinancialQueries(
  c: SupabaseClient,
  laborWorkerId: string
): Promise<string[]> {
  const id = laborWorkerId.trim();
  if (!id) return [];
  const worker = await c.from("workers").select("id").eq("id", id).maybeSingle();
  if (worker.error) financialDataUnavailable("workers", worker.error);
  return [id];
}
