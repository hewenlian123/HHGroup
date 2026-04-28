import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isLaborUnpaidForWorkerPayroll,
  workerIdsForLaborBalanceFinancialQueries,
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
 * Balance = Labor Owed + Reimbursements - Payments - DeductedAdvances.
 * Worker list comes from labor_workers; payments/advances aggregate by worker_id (same ids as labor_workers when synced).
 */
export async function fetchWorkerBalances(c: SupabaseClient): Promise<WorkerBalanceRow[]> {
  // Canonical source is labor_workers, but some environments still write entries using workers(id).
  // To avoid missing rows in Worker Balances, include any worker_id that appears in labor_entries.
  // Also include any worker_id that appears in financial tables (reimbursements/payments/advances),
  // otherwise balances can show all $0 while money exists for workers not present in labor tables.
  const [
    workersRes,
    entryWorkerIdsRes,
    reimbWorkerIdsRes,
    paymentWorkerIdsRes,
    advanceWorkerIdsRes,
    workersNameRes,
  ] = await Promise.all([
    c.from("labor_workers").select("id, name").order("name"),
    c.from("labor_entries").select("worker_id"),
    c.from("worker_reimbursements").select("worker_id"),
    c.from("worker_payments").select("worker_id"),
    c.from("worker_advances").select("worker_id"),
    c.from("workers").select("id, name"),
  ]);

  const rawLaborWorkers = (workersRes.data ?? []) as { id: string; name: string | null }[];
  const workersById = new Map<string, { id: string; name: string | null }>();
  for (const w of rawLaborWorkers) {
    const id = String(w.id ?? "").trim();
    if (!id) continue;
    if (!workersById.has(id)) workersById.set(id, { id, name: w.name ?? null });
  }

  const workersNameById = new Map<string, string | null>();
  for (const w of (workersNameRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    const id = String(w.id ?? "").trim();
    if (!id) continue;
    workersNameById.set(id, w.name ?? null);
  }

  for (const r of (entryWorkerIdsRes.data ?? []) as Array<{ worker_id?: string | null }>) {
    const id = String(r.worker_id ?? "").trim();
    if (!id || workersById.has(id)) continue;
    workersById.set(id, { id, name: workersNameById.get(id) ?? null });
  }

  for (const src of [reimbWorkerIdsRes, paymentWorkerIdsRes, advanceWorkerIdsRes] as const) {
    for (const r of (src.data ?? []) as Array<{ worker_id?: string | null }>) {
      const id = String(r.worker_id ?? "").trim();
      if (!id || workersById.has(id)) continue;
      workersById.set(id, { id, name: workersNameById.get(id) ?? null });
    }
  }

  // `workers` can be large; a full-table select may be paginated by PostgREST.
  // Backfill any missing names by fetching the specific ids we care about.
  const missingNameIds = [...workersById.values()]
    .filter(
      (w) => w.id && (w.name == null || String(w.name).trim() === "") && !workersNameById.has(w.id)
    )
    .map((w) => w.id);
  if (missingNameIds.length > 0) {
    const { data: nameRows, error } = await c
      .from("workers")
      .select("id, name")
      .in("id", missingNameIds);
    if (!error && nameRows) {
      for (const row of nameRows as Array<{ id: string; name: string | null }>) {
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        workersNameById.set(id, row.name ?? null);
        const cur = workersById.get(id);
        if (cur && (!cur.name || String(cur.name).trim() === "")) {
          workersById.set(id, { id, name: row.name ?? null });
        }
      }
    }
  }

  const workers = [...workersById.values()].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
  );

  // Robust per-worker aggregation (matches detail page behavior and avoids cross-table id drift issues).
  return Promise.all(
    workers.map(async (w) => {
      const workerId = w.id;
      const workerKey = normalizeWorkerId(workerId);

      const ids = await workerIdsForLaborBalanceFinancialQueries(c, workerId).catch(() => [
        workerId,
      ]);

      const hasFunction = (v: unknown, key: string): v is Record<string, unknown> => {
        if (!v || typeof v !== "object") return false;
        const maybe = (v as Record<string, unknown>)[key];
        return typeof maybe === "function";
      };
      const queryByIds = async (table: string, cols: string) => {
        const base = c.from(table).select(cols) as unknown;
        // Test mocks may return a thenable without query helpers (eq/in). Fall back to awaiting the base.
        if (ids.length <= 1) {
          if (hasFunction(base, "eq")) {
            return await (base as { eq: (col: string, val: string) => unknown }).eq(
              "worker_id",
              ids[0] ?? workerId
            );
          }
          return await (base as PromiseLike<unknown>);
        }
        if (hasFunction(base, "in")) {
          return await (base as { in: (col: string, vals: string[]) => unknown }).in(
            "worker_id",
            ids
          );
        }
        // As a safe fallback, try a single eq (best-effort) or just await.
        if (hasFunction(base, "eq")) {
          return await (base as { eq: (col: string, val: string) => unknown }).eq(
            "worker_id",
            workerId
          );
        }
        return await (base as PromiseLike<unknown>);
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
        const base = c.from("labor_entries").select(cols) as unknown;
        const res = (await (hasFunction(base, "eq")
          ? (base as { eq: (col: string, val: string) => unknown }).eq("worker_id", workerId)
          : (base as PromiseLike<unknown>))) as {
          data: unknown[] | null;
          error: { message?: string } | null;
        };
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

      // Reimbursements: prefer `amount`, fallback to `total_amount` (older schemas).
      let reimbRes = await queryByIds("worker_reimbursements", "worker_id, amount, status");
      if (reimbRes.error && isMissingColumn(reimbRes.error)) {
        reimbRes = await queryByIds("worker_reimbursements", "worker_id, total_amount, status");
      }
      const reimbRows = (reimbRes.data ?? []) as Array<{
        worker_id?: string | null;
        amount?: number | null;
        total_amount?: number | null;
        status?: string | null;
      }>;
      const reimbursements = reimbRows.reduce((s, r) => {
        if (
          String(r.status ?? "")
            .trim()
            .toLowerCase() === "paid"
        )
          return s;
        return s + (Number(r.amount ?? r.total_amount) || 0);
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

      // Advances: always use the same Supabase path as detail page to avoid env DB URL drift.
      // Prefer `amount`, fallback to `total_amount` if present in older schemas.
      let advRes = await queryByIds("worker_advances", "worker_id, amount, status");
      if (advRes.error && isMissingColumn(advRes.error)) {
        advRes = await queryByIds("worker_advances", "worker_id, total_amount, status");
      }
      const advRows = (advRes.data ?? []) as Array<{
        worker_id?: string | null;
        amount?: number | null;
        total_amount?: number | null;
        status?: string | null;
      }>;
      const advances = advRows.reduce((s, r) => {
        if (
          String(r.status ?? "")
            .trim()
            .toLowerCase() !== "deducted"
        )
          return s;
        return s + (Number(r.amount ?? r.total_amount) || 0);
      }, 0);

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
