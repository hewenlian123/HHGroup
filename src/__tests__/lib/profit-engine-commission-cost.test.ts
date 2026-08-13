import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type FakeRow = Record<string, unknown>;
type FakeData = Record<string, FakeRow[]>;
type FakeError = { message: string; code?: string };
type FakeQueryResult = { data: FakeRow[]; error: FakeError | null };

let fakeData: FakeData = {};
let fakeErrors: Record<string, FakeError | undefined> = {};
let missingColumns: Record<string, Set<string>> = {};
let selectedColumns: Array<{ table: string; columns: string }> = [];
const globalFromSpy = vi.fn((table: string) => new FakeQuery(table));

class FakeQuery {
  private filters: Array<(row: FakeRow) => boolean> = [];
  private maxRows: number | null = null;
  private selected = "";

  constructor(private readonly table: string) {}

  select(columns = "") {
    this.selected = columns;
    selectedColumns.push({ table: this.table, columns });
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
    return Promise.resolve({ data: rows[0] ?? null, error: this.error() });
  }

  maybeSingle() {
    return this.single();
  }

  then<TResult1 = FakeQueryResult, TResult2 = never>(
    onfulfilled?: ((value: FakeQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve({ data: this.rows(), error: this.error() }).then(
      onfulfilled,
      onrejected
    );
  }

  private error(): FakeError | null {
    const missingColumn = [...(missingColumns[this.table] ?? [])].find((column) =>
      this.selected.split(",").map((value) => value.trim()).includes(column)
    );
    if (missingColumn) return { code: "42703", message: `column ${missingColumn} does not exist` };
    return fakeErrors[this.table] ?? null;
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
  humanizeSupabaseRequestError: (error: { message?: string }) => error.message ?? "Request failed",
}));

describe("profit engine commission cost", () => {
  beforeEach(() => {
    vi.resetModules();
    globalFromSpy.mockClear();
    fakeErrors = {};
    missingColumns = {};
    selectedColumns = [];
    fakeData = {
      project_commissions: [],
      commission_payments: [],
    };
  });

  it("includes accrued commission amount in single project actual cost and profit", async () => {
    fakeData = {
      projects: [{ id: "project-1", budget: 1000 }],
      project_change_orders: [
        { project_id: "project-1", status: "Approved", total: 100, total_amount: 100 },
      ],
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
    expect(result.margin).toBeCloseTo(750 / 1100);
    expect(selectedColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "labor_entries",
          columns: "project_id, cost_amount, status",
        }),
      ])
    );
    expect(selectedColumns).toContainEqual({
      table: "project_change_orders",
      columns: "total,total_amount",
    });
  });

  it("uses the production Change Order total contract without querying the absent amount column", async () => {
    missingColumns = { project_change_orders: new Set(["amount"]) };
    fakeData = {
      projects: [
        { id: "project-1", budget: 1000 },
        { id: "project-2", budget: 500 },
        { id: "project-3", budget: 400 },
      ],
      project_change_orders: [
        { project_id: "project-1", status: "Approved", total: 100, total_amount: 100 },
        { project_id: "project-2", status: "Approved", total: 0, total_amount: 900 },
        { project_id: "project-3", status: "Approved", total: null, total_amount: 60 },
      ],
      subcontract_bills: [{ project_id: "project-1", status: "Approved", amount: 70 }],
      labor_entries: [{ project_id: "project-1", status: "Approved", cost_amount: 200 }],
      expense_lines: [{ project_id: "project-1", expense_id: "expense-1", amount: 50 }],
      expenses: [{ id: "expense-1", project_id: "project-1", status: "paid" }],
      commissions: [{ id: "commission-1", project_id: "project-1", commission_amount: 30 }],
      project_commissions: [],
      commission_payments: [],
    };

    const { getCanonicalProjectProfitBatch } = await import("@/lib/profit-engine");
    const result = await getCanonicalProjectProfitBatch(["project-1", "project-2", "project-3"]);

    expect(result.get("project-1")).toEqual(
      expect.objectContaining({
        approvedChangeOrders: 100,
        revenue: 1100,
        actualCost: 350,
        profit: 750,
        margin: 750 / 1100,
      })
    );
    expect(result.get("project-2")).toEqual(
      expect.objectContaining({ approvedChangeOrders: 0, revenue: 500 })
    );
    expect(result.get("project-3")).toEqual(
      expect.objectContaining({ approvedChangeOrders: 60, revenue: 460 })
    );
    expect(selectedColumns).toContainEqual({
      table: "project_change_orders",
      columns: "project_id,total,total_amount",
    });
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

  it("does not convert a protected project read failure into a zero-valued profit result", async () => {
    fakeErrors = {
      projects: { code: "42501", message: "permission denied for table projects" },
    };
    const explicitClient = {
      from: (table: string) => new FakeQuery(table),
    } as unknown as SupabaseClient;

    const { getCanonicalProjectProfit } = await import("@/lib/profit-engine");

    await expect(getCanonicalProjectProfit("project-1", explicitClient)).rejects.toThrow(
      "Financial data unavailable: projects.budget"
    );
  });

  it("does not ignore a denied legacy commission read", async () => {
    fakeData = {
      projects: [{ id: "project-1", budget: 1000 }],
      project_change_orders: [],
      subcontract_bills: [],
      labor_entries: [],
      expense_lines: [],
      expenses: [],
      commissions: [],
      project_commissions: [],
    };
    fakeErrors = {
      project_commissions: {
        code: "42501",
        message: "permission denied for table project_commissions",
      },
    };
    const explicitClient = {
      from: (table: string) => new FakeQuery(table),
    } as unknown as SupabaseClient;

    const { getCanonicalProjectProfit } = await import("@/lib/profit-engine");

    await expect(getCanonicalProjectProfit("project-1", explicitClient)).rejects.toThrow(
      "permission denied for table project_commissions"
    );
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
