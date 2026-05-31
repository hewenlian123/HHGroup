import { describe, expect, it } from "vitest";
import { buildDataQualityReport } from "@/lib/system-data-quality";

describe("buildDataQualityReport", () => {
  it("flags project contract placeholders, fractional estimates, and company profile markers", () => {
    const report = buildDataQualityReport({
      projects: [{ id: "project-1", name: "Placeholder Project", status: "active", budget: 1 }],
      estimates: [{ id: "estimate-1", estimate_no: "EST-0020", total: 0.014, subtotal: 0.014 }],
      estimateItems: [
        {
          id: "estimate-item-1",
          estimate_id: "estimate-1",
          quantity: 1,
          rate: 0.011,
          amount: 0.025,
        },
      ],
      companyProfiles: [
        {
          id: "profile-1",
          org_name: "HH Constructions Inc",
          address1: "E2E-ST",
          zip: "E2E-ZIP",
        },
      ],
    });

    const codes = report.issues.map((issue) => issue.issueCode);
    expect(codes).toContain("contract_value_placeholder");
    expect(codes).toContain("estimate_fractional_currency");
    expect(codes).toContain("estimate_item_fractional_currency");
    expect(codes).toContain("estimate_item_amount_mismatch");
    expect(codes).toContain("company_profile_e2e_marker");
    expect(report.summary.warning).toBeGreaterThanOrEqual(5);
  });

  it("flags invoice payment contradictions as critical", () => {
    const report = buildDataQualityReport({
      invoices: [
        {
          id: "invoice-1",
          invoice_no: "INV-001",
          status: "paid",
          subtotal: 100,
          total: 100,
          paid_total: 125,
          balance_due: 25,
        },
      ],
      invoiceItems: [
        { id: "item-1", invoice_id: "invoice-1", quantity: 1, rate: 100, amount: 100 },
      ],
      invoicePayments: [
        { id: "payment-1", invoice_id: "invoice-1", amount: 125, status: "posted" },
      ],
    });

    const criticalCodes = report.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => issue.issueCode);
    expect(criticalCodes).toContain("invoice_paid_exceeds_total");
    expect(criticalCodes).toContain("invoice_balance_due_mismatch");
    expect(criticalCodes).toContain("paid_invoice_has_open_balance");
    expect(report.summary.status).toBe("critical");
  });

  it("uses posted invoice payments before stale stored paid total for balance checks", () => {
    const report = buildDataQualityReport({
      invoices: [
        {
          id: "invoice-paid-with-stale-total",
          invoice_no: "INV-0003",
          status: "paid",
          subtotal: 119358,
          total: 119358,
          paid_total: 0,
          balance_due: 0,
        },
      ],
      invoiceItems: [
        {
          id: "invoice-paid-with-stale-total-item",
          invoice_id: "invoice-paid-with-stale-total",
          quantity: 1,
          rate: 119358,
          amount: 119358,
        },
      ],
      invoicePayments: [
        {
          id: "posted-payment",
          invoice_id: "invoice-paid-with-stale-total",
          amount: 119358,
          status: "posted",
        },
      ],
    });

    const codes = report.issues.map((issue) => issue.issueCode);
    expect(codes).not.toContain("invoice_balance_due_mismatch");
    expect(codes).not.toContain("paid_invoice_has_open_balance");
    expect(codes).toContain("invoice_paid_total_stale");
    expect(report.summary.critical).toBe(0);
  });

  it("falls back to stored paid total when an invoice has no payment rows", () => {
    const report = buildDataQualityReport({
      invoices: [
        {
          id: "invoice-without-payments",
          invoice_no: "INV-OPEN",
          status: "sent",
          subtotal: 1000,
          total: 1000,
          paid_total: 0,
          balance_due: 0,
        },
      ],
      invoiceItems: [
        {
          id: "invoice-without-payments-item",
          invoice_id: "invoice-without-payments",
          quantity: 1,
          rate: 1000,
          amount: 1000,
        },
      ],
    });

    const issue = report.issues.find((entry) => entry.issueCode === "invoice_balance_due_mismatch");
    expect(issue).toMatchObject({
      severity: "critical",
      currentValue: 0,
      expectedValue: 1000,
    });
  });

  it("does not count void invoice payments toward invoice balance", () => {
    const report = buildDataQualityReport({
      invoices: [
        {
          id: "invoice-with-void-payment",
          invoice_no: "INV-VOID",
          status: "sent",
          subtotal: 1000,
          total: 1000,
          paid_total: 1000,
          balance_due: 1000,
        },
      ],
      invoiceItems: [
        {
          id: "invoice-with-void-payment-item",
          invoice_id: "invoice-with-void-payment",
          quantity: 1,
          rate: 1000,
          amount: 1000,
        },
      ],
      invoicePayments: [
        {
          id: "void-payment",
          invoice_id: "invoice-with-void-payment",
          amount: 1000,
          status: "void",
        },
      ],
    });

    const codes = report.issues.map((issue) => issue.issueCode);
    expect(codes).not.toContain("invoice_balance_due_mismatch");
    expect(codes).toContain("invoice_paid_total_stale");
  });

  it("checks project snapshot component consistency without including pending costs", () => {
    const report = buildDataQualityReport({
      projects: [{ id: "project-1", name: "Snapshot Project", status: "active", budget: 1000 }],
      projectSnapshots: [
        {
          projectId: "project-1",
          ok: true,
          snapshot: {
            projectId: "project-1",
            contractValue: 1000,
            approvedChangeOrders: 0,
            revisedContractValue: 1000,
            billedAmount: 0,
            paidAmount: 0,
            openAR: 0,
            actualCost: 90,
            expenseCost: 50,
            laborCost: 40,
            reimbursementCost: 0,
            subcontractCost: 0,
            commissionCost: 0,
            apCost: 0,
            grossProfit: 910,
            grossMargin: 91,
            cashCollected: 0,
            cashOut: 90,
            cashPosition: -90,
            warnings: [],
            diagnostics: {
              expenseLinesLoaded: 1,
              expenseHeaderFallbackCount: 0,
              excludedExpenseCount: 0,
              pendingExpenseCost: 25,
              pendingExpenseCount: 1,
              changeOrdersLoaded: 0,
              approvedChangeOrdersCount: 0,
              reimbursementDedupedCount: 0,
              pendingReimbursementCost: 15,
              pendingReimbursementCount: 1,
              committedReimbursementCost: 15,
              committedReimbursementCount: 1,
              subcontractCashOut: 0,
              openSubcontractAP: 0,
              openAP: 0,
              apCashOut: 0,
              apBillCount: 0,
              apDiagnosticsWarnings: [],
              missingSchemaWarnings: [],
              pendingCostReviewWarnings: [],
            },
          },
        },
      ],
    });

    const codes = report.issues.map((issue) => issue.issueCode);
    expect(codes).toContain("project_pending_cost_review");
    expect(codes).not.toContain("project_actual_cost_component_mismatch");
  });

  it("uses worker payment total_amount before legacy amount for zero-payment warnings", () => {
    const report = buildDataQualityReport({
      workerPayments: [
        {
          id: "payment-with-canonical-total",
          amount: 0,
          total_amount: 50,
        },
      ],
    });

    const codes = report.issues.map((issue) => issue.issueCode);
    expect(codes).not.toContain("worker_payment_zero_amount");
    expect(codes).not.toContain("worker_payment_negative_amount");
  });

  it("warns when worker payment canonical and legacy amount fields are zero", () => {
    const report = buildDataQualityReport({
      workerPayments: [
        {
          id: "payment-with-zero-totals",
          amount: 0,
          total_amount: 0,
        },
      ],
    });

    const issue = report.issues.find((entry) => entry.issueCode === "worker_payment_zero_amount");
    expect(issue).toMatchObject({
      severity: "warning",
      entityType: "worker_payment",
      entityId: "payment-with-zero-totals",
      currentValue: "total_amount=0, amount=0",
    });
    expect(issue?.message).toContain("canonical amount");
  });
});
