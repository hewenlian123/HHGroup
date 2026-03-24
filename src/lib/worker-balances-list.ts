import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkersFkToLaborIdResolver,
  isLaborUnpaidForWorkerPayroll,
} from "@/lib/labor-balance-shared";
import postgres from "postgres";

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
 * Balance = Labor Owed + Reimbursements - Payments - DeductedAdvances.
 * Worker list comes from labor_workers; payments/advances aggregate by worker_id (same ids as labor_workers when synced).
 */
export async function fetchWorkerBalances(c: SupabaseClient): Promise<WorkerBalanceRow[]> {
  const workersRes = await c.from("labor_workers").select("id, name").order("name");
  const rawWorkers = (workersRes.data ?? []) as { id: string; name: string | null }[];
  /** Defensive: same id should not appear twice; dedupe keeps UI/API stable. */
  const seenIds = new Set<string>();
  const workers = rawWorkers.filter((w) => {
    const id = w.id;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  const laborOwedByWorker = new Map<string, number>();
  let laborEntryCountByWorker = new Map<string, number>();
  const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (dbUrl) {
    const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
    try {
      const rows = await sql<
        {
          worker_id: string;
          name: string | null;
          labor_owed: string | number | null;
        }[]
      >`
        select
          lw.id as worker_id,
          lw.name,
          coalesce(sum(le.cost_amount), 0) as labor_owed
        from labor_workers lw
        left join labor_entries le
          on le.worker_id = lw.id
         and le.worker_payment_id is null
        group by lw.id, lw.name
      `;
      for (const r of rows) {
        const wid = r.worker_id;
        if (!wid) continue;
        const amt = Number(r.labor_owed) || 0;
        laborOwedByWorker.set(wid, amt);
      }
    } finally {
      await sql.end();
    }
    const { data: allLaborIds } = await c.from("labor_entries").select("worker_id");
    for (const r of (allLaborIds ?? []) as { worker_id?: string | null }[]) {
      const wid = r.worker_id;
      if (!wid) continue;
      laborEntryCountByWorker.set(wid, (laborEntryCountByWorker.get(wid) ?? 0) + 1);
    }
  } else {
    let laborRows: {
      worker_id: string;
      cost_amount?: number | null;
      status?: string | null;
      worker_payment_id?: string | null;
    }[] = [];
    let laborSettlementMode: "payment_link" | "status_fallback" = "payment_link";
    const laborRes = await c
      .from("labor_entries")
      .select("worker_id, cost_amount, status, worker_payment_id");
    if (laborRes.error && /column.*status|schema cache/i.test(laborRes.error.message ?? "")) {
      const fallback = await c
        .from("labor_entries")
        .select("worker_id, cost_amount, worker_payment_id");
      laborRows = (
        (fallback.data ?? []) as {
          worker_id: string;
          cost_amount?: number | null;
          worker_payment_id?: string | null;
        }[]
      ).map((r) => ({
        ...r,
        status: null,
      }));
      laborSettlementMode = "payment_link";
    } else if (
      laborRes.error &&
      /column.*worker_payment_id|schema cache/i.test(laborRes.error.message ?? "")
    ) {
      const fallback = await c.from("labor_entries").select("worker_id, cost_amount, status");
      laborRows = (fallback.data ?? []) as {
        worker_id: string;
        cost_amount?: number | null;
        status?: string | null;
        worker_payment_id?: string | null;
      }[];
      laborRows = laborRows.map((r) => ({ ...r, worker_payment_id: null }));
      laborSettlementMode = "status_fallback";
    } else {
      laborRows = (laborRes.data ?? []) as {
        worker_id: string;
        cost_amount?: number | null;
        status?: string | null;
        worker_payment_id?: string | null;
      }[];
      laborSettlementMode = "payment_link";
    }

    for (const r of laborRows) {
      const wid = r.worker_id;
      if (!wid) continue;
      laborEntryCountByWorker.set(wid, (laborEntryCountByWorker.get(wid) ?? 0) + 1);
      if (!isLaborUnpaidForWorkerPayroll(r.status, r.worker_payment_id, laborSettlementMode))
        continue;
      const amt = Number(r.cost_amount) || 0;
      laborOwedByWorker.set(wid, (laborOwedByWorker.get(wid) ?? 0) + amt);
    }
  }

  const reimbRes = await c.from("worker_reimbursements").select("worker_id, amount, status");
  let paymentRows: { worker_id: string; amount?: number | null }[] = [];
  const paymentsRes = await c.from("worker_payments").select("worker_id, total_amount");
  if (
    paymentsRes.error &&
    /column.*total_amount|schema cache/i.test(paymentsRes.error.message ?? "")
  ) {
    const payFallback = await c.from("worker_payments").select("worker_id, amount");
    paymentRows = (payFallback.data ?? []) as { worker_id: string; amount?: number | null }[];
  } else {
    paymentRows = (
      (paymentsRes.data ?? []) as { worker_id: string; total_amount?: number | null }[]
    ).map((r) => ({
      worker_id: r.worker_id,
      amount: r.total_amount ?? null,
    }));
  }

  const reimbRows = (reimbRes.data ?? []) as {
    worker_id: string;
    amount?: number | null;
    status?: string | null;
  }[];

  const advancesRes = await c.from("worker_advances").select("worker_id, amount, status");
  const advancesRows = (advancesRes.data ?? []) as {
    worker_id: string;
    amount?: number | null;
    status?: string | null;
  }[];

  const rawFinancialIds = new Set<string>();
  for (const r of reimbRows) {
    if (r.worker_id) rawFinancialIds.add(r.worker_id);
  }
  for (const r of paymentRows) {
    if (r.worker_id) rawFinancialIds.add(r.worker_id);
  }
  for (const r of advancesRows) {
    if (r.worker_id) rawFinancialIds.add(r.worker_id);
  }
  const toLaborWorkerId = await createWorkersFkToLaborIdResolver(c, workers, rawFinancialIds);

  const reimbByWorker = new Map<string, number>();
  for (const r of reimbRows) {
    const wid = toLaborWorkerId(r.worker_id);
    if (!wid) continue;
    const status = (r.status ?? "").toLowerCase();
    if (status === "paid") continue;
    const amt = Number(r.amount) || 0;
    reimbByWorker.set(wid, (reimbByWorker.get(wid) ?? 0) + amt);
  }

  const paymentsByWorker = new Map<string, number>();
  const paymentRowCountByWorker = new Map<string, number>();
  for (const r of paymentRows) {
    const wid = toLaborWorkerId(r.worker_id);
    if (!wid) continue;
    paymentRowCountByWorker.set(wid, (paymentRowCountByWorker.get(wid) ?? 0) + 1);
    const amt = Number(r.amount) || 0;
    paymentsByWorker.set(wid, (paymentsByWorker.get(wid) ?? 0) + amt);
  }

  const advancesByWorker = new Map<string, number>();
  for (const r of advancesRows) {
    const wid = toLaborWorkerId(r.worker_id);
    if (!wid) continue;
    const status = String(r.status ?? "")
      .trim()
      .toLowerCase();
    /** Pending = recorded only; deducted = applied on payroll — counts toward Advances column and balance. */
    if (status !== "deducted") continue;
    const amt = Number(r.amount) || 0;
    advancesByWorker.set(wid, (advancesByWorker.get(wid) ?? 0) + amt);
  }

  return workers.map((w) => {
    const laborOwed = laborOwedByWorker.get(w.id) ?? 0;
    const reimbursements = reimbByWorker.get(w.id) ?? 0;
    const payments = paymentsByWorker.get(w.id) ?? 0;
    const advances = advancesByWorker.get(w.id) ?? 0;
    const balance = laborOwed + reimbursements - payments - advances;
    const laborRows = laborEntryCountByWorker.get(w.id) ?? 0;
    const payRows = paymentRowCountByWorker.get(w.id) ?? 0;
    const deletable =
      Math.abs(balance) < BAL_EPS &&
      laborRows === 0 &&
      payRows === 0 &&
      Math.abs(laborOwed) < BAL_EPS &&
      Math.abs(reimbursements) < BAL_EPS &&
      Math.abs(payments) < BAL_EPS &&
      Math.abs(advances) < BAL_EPS;
    return {
      workerId: w.id,
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
