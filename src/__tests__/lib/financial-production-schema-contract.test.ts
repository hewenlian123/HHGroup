import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const source = (path: string) => readFileSync(join(process.cwd(), "src", "lib", path), "utf8");

describe("canonical financial Production schema contract", () => {
  it("does not select retired fields in project financial reads", () => {
    const expenses = source("expenses-db.ts");
    const snapshot = source("financial/project-financial-snapshot-db.ts");
    const workerBalances = source("worker-balances-list.ts");
    const changeOrderAmount = source("financial/change-order-amount.ts");

    expect(expenses).not.toContain("category, memo, amount");
    expect(expenses).not.toContain("cost_code, memo, amount");
    expect(expenses).toContain("category, description, amount");
    expect(expenses).toContain("cost_code, description, amount");
    expect(expenses).toContain("memo: r.description ?? r.memo ?? undefined");

    expect(snapshot).not.toContain("category,memo");

    expect(workerBalances).not.toContain("cost_amount, total");
    expect(workerBalances).not.toContain('"worker_id, total_amount, status"');

    expect(changeOrderAmount).toContain(
      'PROJECT_CHANGE_ORDER_AMOUNT_COLUMNS = "total,total_amount"'
    );
    expect(changeOrderAmount).not.toMatch(
      /PROJECT_CHANGE_ORDER_AMOUNT_COLUMNS\s*=\s*"[^"\n]*\bamount\b/
    );
  });

  it("uses Production expense_lines.description for the existing project-cost memo display", async () => {
    const selectedColumns: Record<string, string[]> = {};
    const rows = {
      expense_lines: [
        {
          id: "line-1",
          expense_id: "expense-1",
          project_id: "project-1",
          category: "Materials",
          description: "Lumber delivery",
          amount: 125,
        },
      ],
      expenses: [
        {
          id: "expense-1",
          status: "approved",
          vendor_name: "Supplier",
          expense_date: "2026-08-01",
          payment_method: "Card",
          receipt_url: "receipts/expense-1.pdf",
        },
      ],
      expense_attachments: [],
      attachments: [],
    } as const;

    const c = {
      from(table: keyof typeof rows) {
        return {
          select(columns: string) {
            (selectedColumns[table] ??= []).push(columns);
            if (table === "attachments") {
              return {
                eq: () => ({ in: async () => ({ data: rows[table], error: null }) }),
              };
            }
            return {
              in: async () => ({ data: rows[table], error: null }),
              eq: async () => ({ data: rows[table], error: null }),
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const { getProjectExpenseLinesBundle } = await import("@/lib/expenses-db");
    const result = await getProjectExpenseLinesBundle("project-1", c);

    expect(selectedColumns.expense_lines).toEqual([
      "id, expense_id, project_id, category, description, amount",
    ]);
    expect(result.doneCostLines[0]?.memo).toBe("Lumber delivery");
    expect(result.allDisplayLines[0]?.memo).toBe("Lumber delivery");
  });
});
