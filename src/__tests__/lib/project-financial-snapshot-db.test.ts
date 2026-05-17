import { describe, expect, it } from "vitest";
import {
  buildProjectFinancialSnapshotComparison,
  mapProjectFinancialRowsToSnapshot,
} from "@/lib/financial/project-financial-snapshot-db";

describe("project financial snapshot DB mapper", () => {
  it("maps real project financial rows into the shared snapshot contract", () => {
    const snapshot = mapProjectFinancialRowsToSnapshot({
      projectId: "project-1",
      project: {
        id: "project-1",
        budget: 10000,
        contract_amount: 9999,
      },
      changeOrders: [
        { id: "co-1", status: "Approved", amount: 1500 },
        { id: "co-draft", status: "Draft", amount: 400 },
      ],
      invoices: [
        { id: "invoice-1", status: "Sent", total: 6000 },
        { id: "invoice-void", status: "Void", total: 800 },
      ],
      invoicePayments: [
        { id: "pay-1", invoice_id: "invoice-1", amount: 2500, status: "Posted" },
        { id: "pay-void", invoice_id: "invoice-1", amount: 200, status: "Voided" },
      ],
      expenses: [
        {
          id: "expense-1",
          project_id: "project-1",
          status: "paid",
          total: 300,
          source: "worker_reimbursement",
          source_id: "reimb-1",
        },
        {
          id: "expense-needs-review",
          project_id: "project-1",
          status: "needs_review",
          total: 111,
        },
      ],
      expenseLines: [
        {
          id: "line-1",
          expense_id: "expense-1",
          project_id: "project-1",
          amount: 300,
          category: "Reimbursement",
        },
        {
          id: "line-needs-review",
          expense_id: "expense-needs-review",
          project_id: "project-1",
          amount: 111,
          category: "Materials",
        },
      ],
      laborEntries: [
        { id: "labor-1", project_id: "project-1", cost_amount: 900, status: "Approved" },
        {
          id: "labor-paid",
          project_id: "project-1",
          cost_amount: 400,
          status: "paid",
          worker_payment_id: "worker-payment-1",
        },
      ],
      workerReimbursements: [
        { id: "reimb-1", project_id: "project-1", amount: 300, status: "paid" },
        { id: "reimb-2", project_id: "project-1", amount: 125, status: "approved" },
      ],
      subcontractBills: [
        { id: "sub-1", project_id: "project-1", amount: 700, status: "Approved" },
        { id: "sub-pending", project_id: "project-1", amount: 300, status: "Pending" },
      ],
      apBills: [{ id: "ap-1", project_id: "project-1", amount: 50, status: "Pending" }],
    });

    expect(snapshot.contractValue).toBe(10000);
    expect(snapshot.approvedChangeOrders).toBe(1500);
    expect(snapshot.revisedContractValue).toBe(11500);
    expect(snapshot.billedAmount).toBe(6000);
    expect(snapshot.paidAmount).toBe(2500);
    expect(snapshot.openAR).toBe(3500);
    expect(snapshot.expenseCost).toBe(300);
    expect(snapshot.laborCost).toBe(1300);
    expect(snapshot.reimbursementCost).toBe(125);
    expect(snapshot.subcontractCost).toBe(700);
    expect(snapshot.apCost).toBe(50);
    expect(snapshot.actualCost).toBe(2475);
    expect(snapshot.cashCollected).toBe(2500);
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "project_contract_amount_mismatch" }),
        expect.objectContaining({ code: "expense_status_needs_review" }),
        expect.objectContaining({ code: "reimbursement_expense_deduped" }),
      ])
    );
  });

  it("reports old vs new differences with stable keys and rounded deltas", () => {
    const snapshot = mapProjectFinancialRowsToSnapshot({
      projectId: "project-1",
      project: { id: "project-1", budget: 1000, contract_amount: null },
      changeOrders: [],
      invoices: [],
      invoicePayments: [],
      expenses: [],
      expenseLines: [],
      laborEntries: [
        { id: "labor-paid", project_id: "project-1", cost_amount: 400, status: "paid" },
      ],
      workerReimbursements: [],
      subcontractBills: [],
      apBills: [],
    });

    const comparison = buildProjectFinancialSnapshotComparison({
      projectId: "project-1",
      newSnapshot: snapshot,
      oldCanonicalProfit: {
        revenue: 1000,
        actualCost: 0,
        profit: 1000,
        margin: 1,
        budget: 1000,
        approvedChangeOrders: 0,
        laborCost: 0,
        expenseCost: 0,
        subcontractCost: 0,
      },
      oldProjectCostDashboard: {
        spentTotal: 0,
        profit: 1000,
        margin: 1,
        revenue: 1000,
        breakdown: { totalCost: 0, materials: 0, labor: 0, bills: 0, other: 0 },
      },
    });

    expect(comparison.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "canonical.actualCost",
          oldValue: 0,
          newValue: 400,
          delta: 400,
        }),
        expect.objectContaining({
          key: "projectCostDashboard.spentTotal",
          oldValue: 0,
          newValue: 400,
          delta: 400,
        }),
      ])
    );
  });
});
