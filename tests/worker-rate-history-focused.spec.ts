import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyWorkerRateToUnpaidLaborEntriesWithClient,
  changeWorkerDailyRateWithClient,
  getWorkerCurrentDailyRateWithClient,
  previewWorkerRateUnpaidLaborApplyWithClient,
} from "@/lib/worker-rate-history-db";
import { normalizeWorkerRateDate, workerRateLocalYmd } from "@/lib/worker-rate-date";

type Row = Record<string, unknown>;
type TableName = "workers" | "worker_rate_history" | "labor_entries" | "worker_payments";
type MemoryDb = Record<TableName, Row[]>;
type QueryResult = { data: unknown; error: null };

function makeMemoryClient(db: MemoryDb): SupabaseClient {
  let idSeq = 1000;

  class MemoryQuery implements PromiseLike<QueryResult> {
    private operation: "select" | "insert" | "update" = "select";
    private insertPayload: Row | null = null;
    private updatePayload: Row | null = null;
    private filters: Array<(row: Row) => boolean> = [];
    private orFilters: Array<(row: Row) => boolean> = [];
    private orders: Array<{ column: string; ascending: boolean }> = [];
    private limitCount: number | null = null;
    private wantsSelect = false;
    private singleMode: "maybe" | "single" | null = null;

    constructor(private readonly table: TableName) {}

    select(_columns?: string): this {
      this.wantsSelect = true;
      return this;
    }

    insert(payload: Row): this {
      this.operation = "insert";
      this.insertPayload = { ...payload };
      return this;
    }

    update(payload: Row): this {
      this.operation = "update";
      this.updatePayload = { ...payload };
      return this;
    }

    eq(column: string, value: unknown): this {
      this.filters.push((row) => String(row[column] ?? "") === String(value ?? ""));
      return this;
    }

    lt(column: string, value: unknown): this {
      this.filters.push((row) => String(row[column] ?? "") < String(value ?? ""));
      return this;
    }

    lte(column: string, value: unknown): this {
      this.filters.push((row) => String(row[column] ?? "") <= String(value ?? ""));
      return this;
    }

    gt(column: string, value: unknown): this {
      this.filters.push((row) => String(row[column] ?? "") > String(value ?? ""));
      return this;
    }

    gte(column: string, value: unknown): this {
      this.filters.push((row) => String(row[column] ?? "") >= String(value ?? ""));
      return this;
    }

    is(column: string, value: null): this {
      this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
      return this;
    }

    in(column: string, values: unknown[]): this {
      const textValues = new Set(values.map((value) => String(value ?? "")));
      this.filters.push((row) => textValues.has(String(row[column] ?? "")));
      return this;
    }

    or(expression: string): this {
      const match = expression.match(
        /^effective_to\.is\.null,effective_to\.gte\.(\d{4}-\d{2}-\d{2})$/
      );
      if (match) {
        const date = match[1];
        this.orFilters.push((row) => row.effective_to == null || String(row.effective_to) >= date);
      }
      return this;
    }

    order(column: string, options?: { ascending?: boolean }): this {
      this.orders.push({ column, ascending: options?.ascending !== false });
      return this;
    }

    limit(count: number): this {
      this.limitCount = count;
      return this;
    }

    maybeSingle(): Promise<QueryResult> {
      this.singleMode = "maybe";
      return this.execute();
    }

    single(): Promise<QueryResult> {
      this.singleMode = "single";
      return this.execute();
    }

    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return this.execute().then(onfulfilled, onrejected);
    }

    private execute(): Promise<QueryResult> {
      if (this.operation === "insert") return Promise.resolve(this.executeInsert());
      if (this.operation === "update") return Promise.resolve(this.executeUpdate());
      return Promise.resolve(this.resultFor(this.selectRows()));
    }

    private executeInsert(): QueryResult {
      const row = { ...(this.insertPayload ?? {}) };
      row.id = row.id ?? `rate-${String(++idSeq).padStart(4, "0")}`;
      row.created_at = row.created_at ?? `2026-06-04T00:00:${String(idSeq).padStart(2, "0")}.000Z`;
      row.updated_at = row.updated_at ?? row.created_at;
      db[this.table].push(row);
      return this.resultFor([row]);
    }

    private executeUpdate(): QueryResult {
      const rows = this.selectRows();
      for (const row of rows) {
        Object.assign(row, this.updatePayload ?? {}, { updated_at: "2026-06-04T01:00:00.000Z" });
      }
      return this.wantsSelect ? this.resultFor(rows) : { data: null, error: null };
    }

    private selectRows(): Row[] {
      let rows = db[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      if (this.orFilters.length > 0) {
        rows = rows.filter((row) => this.orFilters.every((filter) => filter(row)));
      }
      rows = [...rows].sort((a, b) => {
        for (const order of this.orders) {
          const av = String(a[order.column] ?? "");
          const bv = String(b[order.column] ?? "");
          if (av === bv) continue;
          return (av < bv ? -1 : 1) * (order.ascending ? 1 : -1);
        }
        return 0;
      });
      return this.limitCount == null ? rows : rows.slice(0, this.limitCount);
    }

    private resultFor(rows: Row[]): QueryResult {
      if (this.singleMode) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
  }

  return {
    from(table: string) {
      return new MemoryQuery(table as TableName);
    },
  } as unknown as SupabaseClient;
}

function baseDb(): MemoryDb {
  return {
    workers: [
      {
        id: "worker-1",
        daily_rate: 280,
        half_day_rate: 280,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    worker_rate_history: [
      {
        id: "rate-0001",
        worker_id: "worker-1",
        rate_type: "daily",
        daily_rate: 280,
        effective_from: "2026-03-01",
        effective_to: null,
        notes: "initial",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
    ],
    labor_entries: [
      {
        id: "entry-full",
        worker_id: "worker-1",
        work_date: "2026-04-10",
        hours: 1,
        morning: false,
        afternoon: false,
        days_worked: 1,
        daily_rate_snapshot: 280,
        amount_snapshot: 280,
        labor_cost_snapshot: 280,
        cost_amount: 280,
        status: "approved",
        worker_payment_id: null,
        rate_history_id: "rate-0001",
        notes: "unpaid full day",
      },
      {
        id: "entry-half",
        worker_id: "worker-1",
        work_date: "2026-05-10",
        hours: 0.5,
        morning: true,
        afternoon: false,
        days_worked: 0.5,
        daily_rate_snapshot: 280,
        amount_snapshot: 140,
        labor_cost_snapshot: 140,
        cost_amount: 140,
        status: "approved",
        worker_payment_id: null,
        rate_history_id: "rate-0001",
        notes: "unpaid half day",
      },
      {
        id: "entry-paid",
        worker_id: "worker-1",
        work_date: "2026-04-12",
        hours: 1,
        days_worked: 1,
        daily_rate_snapshot: 280,
        amount_snapshot: 280,
        labor_cost_snapshot: 280,
        cost_amount: 280,
        status: "approved",
        worker_payment_id: "payment-1",
        rate_history_id: "rate-0001",
        notes: "paid full day",
      },
    ],
    worker_payments: [{ id: "payment-1", worker_id: "worker-1", labor_entry_ids: ["entry-paid"] }],
  };
}

test("focused worker rate history regression covers date, preview, apply, and local default date", async () => {
  const db = baseDb();
  const client = makeMemoryClient(db);

  expect(normalizeWorkerRateDate("04/04/2026")).toBe("2026-04-04");
  expect(
    workerRateLocalYmd({
      getFullYear: () => 2026,
      getMonth: () => 3,
      getDate: () => 4,
    })
  ).toBe("2026-04-04");

  const history = await changeWorkerDailyRateWithClient(client, "worker-1", {
    dailyRate: 290,
    effectiveFrom: "04/04/2026",
    notes: "manual regression test",
  });
  expect(history).toMatchObject({
    dailyRate: 290,
    effectiveFrom: "2026-04-04",
    effectiveTo: null,
  });
  expect(db.worker_rate_history.find((row) => row.id === history.id)?.effective_from).toBe(
    "2026-04-04"
  );

  const current = await getWorkerCurrentDailyRateWithClient(client, "worker-1", "2026-06-04");
  expect(current).toMatchObject({
    dailyRate: 290,
    rateHistoryId: history.id,
    effectiveFrom: "2026-04-04",
  });

  const preview = await previewWorkerRateUnpaidLaborApplyWithClient(client, "worker-1", history.id);
  expect(preview).toMatchObject({
    affectedCount: 2,
    oldTotal: 420,
    newTotal: 435,
    difference: 15,
  });

  const applied = await applyWorkerRateToUnpaidLaborEntriesWithClient(
    client,
    "worker-1",
    history.id
  );
  expect(applied).toMatchObject({
    affectedCount: 2,
    oldTotal: 420,
    newTotal: 435,
    difference: 15,
  });
  expect(db.labor_entries.find((row) => row.id === "entry-full")).toMatchObject({
    daily_rate_snapshot: 290,
    amount_snapshot: 290,
    labor_cost_snapshot: 290,
    cost_amount: 290,
    rate_history_id: history.id,
  });
  expect(db.labor_entries.find((row) => row.id === "entry-half")).toMatchObject({
    daily_rate_snapshot: 290,
    amount_snapshot: 145,
    labor_cost_snapshot: 145,
    cost_amount: 145,
    rate_history_id: history.id,
  });
  expect(db.labor_entries.find((row) => row.id === "entry-paid")).toMatchObject({
    daily_rate_snapshot: 280,
    amount_snapshot: 280,
    cost_amount: 280,
    rate_history_id: "rate-0001",
  });
});

test("current rate uses deterministic id tie-break for same effective date and created_at", async () => {
  const db = baseDb();
  db.worker_rate_history = [
    {
      id: "rate-0001",
      worker_id: "worker-1",
      rate_type: "daily",
      daily_rate: 280,
      effective_from: "2026-04-04",
      effective_to: null,
      created_at: "2026-04-04T12:00:00.000Z",
    },
    {
      id: "rate-9999",
      worker_id: "worker-1",
      rate_type: "daily",
      daily_rate: 290,
      effective_from: "2026-04-04",
      effective_to: null,
      created_at: "2026-04-04T12:00:00.000Z",
    },
  ];

  const current = await getWorkerCurrentDailyRateWithClient(
    makeMemoryClient(db),
    "worker-1",
    "2026-06-04"
  );

  expect(current).toMatchObject({
    dailyRate: 290,
    rateHistoryId: "rate-9999",
    effectiveFrom: "2026-04-04",
  });
});
