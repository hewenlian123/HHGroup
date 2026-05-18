import { describe, expect, it } from "vitest";
import {
  buildProjectFinancialSnapshotInput,
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
        { id: "sub-paid", project_id: "project-1", amount: 200, status: "Paid" },
        { id: "sub-pending", project_id: "project-1", amount: 300, status: "Pending" },
      ],
      subcontractPayments: [
        {
          id: "sub-payment-1",
          subcontract_id: "subcontract-1",
          bill_id: "sub-1",
          amount: 250,
        },
      ],
      apBills: [
        {
          id: "ap-1",
          project_id: "project-1",
          amount: 50,
          paid_amount: 10,
          balance_amount: 40,
          status: "Pending",
        },
      ],
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
    expect(snapshot.subcontractCost).toBe(900);
    expect(snapshot.apCost).toBe(50);
    expect(snapshot.actualCost).toBe(2625);
    expect(snapshot.cashCollected).toBe(2500);
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "project_contract_amount_mismatch" }),
        expect.objectContaining({ code: "expense_status_needs_review" }),
        expect.objectContaining({ code: "reimbursement_expense_deduped" }),
        expect.objectContaining({ code: "ap_bills_not_in_actual_cost" }),
      ])
    );
    expect(snapshot.diagnostics).toEqual(
      expect.objectContaining({
        subcontractCashOut: 250,
        openSubcontractAP: 650,
        openAP: 40,
        apCashOut: 10,
        apBillCount: 1,
        reimbursementDedupedCount: 1,
      })
    );
  });

  it("excludes non-final subcontract bills and keeps subcontract payments out of actual cost", () => {
    const snapshot = mapProjectFinancialRowsToSnapshot({
      projectId: "project-1",
      project: { id: "project-1", budget: 5000 },
      changeOrders: [],
      invoices: [],
      invoicePayments: [],
      expenses: [],
      expenseLines: [],
      laborEntries: [],
      workerReimbursements: [],
      subcontractBills: [
        { id: "sub-approved", amount: 1000, status: "Approved" },
        { id: "sub-paid", amount: 500, status: "Paid" },
        { id: "sub-draft", amount: 900, status: "Draft" },
        { id: "sub-void", amount: 800, status: "Void" },
        { id: "sub-rejected", amount: 700, status: "Rejected" },
        { id: "sub-cancelled", amount: 600, status: "Cancelled" },
      ],
      subcontractPayments: [
        { id: "payment-approved", bill_id: "sub-approved", amount: 250 },
        { id: "payment-paid", bill_id: "sub-paid", amount: 500 },
      ],
      apBills: [],
    });

    expect(snapshot.subcontractCost).toBe(1500);
    expect(snapshot.actualCost).toBe(1500);
    expect(snapshot.cashOut).toBe(750);
    expect(snapshot.diagnostics).toEqual(
      expect.objectContaining({
        subcontractCashOut: 750,
        openSubcontractAP: 750,
      })
    );
  });

  it("keeps generic AP bills out of actual cost and emits duplicate-risk diagnostics", () => {
    const snapshot = mapProjectFinancialRowsToSnapshot({
      projectId: "project-1",
      project: { id: "project-1", budget: 4000 },
      changeOrders: [],
      invoices: [],
      invoicePayments: [],
      expenses: [{ id: "expense-1", project_id: "project-1", status: "paid", total: 1000 }],
      expenseLines: [{ id: "line-1", expense_id: "expense-1", amount: 1000 }],
      laborEntries: [],
      workerReimbursements: [],
      subcontractBills: [],
      apBills: [
        {
          id: "ap-1",
          project_id: "project-1",
          amount: 1000,
          paid_amount: 250,
          balance_amount: 750,
          status: "Partially Paid",
          bill_type: "Vendor",
        },
        {
          id: "ap-labor",
          project_id: "project-1",
          amount: 300,
          paid_amount: 0,
          balance_amount: 300,
          status: "Pending",
          bill_type: "Labor",
        },
      ],
    });

    expect(snapshot.expenseCost).toBe(1000);
    expect(snapshot.apCost).toBe(1300);
    expect(snapshot.actualCost).toBe(1000);
    expect(snapshot.diagnostics).toEqual(
      expect.objectContaining({
        openAP: 1050,
        apCashOut: 250,
        apBillCount: 2,
        apDiagnosticsWarnings: expect.arrayContaining([
          "ap_bills_not_in_actual_cost",
          "ap_bills_possible_duplicate_cost",
        ]),
      })
    );
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ap_bills_not_in_actual_cost" }),
        expect.objectContaining({ code: "ap_bills_possible_duplicate_cost" }),
      ])
    );
  });

  it("uses project expense lines first, falls back to headers only when needed, and explains diagnostics", () => {
    const { input, warnings, diagnostics } = buildProjectFinancialSnapshotInput({
      projectId: "project-1",
      project: { id: "project-1", budget: 10000 },
      changeOrders: [],
      invoices: [],
      invoicePayments: [],
      expenses: [
        {
          id: "expense-line-backed",
          project_id: "project-1",
          status: "paid",
          total: 9999,
        },
        {
          id: "expense-header-only",
          project_id: "project-1",
          status: "reviewed",
          total: 75,
        },
        {
          id: "expense-draft",
          project_id: "project-1",
          status: "draft",
          total: 50,
        },
        {
          id: "expense-void",
          project_id: "project-1",
          status: "void",
          total: 60,
        },
        {
          id: "expense-rejected",
          project_id: "project-1",
          status: "rejected",
          total: 70,
        },
      ],
      expenseLines: [
        {
          id: "line-prefers-total",
          expense_id: "expense-line-backed",
          project_id: "project-1",
          amount: 0.01,
          total: 2081.49,
          category: "Materials",
        },
      ],
      laborEntries: [],
      workerReimbursements: [],
      subcontractBills: [],
      apBills: [],
    });

    const snapshot = mapProjectFinancialRowsToSnapshot({
      projectId: "project-1",
      project: { id: "project-1", budget: 10000 },
      changeOrders: [],
      invoices: [],
      invoicePayments: [],
      expenses: [
        {
          id: "expense-line-backed",
          project_id: "project-1",
          status: "paid",
          total: 9999,
        },
        {
          id: "expense-header-only",
          project_id: "project-1",
          status: "reviewed",
          total: 75,
        },
        {
          id: "expense-draft",
          project_id: "project-1",
          status: "draft",
          total: 50,
        },
        {
          id: "expense-void",
          project_id: "project-1",
          status: "void",
          total: 60,
        },
        {
          id: "expense-rejected",
          project_id: "project-1",
          status: "rejected",
          total: 70,
        },
      ],
      expenseLines: [
        {
          id: "line-prefers-total",
          expense_id: "expense-line-backed",
          project_id: "project-1",
          amount: 0.01,
          total: 2081.49,
          category: "Materials",
        },
      ],
      laborEntries: [],
      workerReimbursements: [],
      subcontractBills: [],
      apBills: [],
    });

    expect(input.expenseLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "line-prefers-total", amount: 2081.49 }),
        expect.objectContaining({ id: "expense-header:expense-header-only", amount: 75 }),
      ])
    );
    expect(snapshot.expenseCost).toBe(2156.49);
    expect(snapshot.expenseCost).not.toBe(0.01);
    expect(diagnostics).toEqual(
      expect.objectContaining({
        expenseLinesLoaded: 1,
        expenseHeaderFallbackCount: 1,
        excludedExpenseCount: 3,
      })
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "expense_line_amount_total_mismatch" }),
        expect.objectContaining({ code: "expense_header_without_lines_used" }),
      ])
    );
  });

  it("includes approved change orders and excludes non-approved change orders with diagnostics", () => {
    const snapshot = mapProjectFinancialRowsToSnapshot({
      projectId: "project-1",
      project: { id: "project-1", budget: 1000 },
      changeOrders: [
        { id: "co-approved", project_id: "project-1", status: "Approved", total: 150 },
        {
          id: "co-items-backed",
          project_id: "project-1",
          status: "approved",
          total: 0,
          item_total: 75,
        },
        { id: "co-draft", project_id: "project-1", status: "Draft", total: 900 },
        { id: "co-rejected", project_id: "project-1", status: "Rejected", total: 800 },
      ],
      invoices: [],
      invoicePayments: [],
      expenses: [],
      expenseLines: [],
      laborEntries: [],
      workerReimbursements: [],
      subcontractBills: [],
      apBills: [],
    });

    const comparison = buildProjectFinancialSnapshotComparison({
      projectId: "project-1",
      newSnapshot: snapshot,
    });

    expect(snapshot.approvedChangeOrders).toBe(225);
    expect(snapshot.revisedContractValue).toBe(1225);
    expect(comparison.diagnostics).toEqual(
      expect.objectContaining({
        changeOrdersLoaded: 4,
        approvedChangeOrdersCount: 2,
      })
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

  it("summarizes missing schema warnings in comparison diagnostics", () => {
    const snapshot = mapProjectFinancialRowsToSnapshot({
      projectId: "project-1",
      project: { id: "project-1", budget: 1000, contract_amount: null },
      changeOrders: [],
      invoices: [],
      invoicePayments: [],
      expenses: [],
      expenseLines: [],
      laborEntries: [],
      workerReimbursements: [],
      subcontractBills: [],
      apBills: [],
    });

    const comparison = buildProjectFinancialSnapshotComparison({
      projectId: "project-1",
      newSnapshot: snapshot,
      warnings: [
        {
          code: "expense_lines_unavailable",
          severity: "warning",
          message: "expense_lines could not be loaded because a column is unavailable.",
        },
      ],
    });

    expect(comparison.diagnostics.missingSchemaWarnings).toContain("expense_lines_unavailable");
  });
});
