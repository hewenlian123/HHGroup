import { describe, expect, it } from "vitest";
import {
  HH_PROJECT_OS_NAV_SECTIONS,
  getHhProjectOsMobileActiveHref,
  getHhProjectOsWorkspace,
  getHhProjectOsWorkspaceActiveHref,
} from "@/lib/navigation/ia";

describe("workspace navigation", () => {
  it("keeps only independent workspaces in the primary sidebar", () => {
    expect(HH_PROJECT_OS_NAV_SECTIONS.map((item) => item.label)).toEqual([
      "Dashboard",
      "Projects",
      "Estimates",
      "Finance",
      "Labor",
      "Contacts",
      "Inbox",
      "Reports",
      "Settings",
    ]);
  });

  it.each([
    ["/projects/abc?tab=tasks", "/projects"],
    ["/tasks?project_id=abc", null],
    ["/site-photos", null],
    ["/documents", "/projects"],
    ["/estimate-templates/abc", "/estimates"],
    ["/estimates/abc", "/estimates"],
    ["/financial/invoices/abc", "/financial"],
    ["/financial/payments?invoiceId=abc", "/financial"],
    ["/bills/abc?addPayment=1", "/financial"],
    ["/dashboard/cashflow", "/financial"],
    // Receipt review shares the Finance shell, including trailing slash, query, and hash.
    ["/financial/inbox/worker/?workerId=abc#receipt", "/financial"],
    ["/financial/receipt-queue", "/financial/inbox"],
    ["/labor/receipts", "/financial/inbox"],
    ["/financial/vendors/abc", "/customers"],
    ["/labor/subcontractors/abc", "/customers"],
    ["/reports/workforce?tab=payments", "/labor"],
    ["/labor/payments/abc", "/labor"],
    ["/workers/abc", "/labor"],
    ["/financial/reimbursements", "/labor"],
    ["/settings/project-financial-review", "/reports"],
    ["/system-health", "/settings/company"],
    ["/settings/security", "/settings/company"],
    ["/financially-unrelated", null],
    ["/login", null],
  ])("assigns %s to exactly its business workspace", (path, owner) => {
    expect(getHhProjectOsMobileActiveHref(path)).toBe(owner);
  });
});

it("keeps Money In, vendor payments and labor payments separate", () => {
  const finance = getHhProjectOsWorkspace("/financial/payments")!;
  expect(getHhProjectOsWorkspaceActiveHref("/financial/payments", finance)).toBe("/financial/ar");
  expect(getHhProjectOsWorkspaceActiveHref("/bills", finance)).toBe("/financial/payables");
  expect(finance.entries.some((item) => item.href.startsWith("/labor"))).toBe(false);
});

it.each([
  ["/workers/summary", "/reports/workforce"],
  ["/finance/labor-cost", "/finance/labor-cost"],
  ["/labor/cost-allocation", "/labor/cost-allocation"],
  ["/financial/invoices/abc", "/financial/ar"],
  ["/financial/bills/abc", "/financial/payables"],
  ["/settings/system-health", "/system-health"],
  ["/reports/workforce?tab=advances", "/reports/workforce"],
])("selects the most specific workspace page for %s", (path, href) => {
  expect(getHhProjectOsWorkspaceActiveHref(path, getHhProjectOsWorkspace(path)!)).toBe(href);
});

it("keeps Finance to five workspaces and routes existing receipt/bank deep links", () => {
  const finance = HH_PROJECT_OS_NAV_SECTIONS.find((item) => item.key === "FINANCIAL")!;
  expect(finance.entries.map((item) => item.label)).toEqual([
    "Overview",
    "Billing",
    "Payables",
    "Expenses",
    "Accounts",
  ]);
  expect(getHhProjectOsWorkspaceActiveHref("/financial/bank", finance)).toBe(
    "/financial/accounts/overview"
  );
  expect(getHhProjectOsWorkspaceActiveHref("/finance", finance)).toBe("/financial");
});
