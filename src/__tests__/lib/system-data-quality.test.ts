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
});
