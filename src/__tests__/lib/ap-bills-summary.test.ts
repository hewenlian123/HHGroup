import { describe, expect, it } from "vitest";
import { summarizeApBillsForDashboard } from "@/lib/ap-bills-db";

describe("AP bills dashboard summary", () => {
  it("uses unpaid balance for outstanding and due buckets when available", () => {
    const summary = summarizeApBillsForDashboard(
      [
        {
          amount: 1000,
          paid_amount: 600,
          balance_amount: 400,
          status: "Partially Paid",
          due_date: "2026-05-10",
        },
        {
          amount: 500,
          paid_amount: 0,
          balance_amount: 500,
          status: "Pending",
          due_date: "2026-05-18",
        },
        {
          amount: 300,
          paid_amount: 300,
          balance_amount: 0,
          status: "Paid",
          due_date: "2026-05-08",
        },
      ],
      {
        today: "2026-05-17",
        weekStart: "2026-05-17",
        weekEnd: "2026-05-23",
        paidThisMonthAmount: 125,
      }
    );

    expect(summary.totalOutstanding).toBe(900);
    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueAmount).toBe(400);
    expect(summary.dueThisWeekCount).toBe(1);
    expect(summary.dueThisWeekAmount).toBe(500);
    expect(summary.paidThisMonthAmount).toBe(125);
  });

  it("falls back to amount minus paid amount when balance_amount is unavailable", () => {
    const summary = summarizeApBillsForDashboard(
      [
        {
          amount: 1000,
          paid_amount: 250,
          status: "Partially Paid",
          due_date: "2026-05-10",
        },
      ],
      {
        today: "2026-05-17",
        weekStart: "2026-05-17",
        weekEnd: "2026-05-23",
        paidThisMonthAmount: 0,
      }
    );

    expect(summary.totalOutstanding).toBe(750);
    expect(summary.overdueAmount).toBe(750);
  });
});
