import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FinancialDataUnavailableError } from "@/lib/financial-availability";
import { fetchWorkerBalances } from "@/lib/worker-balances-list";

const BALANCE_TABLES = [
  "labor_workers",
  "labor_entries",
  "worker_reimbursements",
  "worker_payments",
  "worker_advances",
  "workers",
] as const;

type BalanceTable = (typeof BALANCE_TABLES)[number];
type TestRow = Record<string, unknown>;

function workerId(index: number): string {
  return `worker-${String(index).padStart(3, "0")}`;
}

function populatedTables(workerCount: number): Record<BalanceTable, TestRow[]> {
  const workers = Array.from({ length: workerCount }, (_, index) => ({
    id: workerId(index),
    name: `Worker ${String(index).padStart(3, "0")}`,
  }));
  return {
    labor_workers: workers,
    workers,
    labor_entries: workers.map((worker, index) => ({
      id: `labor-${index}`,
      worker_id: worker.id,
      labor_cost_snapshot: 100,
      amount_snapshot: 100,
      cost_amount: 100,
      status: "Approved",
      worker_payment_id: null,
    })),
    worker_reimbursements: workers.map((worker) => ({
      worker_id: worker.id,
      amount: 20,
      status: "pending",
    })),
    worker_payments: workers.map((worker, index) => ({
      id: `payment-${index}`,
      worker_id: worker.id,
      total_amount: 50,
      labor_entry_ids: [],
    })),
    worker_advances: workers.map((worker) => ({
      worker_id: worker.id,
      amount: 30,
      status: "pending",
    })),
  };
}

function createReadClient(
  tables: Record<BalanceTable, TestRow[]>,
  failureTable?: BalanceTable,
  reportedCounts: Partial<Record<BalanceTable, number>> = {},
  nullDataTable?: BalanceTable
): { client: SupabaseClient; reads: Map<string, number> } {
  const reads = new Map<string, number>();

  const client = {
    from(table: BalanceTable) {
      return {
        select(_columns?: string, options?: { count?: string }) {
          const filters: Array<(row: TestRow) => boolean> = [];
          let maybeSingle = false;
          const execute = async () => {
            reads.set(table, (reads.get(table) ?? 0) + 1);
            if (table === failureTable) {
              return {
                data: null,
                error: { code: "42501", message: `permission denied for table ${table}` },
              };
            }
            if (table === nullDataTable) {
              return { data: null, error: null, count: null };
            }
            const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
            return {
              data: maybeSingle ? (rows[0] ?? null) : rows,
              error: null,
              count: options?.count === "exact" ? (reportedCounts[table] ?? rows.length) : null,
            };
          };
          const query = {
            order() {
              return query;
            },
            eq(column: string, value: unknown) {
              filters.push((row) => row[column] === value);
              return query;
            },
            in(column: string, values: unknown[]) {
              const accepted = new Set(values);
              filters.push((row) => accepted.has(row[column]));
              return query;
            },
            ilike(column: string, pattern: string) {
              const needle = pattern.replaceAll("%", "").toLocaleLowerCase();
              filters.push((row) => {
                const value = String(row[column] ?? "").toLocaleLowerCase();
                return pattern.includes("%") ? value.includes(needle) : value === needle;
              });
              return query;
            },
            maybeSingle() {
              maybeSingle = true;
              return execute();
            },
            then<TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              return execute().then(onfulfilled, onrejected);
            },
          };
          return query;
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, reads };
}

describe("fetchWorkerBalances batched reads", () => {
  it.each([1, 12, 50])(
    "reads each balance source exactly once for %i workers",
    async (workerCount) => {
      const { client, reads } = createReadClient(populatedTables(workerCount));

      const balances = await fetchWorkerBalances(client);

      expect(balances).toHaveLength(workerCount);
      expect(balances[0]).toEqual({
        workerId: "worker-000",
        workerName: "Worker 000",
        laborOwed: 100,
        reimbursements: 20,
        payments: 50,
        advances: 30,
        balance: 90,
        deletable: false,
      });
      expect(Object.fromEntries(reads)).toEqual({
        labor_workers: 1,
        labor_entries: 1,
        worker_reimbursements: 1,
        worker_payments: 1,
        worker_advances: 1,
        workers: 1,
      });
    }
  );

  it.each(BALANCE_TABLES)("fails closed when %s cannot be read", async (failureTable) => {
    const { client } = createReadClient(populatedTables(1), failureTable);

    await expect(fetchWorkerBalances(client)).rejects.toBeInstanceOf(FinancialDataUnavailableError);
  });

  it.each(BALANCE_TABLES)("fails closed when %s returns null data", async (nullDataTable) => {
    const { client } = createReadClient(populatedTables(1), undefined, {}, nullDataTable);

    await expect(fetchWorkerBalances(client)).rejects.toBeInstanceOf(FinancialDataUnavailableError);
  });

  it("keeps successful empty financial sources as a legitimate zero balance", async () => {
    const tables = populatedTables(1);
    tables.labor_entries = [];
    tables.worker_reimbursements = [];
    tables.worker_payments = [];
    tables.worker_advances = [];
    const { client } = createReadClient(tables);

    await expect(fetchWorkerBalances(client)).resolves.toEqual([
      {
        workerId: "worker-000",
        workerName: "Worker 000",
        laborOwed: 0,
        reimbursements: 0,
        payments: 0,
        advances: 0,
        balance: 0,
        deletable: true,
      },
    ]);
  });

  it("keeps six successful empty sources as a legitimate empty list", async () => {
    const { client } = createReadClient({
      labor_workers: [],
      labor_entries: [],
      worker_reimbursements: [],
      worker_payments: [],
      worker_advances: [],
      workers: [],
    });

    await expect(fetchWorkerBalances(client)).resolves.toEqual([]);
  });

  it("fails closed when a protected financial result is truncated", async () => {
    const tables = populatedTables(1);
    const { client } = createReadClient(tables, undefined, { labor_entries: 2 });

    await expect(fetchWorkerBalances(client)).rejects.toBeInstanceOf(FinancialDataUnavailableError);
  });
});
