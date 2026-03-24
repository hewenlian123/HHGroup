import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkersFkToLaborIdResolver,
  isLaborUnpaidForWorkerPayroll,
  workerIdsForLaborBalanceFinancialQueries,
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
  const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  // Robust per-worker aggregation (matches detail page behavior and avoids cross-table id drift issues).
  return Promise.all(
    workers.map(async (w) => {
      const workerId = w.id;
      const workerKey = normalizeWorkerId(workerId);

      const ids = await workerIdsForLaborBalanceFinancialQueries(c, workerId).catch(() => [
        workerId,
      ]);
      const queryByIds = async (table: string, cols: string) => {
        const base = (c.from(table) as any).select(cols);
        try {
          if (ids.length <= 1) {
            return typeof base.eq === "function"
              ? await base.eq("worker_id", ids[0] ?? workerId)
              : await base;
          }
          return typeof base.in === "function" ? await base.in("worker_id", ids) : await base;
        } catch {
          return await base;
        }
      };

      function isMissingColumn(err: { message?: string } | null): boolean {
        return /column .* does not exist|could not find the .* column|schema cache/i.test(
          err?.message ?? ""
        );
      }
      type LaborRaw = {
        worker_id?: string | null;
        cost_amount?: number | null;
        total?: number | null;
        status?: string | null;
        worker_payment_id?: string | null;
      };
      let laborRows: LaborRaw[] = [];
      let laborSettlementMode: "payment_link" | "status_fallback" = "payment_link";

      for (const cols of [
        "worker_id, cost_amount, total, status, worker_payment_id",
        "worker_id, cost_amount, status, worker_payment_id",
        "worker_id, total, status, worker_payment_id",
        "worker_id, cost_amount, total, status",
        "worker_id, cost_amount, status",
        "worker_id, total, status",
        "worker_id, cost_amount, total",
      ]) {
        const base = (c.from("labor_entries") as any).select(cols);
        const res = (await (typeof base.eq === "function"
          ? base.eq("worker_id", workerId)
          : base)) as { data: unknown[] | null; error: { message?: string } | null };
        if (!res.error || !isMissingColumn(res.error)) {
          laborRows = (res.data ?? []) as LaborRaw[];
          laborSettlementMode = /\bworker_payment_id\b/.test(cols)
            ? "payment_link"
            : "status_fallback";
          break;
        }
      }

      const laborOwed = laborRows.reduce((s, r) => {
        if (!isLaborUnpaidForWorkerPayroll(r.status, r.worker_payment_id, laborSettlementMode))
          return s;
        return s + (Number(r.cost_amount ?? r.total) || 0);
      }, 0);

      const reimbRes = await queryByIds("worker_reimbursements", "worker_id, amount, status");
      const reimbRows = (reimbRes.data ?? []) as Array<{
        worker_id?: string | null;
        amount?: number | null;
        status?: string | null;
      }>;
      const reimbursements = reimbRows.reduce((s, r) => {
        if (
          String(r.status ?? "")
            .trim()
            .toLowerCase() === "paid"
        )
          return s;
        return s + (Number(r.amount) || 0);
      }, 0);

      let payRows: Array<{ total_amount?: number | null; amount?: number | null }> = [];
      const payRes = await queryByIds("worker_payments", "worker_id, total_amount");
      if (!payRes.error) {
        payRows = (payRes.data ?? []) as Array<{ total_amount?: number | null }>;
      } else {
        const payFb = await queryByIds("worker_payments", "worker_id, amount");
        payRows = (payFb.data ?? []) as Array<{ amount?: number | null }>;
      }
      const payments = payRows.reduce((s, r) => s + (Number(r.total_amount ?? r.amount) || 0), 0);

      let advances = 0;
      if (dbUrl && ids.length > 0) {
        const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
        try {
          const rows = await sql<{ advances: string | number | null }[]>`
            select coalesce(sum(amount), 0) as advances
            from worker_advances
            where lower(trim(status)) = 'deducted'
              and worker_id in ${sql(ids)}
          `;
          advances = Number(rows[0]?.advances ?? 0) || 0;
        } finally {
          await sql.end();
        }
      } else {
        const advRes = await queryByIds("worker_advances", "worker_id, amount, status");
        const advRows = (advRes.data ?? []) as Array<{
          worker_id?: string | null;
          amount?: number | null;
          status?: string | null;
        }>;
        advances = advRows.reduce((s, r) => {
          if (
            String(r.status ?? "")
              .trim()
              .toLowerCase() !== "deducted"
          )
            return s;
          return s + (Number(r.amount) || 0);
        }, 0);
      }

      const balance = laborOwed + reimbursements - payments - advances;
      const payRowsCount = payRows.length;
      const deletable =
        Math.abs(balance) < BAL_EPS &&
        laborRows.length === 0 &&
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
    })
  );
}
