/**
 * Resolve which unpaid labor + reimbursement rows an "implicit" worker payment settles
 * (no explicit labor_entry_ids / reimbursement_ids in the request body).
 *
 * Rules:
 * - Payment amount must match a valid combination of whole unpaid lines (no partial line).
 * - Fast path: amount equals full outstanding for scope → all unpaid lines.
 * - Otherwise: subset-sum (0/1 knapsack) in cents, bounded for performance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isLaborUnpaidForWorkerPayroll,
  type LaborPayrollSettlementMode,
} from "@/lib/labor-balance-shared";

const AMOUNT_EPS = 0.02;

/** Max DP table size (n * targetCents) — avoid multi-second runs on huge amounts. */
const MAX_DP_CELLS = 8_000_000;

export type ImplicitSettlement = {
  laborIds: string[];
  reimbIds: string[];
  expectedTotal: number;
};

type PayItem = { kind: "labor" | "reimb"; id: string; cents: number };

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Load unpaid labor_entries + pending worker_reimbursements for worker, optionally scoped by project.
 */
async function loadUnpaidPayItems(
  admin: SupabaseClient,
  workerId: string,
  projectId: string | null
): Promise<PayItem[]> {
  const items: PayItem[] = [];

  let laborSettlementMode: LaborPayrollSettlementMode = "payment_link";
  let laborQ: {
    data: unknown;
    error: { message?: string } | null;
  } = await admin
    .from("labor_entries")
    .select("id, worker_id, cost_amount, status, worker_payment_id, project_id")
    .eq("worker_id", workerId);
  if (laborQ.error && /column|schema cache|worker_payment_id/i.test(laborQ.error.message ?? "")) {
    laborSettlementMode = "status_fallback";
    laborQ = await admin
      .from("labor_entries")
      .select("id, worker_id, cost_amount, status, project_id")
      .eq("worker_id", workerId);
  }
  if (laborQ.error) throw new Error(laborQ.error.message ?? "Failed to load labor entries.");

  const laborRaw = (laborQ.data ?? []) as {
    id: string;
    cost_amount?: number | null;
    status?: string | null;
    worker_payment_id?: string | null;
    project_id?: string | null;
  }[];

  for (const r of laborRaw) {
    if (projectId && (r.project_id ?? null) !== projectId) continue;
    if (!isLaborUnpaidForWorkerPayroll(r.status, r.worker_payment_id, laborSettlementMode)) continue;
    const cents = toCents(Number(r.cost_amount) || 0);
    if (cents <= 0) continue;
    items.push({ kind: "labor", id: r.id, cents });
  }

  const { data: reimbData, error: reErr } = await admin
    .from("worker_reimbursements")
    .select("id, worker_id, amount, status, project_id")
    .eq("worker_id", workerId);
  if (reErr) throw new Error(reErr.message ?? "Failed to load reimbursements.");

  for (const r of (reimbData ?? []) as {
    id: string;
    amount?: number | null;
    status?: string | null;
    project_id?: string | null;
  }[]) {
    if (String(r.status ?? "").toLowerCase() === "paid") continue;
    if (projectId && (r.project_id ?? null) !== projectId) continue;
    const cents = toCents(Number(r.amount) || 0);
    if (cents <= 0) continue;
    items.push({ kind: "reimb", id: r.id, cents });
  }

  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "labor" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return items;
}

/** 0/1 subset-sum: whether target cents is achievable. */
function canMakeSum(items: PayItem[], targetCents: number): boolean {
  if (targetCents < 0) return false;
  if (targetCents === 0) return true;
  const n = items.length;
  if (n === 0) return false;

  if (n * targetCents > MAX_DP_CELLS) {
    const memo = new Map<string, boolean>();
    const dfs = (i: number, rem: number): boolean => {
      if (rem === 0) return true;
      if (rem < 0 || i >= n) return false;
      const k = `${i}:${rem}`;
      if (memo.has(k)) return memo.get(k)!;
      const r = dfs(i + 1, rem) || dfs(i + 1, rem - items[i].cents);
      memo.set(k, r);
      return r;
    };
    return dfs(0, targetCents);
  }

  const dp = new Array<boolean>(targetCents + 1).fill(false);
  dp[0] = true;
  for (const it of items) {
    const c = it.cents;
    for (let s = targetCents; s >= c; s--) {
      if (dp[s - c]) dp[s] = true;
    }
  }
  return dp[targetCents] ?? false;
}

/** Reconstruct one valid subset using shared memo with canMakeSum. */
function buildSubset(items: PayItem[], targetCents: number): PayItem[] | null {
  const n = items.length;
  const memo = new Map<string, boolean>();
  const can = (i: number, rem: number): boolean => {
    if (rem === 0) return true;
    if (rem < 0 || i >= n) return false;
    const k = `${i}:${rem}`;
    if (memo.has(k)) return memo.get(k)!;
    const r = can(i + 1, rem) || can(i + 1, rem - items[i].cents);
    memo.set(k, r);
    return r;
  };
  if (!can(0, targetCents)) return null;

  const build = (i: number, rem: number): PayItem[] | null => {
    if (rem === 0) return [];
    if (i >= n || rem < 0) return null;
    if (can(i + 1, rem)) {
      const skip = build(i + 1, rem);
      if (skip !== null) return skip;
    }
    if (rem >= items[i].cents && can(i + 1, rem - items[i].cents)) {
      const take = build(i + 1, rem - items[i].cents);
      if (take !== null) return [items[i], ...take];
    }
    return null;
  };
  return build(0, targetCents);
}

/**
 * Compute labor + reimb ids for an implicit payment, or throw Error with user-facing message.
 */
export async function computeImplicitSettlement(
  admin: SupabaseClient,
  workerId: string,
  amount: number,
  projectId: string | null
): Promise<ImplicitSettlement> {
  const items = await loadUnpaidPayItems(admin, workerId, projectId);
  const sumCents = items.reduce((s, x) => s + x.cents, 0);
  const expectedTotal = fromCents(sumCents);
  const targetCents = toCents(amount);

  if (items.length === 0) {
    throw new Error("No unpaid labor or reimbursements in this scope to settle.");
  }

  if (Math.abs(amount - expectedTotal) <= AMOUNT_EPS) {
    const laborIds = items.filter((x) => x.kind === "labor").map((x) => x.id);
    const reimbIds = items.filter((x) => x.kind === "reimb").map((x) => x.id);
    return { laborIds, reimbIds, expectedTotal };
  }

  if (!canMakeSum(items, targetCents)) {
    throw new Error(
      `Payment amount must match unpaid labor and reimbursements in this scope (outstanding total ${expectedTotal.toFixed(
        2
      )}). No combination of lines sums to ${amount.toFixed(2)} — adjust the amount or pay with explicit line selection.`
    );
  }

  const subset = buildSubset(items, targetCents);
  if (!subset) {
    throw new Error(
      "Could not resolve which labor/reimbursement lines this payment covers. Try again or use explicit line selection."
    );
  }

  const laborIds = subset.filter((x) => x.kind === "labor").map((x) => x.id);
  const reimbIds = subset.filter((x) => x.kind === "reimb").map((x) => x.id);
  const got = fromCents(subset.reduce((s, x) => s + x.cents, 0));
  if (Math.abs(got - amount) > AMOUNT_EPS) {
    throw new Error("Internal settlement mismatch; please retry.");
  }

  return { laborIds, reimbIds, expectedTotal: got };
}
