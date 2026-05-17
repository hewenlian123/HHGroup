import { describe, expect, it } from "vitest";
import {
  calculateProjectFinancialSnapshot,
  expenseStatusCountsTowardProjectCost,
  projectExpenseCostStatusDecision,
} from "@/lib/financial/project-financial-snapshot";

describe("project financial snapshot", () => {
  it("separates contract profit, cash flow, and open AR from the same project facts", () => {
    const snapshot = calculateProjectFinancialSnapshot({
      projectId: "project-1",
      contractValue: 10000,
      approvedChangeOrders: 1500,
      invoices: [
        {
          id: "invoice-1",
          total: 6000,
          status: "Sent",
          payments: [
            { amount: 2500, status: "Posted" },
            { amount: 500, status: "Voided" },
          ],
        },
        { id: "invoice-void", total: 800, status: "Void", payments: [{ amount: 800 }] },
      ],
      expenseLines: [
        { id: "expense-line-1", amount: 1200, status: "reviewed" },
        { id: "expense-line-draft", amount: 999, status: "draft" },
        { id: "expense-line-rejected", amount: 88, status: "rejected" },
      ],
      laborEntries: [
        { id: "labor-1", amount: 900, status: "Approved" },
        { id: "labor-paid", amount: 400, status: "paid", workerPaymentId: "worker-payment-1" },
      ],
      workerReimbursements: [
        { id: "reimb-1", amount: 125, status: "approved" },
        { id: "reimb-pending", amount: 200, status: "pending" },
      ],
      subcontractCosts: [{ id: "subcontract-1", amount: 750, status: "Approved" }],
      apCosts: [{ id: "ap-1", amount: 300, status: "Approved" }],
      cashOutPayments: [
        { amount: 1200, status: "Posted" },
        { amount: 450, status: "Voided" },
      ],
    });

    expect(snapshot.revisedContractValue).toBe(11500);
    expect(snapshot.billedAmount).toBe(6000);
    expect(snapshot.paidAmount).toBe(2500);
    expect(snapshot.openAR).toBe(3500);
    expect(snapshot.expenseCost).toBe(1200);
    expect(snapshot.laborCost).toBe(1300);
    expect(snapshot.reimbursementCost).toBe(125);
    expect(snapshot.subcontractCost).toBe(750);
    expect(snapshot.apCost).toBe(300);
    expect(snapshot.actualCost).toBe(3675);
    expect(snapshot.grossProfit).toBe(7825);
    expect(snapshot.grossMargin).toBeCloseTo(7825 / 11500, 6);
    expect(snapshot.cashCollected).toBe(2500);
    expect(snapshot.cashOut).toBe(1200);
    expect(snapshot.cashPosition).toBe(1300);
  });

  it("does not count a worker reimbursement twice when it has a reimbursement expense line", () => {
    const snapshot = calculateProjectFinancialSnapshot({
      projectId: "project-1",
      contractValue: 5000,
      expenseLines: [
        {
          id: "expense-reimb-1",
          amount: 300,
          status: "paid",
          source: "worker_reimbursement",
          sourceId: "reimb-1",
        },
      ],
      workerReimbursements: [{ id: "reimb-1", amount: 300, status: "paid" }],
    });

    expect(snapshot.expenseCost).toBe(300);
    expect(snapshot.reimbursementCost).toBe(0);
    expect(snapshot.actualCost).toBe(300);
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "reimbursement_expense_deduped",
          severity: "info",
        }),
      ])
    );
  });

  it("uses a single expense status matrix for project actual cost eligibility", () => {
    expect(expenseStatusCountsTowardProjectCost("reviewed")).toBe(true);
    expect(expenseStatusCountsTowardProjectCost("done")).toBe(true);
    expect(expenseStatusCountsTowardProjectCost("approved")).toBe(true);
    expect(expenseStatusCountsTowardProjectCost("paid")).toBe(true);
    expect(expenseStatusCountsTowardProjectCost("completed")).toBe(true);

    expect(expenseStatusCountsTowardProjectCost("draft")).toBe(false);
    expect(expenseStatusCountsTowardProjectCost("void")).toBe(false);
    expect(expenseStatusCountsTowardProjectCost("rejected")).toBe(false);

    const needsReview = projectExpenseCostStatusDecision("needs_review");
    expect(needsReview.included).toBe(false);
    expect(needsReview.warningCode).toBe("expense_status_needs_review");
  });
});
