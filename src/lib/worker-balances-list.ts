import type { SupabaseClient } from "@supabase/supabase-js";
import { omitE2ESeedWorkerFromBalanceWorkers } from "@/lib/e2e-seed-worker";
import { financialDataUnavailable } from "@/lib/financial-availability";
import {
  isLaborUnpaidForWorkerPayroll,
  isWorkerAdvanceOpenForBalance,
  laborEntryPaymentIdMapFromWorkerPayments,
  normWorkerBalanceName,
  workerOutstandingBalanceFromUnsettledItems,
} from "@/lib/labor-balance-shared";

export type WorkerBalanceRow = {
  workerId: string;
  workerName: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  advances: number;
  balance: number;
  /** True when balance is ~0, no labor_entries, and no worker_payments (safe to remove from balances UI). */
  deletable: boolean;
};

const BAL_EPS = 0.005;

/** Normalize UUID / id strings for comparisons (Supabase may return mixed casing). */
function normalizeWorkerId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Find a balance row for delete / detail flows. Uses case-insensitive workerId match
 * so UI rows always line up with DELETE /api/labor/worker-balances/:id.
 */
export async function fetchWorkerBalanceRowForDelete(
  c: SupabaseClient,
  workerIdRaw: string
): Promise<WorkerBalanceRow | null> {
  const needle = workerIdRaw.trim();
  if (!needle) return null;
  const key = normalizeWorkerId(needle);
  const all = await fetchWorkerBalances(c);
  return all.find((r) => normalizeWorkerId(r.workerId) === key) ?? null;
}

/**
 * Worker balances summary (same rules as GET /api/labor/worker-balances).
 * Labor Owed = unpaid payroll per `isLaborUnpaidForWorkerPayroll` / worker_payment_id NULL in SQL path.
 * Balance = unpaid Labor Owed + pending Reimbursements - open Advances.
 * Worker payments remain visible as a ledger, but linked paid items are already removed
 * from the unpaid totals and unlinked legacy payments cannot prove which rows they settled.
 * Worker list comes from labor_workers; payments/advances aggregate by worker_id (same ids as labor_workers when synced).
 * Also unions worker_id from labor_entries, worker_reimbursements, worker_payments, worker_advances so orphans still appear.
 * Names are resolved via labor_workers first, then the batched `workers` name map.
 * In production builds, the fixed E2E seed UUID is omitted from this list (`omitE2ESeedWorkerFromBalanceWorkers`).
 */
export async function fetchWorkerBalances(c: SupabaseClient): Promise<WorkerBalanceRow[]> {
  type WorkerRaw = { id: string; name: string | null };
  type LaborRaw = {
    id?: string | null;
    worker_id?: string | null;
    amount_snapshot?: number | null;
    labor_cost_snapshot?: number | null;
    cost_amount?: number | null;
    status?: string | null;
    worker_payment_id?: string | null;
  };
  type PaymentRaw = {
    id?: string | null;
    worker_id?: string | null;
    total_amount?: number | null;
    labor_entry_ids?: unknown;
  };
  type ReimbursementRaw = {
    worker_id?: string | null;
    amount?: number | null;
    status?: string | null;
  };
  type AdvanceRaw = {
    worker_id?: string | null;
    amount?: number | null;
    status?: string | null;
  };

  const [workersRes, laborRes, reimbRes, paymentRes, advanceRes, workersNameRes] =
    await Promise.all([
      c.from("labor_workers").select("id, name", { count: "exact" }).order("name"),
      c
        .from("labor_entries")
        .select(
          "id, worker_id, labor_cost_snapshot, amount_snapshot, cost_amount, status, worker_payment_id",
          { count: "exact" }
        ),
      c
        .from("worker_reimbursements")
        .select("worker_id, amount, status", { count: "exact" }),
      c
        .from("worker_payments")
        .select("id, worker_id, total_amount, labor_entry_ids", { count: "exact" }),
      c.from("worker_advances").select("worker_id, amount, status", { count: "exact" }),
      c.from("workers").select("id, name", { count: "exact" }),
    ]);

  const rowsOrFail = <T>(
    source: string,
    result: { data: T[] | null; error: unknown; count?: number | null }
  ): T[] => {
    if (result.error) financialDataUnavailable(source, result.error);
    if (!Array.isArray(result.data)) financialDataUnavailable(source, null);
    const rows = result.data;
    if (typeof result.count === "number" && result.count > rows.length) {
      financialDataUnavailable(
        source,
        new Error(`Protected result was truncated (${rows.length} of ${result.count} rows).`)
      );
    }
    return rows;
  };

  const rawLaborWorkers = rowsOrFail<WorkerRaw>(
    "labor_workers (worker balances)",
    workersRes as { data: WorkerRaw[] | null; error: unknown; count?: number | null }
  );
  const laborRows = rowsOrFail<LaborRaw>(
    "labor_entries (worker balances)",
    laborRes as { data: LaborRaw[] | null; error: unknown; count?: number | null }
  );
  const reimbursementRows = rowsOrFail<ReimbursementRaw>(
    "worker_reimbursements (worker balances)",
    reimbRes as { data: ReimbursementRaw[] | null; error: unknown; count?: number | null }
  );
  const paymentRows = rowsOrFail<PaymentRaw>(
    "worker_payments (worker balances)",
    paymentRes as { data: PaymentRaw[] | null; error: unknown; count?: number | null }
  );
  const advanceRows = rowsOrFail<AdvanceRaw>(
    "worker_advances (worker balances)",
    advanceRes as { data: AdvanceRaw[] | null; error: unknown; count?: number | null }
  );
  const workerNameRows = rowsOrFail<WorkerRaw>(
    "workers (worker balances)",
    workersNameRes as { data: WorkerRaw[] | null; error: unknown; count?: number | null }
  );

  const workersById = new Map<string, WorkerRaw>();
  for (const w of rawLaborWorkers) {
    const id = String(w.id ?? "").trim();
    if (!id) continue;
    if (!workersById.has(id)) workersById.set(id, { id, name: w.name ?? null });
  }

  const workersNameById = new Map<string, string | null>();
  for (const w of workerNameRows) {
    const id = String(w.id ?? "").trim();
    if (!id) continue;
    workersNameById.set(id, w.name ?? null);
  }

  for (const rows of [laborRows, reimbursementRows, paymentRows, advanceRows]) {
    for (const r of rows) {
      const id = String(r.worker_id ?? "").trim();
      if (!id || workersById.has(id)) continue;
      workersById.set(id, { id, name: workersNameById.get(id) ?? null });
    }
  }

  const laborWorkersById = new Map(rawLaborWorkers.map((worker) => [worker.id, worker]));
  const financialWorkerIdsFor = (workerId: string): string[] => {
    const ids = new Set([workerId]);
    const rawName = laborWorkersById.get(workerId)?.name ?? workersNameById.get(workerId);
    const name = String(rawName ?? "").trim();
    if (!name) return [...ids];

    for (const worker of workerNameRows) {
      const candidateName = String(worker.name ?? "").trim();
      if (
        candidateName === name ||
        candidateName.toLocaleLowerCase() === name.toLocaleLowerCase()
      ) {
        ids.add(String(worker.id));
      }
    }

    const hasSiblingId = [...ids].some((id) => id !== workerId);
    if (!hasSiblingId) {
      const lowerName = name.toLocaleLowerCase();
      const normalizedName = normWorkerBalanceName(name);
      for (const worker of workerNameRows) {
        const candidateName = String(worker.name ?? "");
        if (
          candidateName.toLocaleLowerCase().includes(lowerName) &&
          normWorkerBalanceName(candidateName) === normalizedName
        ) {
          ids.add(String(worker.id));
        }
      }
    }
    return [...ids];
  };

  const groupByWorkerId = <T extends { worker_id?: string | null }>(rows: T[]) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const workerId = String(row.worker_id ?? "").trim();
      if (!workerId) continue;
      const group = grouped.get(workerId) ?? [];
      group.push(row);
      grouped.set(workerId, group);
    }
    return grouped;
  };

  const laborByWorkerId = groupByWorkerId(laborRows);
  const reimbursementsByWorkerId = groupByWorkerId(reimbursementRows);
  const paymentsByWorkerId = groupByWorkerId(paymentRows);
  const advancesByWorkerId = groupByWorkerId(advanceRows);
  const rowsForWorkerIds = <T>(grouped: Map<string, T[]>, ids: string[]): T[] =>
    ids.flatMap((id) => grouped.get(id) ?? []);

  const workers = omitE2ESeedWorkerFromBalanceWorkers(
    [...workersById.values()].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
    )
  );

  return workers.map((w) => {
    const workerId = w.id;
    const workerKey = normalizeWorkerId(workerId);
    const ids = financialWorkerIdsFor(workerId);
    const workerLaborRows = laborByWorkerId.get(workerId) ?? [];
    const payRows = rowsForWorkerIds(paymentsByWorkerId, ids);
    const paymentIdByLaborEntryId = laborEntryPaymentIdMapFromWorkerPayments(payRows);
    const effectiveWorkerPaymentIdForLabor = (r: LaborRaw) =>
      String(r.worker_payment_id ?? "").trim() ||
      (r.id ? paymentIdByLaborEntryId.get(String(r.id)) : undefined) ||
      null;

    const laborOwed = workerLaborRows.reduce((s, r) => {
      if (
        !isLaborUnpaidForWorkerPayroll(
          r.status,
          effectiveWorkerPaymentIdForLabor(r),
          "payment_link"
        )
      )
        return s;
      return s + (Number(r.labor_cost_snapshot ?? r.amount_snapshot ?? r.cost_amount) || 0);
    }, 0);

    const reimbRows = rowsForWorkerIds(reimbursementsByWorkerId, ids);
    const reimbursements = reimbRows.reduce((s, r) => {
      if (
        String(r.status ?? "")
          .trim()
          .toLowerCase() === "paid"
      )
        return s;
      return s + (Number(r.amount) || 0);
    }, 0);

    const payments = payRows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

    const advRows = rowsForWorkerIds(advancesByWorkerId, ids);
    const advances = advRows.reduce((s, r) => {
      if (!isWorkerAdvanceOpenForBalance(r.status)) return s;
      return s + (Number(r.amount) || 0);
    }, 0);

    const balance = workerOutstandingBalanceFromUnsettledItems({
      laborOwed,
      reimbursements,
      advances,
    });
    const payRowsCount = payRows.length;
    const deletable =
      Math.abs(balance) < BAL_EPS &&
      workerLaborRows.length === 0 &&
      payRowsCount === 0 &&
      Math.abs(laborOwed) < BAL_EPS &&
      Math.abs(reimbursements) < BAL_EPS &&
      Math.abs(payments) < BAL_EPS &&
      Math.abs(advances) < BAL_EPS;

    return {
      workerId: workerKey,
      workerName: (w.name ?? "").trim() || "—",
      laborOwed,
      reimbursements,
      payments,
      advances,
      balance,
      deletable,
    };
  });
}
