import { describe, expect, it } from "vitest";
import { assertProjectFinancialSnapshotSourcesAvailable } from "@/lib/financial/project-financial-snapshot-db";

describe("project financial snapshot source availability", () => {
  it.each([
    "invoices_unavailable",
    "invoice_payments_schema_detail",
    "expense_lines_unavailable",
    "labor_entries_unavailable",
    "worker_reimbursements_unavailable",
    "subcontract_bills_unavailable",
    "subcontract_payments_unavailable",
    "commissions_unavailable",
    "commission_payments_unavailable",
    "project_change_orders_unavailable",
    "project_change_order_items_unavailable",
  ])("rejects a required financial source warning: %s", (code) => {
    expect(() =>
      assertProjectFinancialSnapshotSourcesAvailable([
        { code, severity: "warning", message: `${code} failed` },
      ])
    ).toThrow(/financial data unavailable/i);
  });

  it("allows a successful empty result and non-authoritative AP diagnostics", () => {
    expect(() => assertProjectFinancialSnapshotSourcesAvailable([])).not.toThrow();
    expect(() =>
      assertProjectFinancialSnapshotSourcesAvailable([
        {
          code: "ap_bills_not_mapped",
          severity: "warning",
          message: "AP is diagnostic-only and not included in canonical actual cost.",
        },
      ])
    ).not.toThrow();
  });
});
