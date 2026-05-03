import type { Expense } from "@/lib/data";
import { describe, expect, it } from "vitest";
import {
  buildExpenseDateGroups,
  formatExpenseDateGroupLabel,
} from "@/lib/expense-list-date-groups";

function mockExpense(over: Partial<Expense>): Expense {
  return {
    id: "e1",
    date: "2026-05-01",
    vendorName: "Acme",
    paymentMethod: "Cash",
    attachments: [],
    lines: [{ id: "l1", projectId: "p1", category: "Other", amount: 10, memo: null }],
    headerProjectId: null,
    status: "pending",
    sourceType: "company",
    ...over,
  } as Expense;
}

describe("buildExpenseDateGroups", () => {
  it("groups by date and sorts newest first", () => {
    const rows = [
      mockExpense({ id: "a", date: "2026-05-01" }),
      mockExpense({ id: "b", date: "2026-05-03" }),
      mockExpense({ id: "c", date: "2026-05-01" }),
    ];
    const g = buildExpenseDateGroups(rows);
    expect(g.map((x) => x.dateKey)).toEqual(["2026-05-03", "2026-05-01"]);
    expect(g[0]!.itemCount).toBe(1);
    expect(g[1]!.itemCount).toBe(2);
  });

  it("counts missing receipts", () => {
    const rows = [
      mockExpense({ id: "a", date: "2026-05-02", receiptUrl: "https://x/r.jpg" }),
      mockExpense({ id: "b", date: "2026-05-02", receiptUrl: null }),
    ];
    const g = buildExpenseDateGroups(rows);
    expect(g[0]!.missingReceiptCount).toBe(1);
  });

  it("keeps every same-calendar-day row in a single group with full-day stats", () => {
    const rows = [
      mockExpense({ id: "a", date: "2026-05-03", receiptUrl: null }),
      mockExpense({ id: "b", date: "2026-05-03", receiptUrl: "https://x/y.jpg" }),
      mockExpense({
        id: "c",
        date: "2026-05-03",
        lines: [{ id: "lc", projectId: "p1", category: "Other", amount: 5, memo: null }],
      }),
    ];
    const g = buildExpenseDateGroups(rows);
    const may3 = g.find((x) => x.dateKey === "2026-05-03");
    expect(may3).toBeDefined();
    expect(may3!.rows.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
    expect(may3!.itemCount).toBe(3);
    expect(may3!.totalAmount).toBe(25);
    expect(may3!.missingReceiptCount).toBe(2);
  });
});

describe("formatExpenseDateGroupLabel", () => {
  it("handles unknown", () => {
    expect(formatExpenseDateGroupLabel("unknown")).toBe("No date");
  });
});
