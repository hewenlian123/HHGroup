import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";
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

  it("keeps same-name workers financial rows on their stable IDs", async () => {
    const tables = populatedTables(2);
    for (const worker of tables.workers) worker.name = "Same Name";
    tables.worker_reimbursements[1].amount = 80;
    tables.worker_advances[1].amount = 10;
    const { client } = createReadClient(tables);
    const balances = await fetchWorkerBalances(client);
    expect(
      balances.map(({ workerId, reimbursements, advances, payments, balance }) => ({
        workerId,
        reimbursements,
        advances,
        payments,
        balance,
      }))
    ).toEqual([
      { workerId: "worker-000", reimbursements: 20, advances: 30, payments: 50, balance: 90 },
      { workerId: "worker-001", reimbursements: 80, advances: 10, payments: 50, balance: 170 },
    ]);
  });

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

describe("worker payment project attribution", () => {
  it("retains only the project explicitly recorded in settlement metadata", async () => {
    const client = createClient("http://127.0.0.1:54321", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          const columns = new URL(String(input)).searchParams.get("select") ?? "";
          const rows = ["p1", "p2", null].map((projectId, index) => ({
            id: `payment-${index}`,
            worker_id: "w1",
            total_amount: 30,
            payment_date: "2026-09-01",
            created_at: "2026-09-01",
            labor_entry_ids: [],
            ...(columns.includes("settlement_metadata")
              ? { settlement_metadata: { project_id: projectId } }
              : {}),
          }));
          const query = new URL(String(input)).searchParams;
          const scope = query.get("settlement_metadata->>project_id")?.slice(3);
          const scoped = scope
            ? rows.filter((row) => row.settlement_metadata?.project_id === scope)
            : rows;
          return new Response(JSON.stringify(scoped), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    expect((await getWorkerPaymentsWithClient(client)).map((p) => p.projectId)).toEqual([
      "p1",
      "p2",
      null,
    ]);
    expect(
      (await getWorkerPaymentsWithClient(client, { projectId: "p1" })).map((p) => p.id)
    ).toEqual(["payment-0"]);
  });
  it("does not downgrade a scoped read when settlement metadata is unavailable", async () => {
    let reads = 0;
    const client = createClient("http://127.0.0.1:54321", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          reads++;
          const metadata = new URL(String(input)).searchParams
            .get("select")
            ?.includes("settlement_metadata");
          return new Response(
            JSON.stringify(
              metadata
                ? {
                    code: "42703",
                    message: "column worker_payments.settlement_metadata does not exist",
                  }
                : []
            ),
            { status: metadata ? 400 : 200, headers: { "Content-Type": "application/json" } }
          );
        },
      },
    });
    await expect(getWorkerPaymentsWithClient(client, { projectId: "p1" })).rejects.toThrow(
      /unavailable/i
    );
    expect(reads).toBe(1);
  });

  it("applies project selection before the query limit", async () => {
    const client = createClient("http://127.0.0.1:54321", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          const query = new URL(String(input)).searchParams;
          const rows = ["p2", "p1"].map((id, index) => ({
            id: `payment-${index}`,
            worker_id: "w1",
            total_amount: 30,
            settlement_metadata: { project_id: id },
          }));
          const scope = query.get("settlement_metadata->>project_id")?.slice(3);
          const scoped = scope
            ? rows.filter((row) => row.settlement_metadata.project_id === scope)
            : rows;
          return new Response(JSON.stringify(scoped.slice(0, Number(query.get("limit") || 500))), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    expect(
      (await getWorkerPaymentsWithClient(client, { projectId: "p1", limit: 1 })).map(
        (row) => row.id
      )
    ).toEqual(["payment-1"]);
  });
  it("rejects an unavailable scoped result while preserving a verified empty result", async () => {
    let result: unknown = null;
    const client = createClient("http://127.0.0.1:54321", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } }),
      },
    });
    await expect(getWorkerPaymentsWithClient(client, { projectId: "p1" })).rejects.toThrow(
      /unavailable/i
    );
    result = [];
    await expect(getWorkerPaymentsWithClient(client, { projectId: "p1" })).resolves.toEqual([]);
  });
});
