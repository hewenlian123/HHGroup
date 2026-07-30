import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type FakeRow = Record<string, unknown>;
type FakeData = Record<string, FakeRow[]>;

let fakeData: FakeData = {};
const globalFromSpy = vi.fn((table: string) => new FakeQuery(table));

class FakeQuery {
  private filters: Array<(row: FakeRow) => boolean> = [];
  private maxRows: number | null = null;

  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    const allowed = new Set(values);
    this.filters.push((row) => allowed.has(row[column]));
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  single() {
    const rows = this.rows();
    return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : null });
  }

  maybeSingle() {
    return this.single();
  }

  then<TResult1 = { data: FakeRow[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: FakeRow[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }

  private rows() {
    let rows = [...(fakeData[this.table] ?? [])];
    for (const filter of this.filters) rows = rows.filter(filter);
    if (this.maxRows != null) rows = rows.slice(0, this.maxRows);
    return rows;
  }
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => ({
    from: globalFromSpy,
  }),
}));

describe("profit engine commission cost", () => {
  beforeEach(() => {
    vi.resetModules();
    globalFromSpy.mockClear();
    fakeData = {
      project_commissions: [],
      commission_payments: [],
    };
  });

  it("includes accrued commission amount in single project actual cost and profit", async () => {
    fakeData = {
      projects: [{ id: "project-1", budget: 1000 }],
      project_change_orders: [{ project_id: "project-1", status: "Approved", amount: 100 }],
      subcontract_bills: [{ project_id: "project-1", status: "Approved", amount: 70 }],
      labor_entries: [{ project_id: "project-1", status: "Approved", cost_amount: 200 }],
      expense_lines: [{ project_id: "project-1", expense_id: "expense-1", amount: 50 }],
      expenses: [{ id: "expense-1", project_id: "project-1", status: "paid" }],
      commissions: [{ id: "commission-1", project_id: "project-1", commission_amount: 30 }],
      project_commissions: [],
      commission_payments: [{ commission_id: "commission-1", amount: 25 }],
    };

    const { getCanonicalProjectProfit } = await import("@/lib/profit-engine");
    const result = await getCanonicalProjectProfit("project-1");

    expect(result.revenue).toBe(1100);
    expect(result.laborCost).toBe(200);
    expect(result.expenseCost).toBe(50);
    expect(result.subcontractCost).toBe(70);
    expect(result.commissionCost).toBe(30);
    expect(result.actualCost).toBe(350);
    expect(result.profit).toBe(750);
  });

  it("uses the explicit server client for every single-project cost source", async () => {
    fakeData = {
      projects: [{ id: "project-1", budget: 1000 }],
      project_change_orders: [],
      subcontract_bills: [],
      labor_entries: [],
      expense_lines: [],
      expenses: [],
      commissions: [{ id: "commission-1", project_id: "project-1", commission_amount: 30 }],
      project_commissions: [],
    };
    const explicitClient = {
      from: (table: string) => new FakeQuery(table),
    } as unknown as SupabaseClient;

    const { getCanonicalProjectProfit } = await import("@/lib/profit-engine");
    const result = await getCanonicalProjectProfit("project-1", explicitClient);

    expect(result.commissionCost).toBe(30);
    expect(globalFromSpy).not.toHaveBeenCalled();
  });

  it("includes accrued commission amount per project in batch profit", async () => {
    fakeData = {
      projects: [
        { id: "project-1", budget: 1000 },
        { id: "project-2", budget: 500 },
      ],
      project_change_orders: [],
      subcontract_bills: [],
      labor_entries: [],
      expense_lines: [],
      expenses: [],
      commissions: [
        { id: "commission-1", project_id: "project-1", commission_amount: 30 },
        { id: "commission-2", project_id: "project-1", commission_amount: 20 },
        { id: "commission-3", project_id: "project-2", commission_amount: 40 },
      ],
      project_commissions: [],
      commission_payments: [
        { commission_id: "commission-1", amount: 30 },
        { commission_id: "commission-3", amount: 10 },
      ],
    };

    const { getCanonicalProjectProfitBatch } = await import("@/lib/profit-engine");
    const result = await getCanonicalProjectProfitBatch(["project-1", "project-2"]);

    expect(result.get("project-1")).toEqual(
      expect.objectContaining({
        commissionCost: 50,
        actualCost: 50,
        profit: 950,
      })
    );
    expect(result.get("project-2")).toEqual(
      expect.objectContaining({
        commissionCost: 40,
        actualCost: 40,
        profit: 460,
      })
    );
  });
});
