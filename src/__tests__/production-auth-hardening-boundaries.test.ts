import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const strictRouteFiles = [
  "src/app/api/bills/route.ts",
  "src/app/api/bills/[id]/route.ts",
  "src/app/api/bills/[id]/payments/route.ts",
  "src/app/api/customers/route.ts",
  "src/app/api/customers/[id]/route.ts",
  "src/app/api/diag/upload-receipt-supabase/route.ts",
  "src/app/api/estimates/[id]/pdf/route.ts",
  "src/app/api/expenses/route.ts",
  "src/app/api/expenses/[id]/route.ts",
  "src/app/api/expenses/[id]/attachments/route.ts",
  "src/app/api/financial/expenses/[id]/approve-inbox/route.ts",
  "src/app/api/financial/expenses/[id]/ocr-writeback/route.ts",
  "src/app/api/financial/expenses/[id]/receipts/[receiptId]/replace/route.ts",
  "src/app/api/financial/expenses/quick-expense/route.ts",
  "src/app/api/financial/receipt-queue/[id]/preview/route.ts",
  "src/app/api/financial/payments/[id]/receipt-preview/route.ts",
  "src/app/api/financial/bank-transactions/route.ts",
  "src/app/api/invoices/[id]/route.ts",
  "src/app/api/invoices/route.ts",
  "src/app/api/labor/advances/route.ts",
  "src/app/api/labor/advances/[id]/route.ts",
  "src/app/api/labor/worker-payments/[id]/route.ts",
  "src/app/api/labor/worker-payments/[id]/receipt-preview/route.ts",
  "src/app/api/labor/workers/[id]/pay/route.ts",
  "src/app/api/worker-receipts/route.ts",
  "src/app/api/worker-receipts/[id]/route.ts",
  "src/app/api/worker-receipts/[id]/approve/route.ts",
  "src/app/api/worker-receipts/[id]/reject/route.ts",
  "src/app/api/worker-receipts/[id]/reset-pending/route.ts",
  "src/app/api/worker-reimbursements/[id]/pay/route.ts",
  "src/app/api/worker-reimbursements/[id]/route.ts",
  "src/app/api/worker-reimbursements/create-payment/route.ts",
  "src/app/api/worker-reimbursements/route.ts",
  "src/app/api/worker-reimbursements/balances/route.ts",
  "src/app/api/worker-reimbursements/ledger/[workerId]/route.ts",
  "src/app/api/labor/worker-payments/route.ts",
  "src/app/api/labor/payments/route.ts",
  "src/app/api/labor/payroll-summary/route.ts",
  "src/app/api/labor/worker-balances/route.ts",
  "src/app/api/labor/worker-balances/[workerId]/route.ts",
  "src/app/api/labor/entries/route.ts",
  "src/app/api/labor/workers/route.ts",
  "src/app/api/labor/workers/[id]/route.ts",
  "src/app/api/labor/workers/[id]/balance/route.ts",
  "src/app/api/labor/workers/[id]/financial-summary/route.ts",
  "src/app/api/labor/workers/[id]/rate-history/route.ts",
  "src/app/api/labor/workers/[id]/rate-history/apply-unpaid/route.ts",
  "src/app/api/receipt/[id]/pdf/route.ts",
  "src/app/api/quick-expense/upload-attachment/route.ts",
  "src/app/api/projects/[id]/commissions/route.ts",
  "src/app/api/projects/[id]/commissions/[commissionId]/route.ts",
  "src/app/api/projects/[id]/commissions/[commissionId]/payments/route.ts",
  "src/app/api/projects/[id]/commissions/[commissionId]/payments/[paymentId]/route.ts",
  "src/app/api/projects/[id]/commissions/[commissionId]/payments/[paymentId]/receipt/route.ts",
  "src/app/api/projects/[id]/commissions/[commissionId]/payments/[paymentId]/receipt/view-url/route.ts",
  "src/app/api/projects/[id]/financial-snapshot/route.ts",
  "src/app/api/projects/financial-review/route.ts",
  "src/app/api/projects/financial-snapshots/route.ts",
  "src/app/api/projects/[id]/closeout/generate-completion-pdf/route.ts",
  "src/app/api/projects/[id]/closeout/generate-final-invoice-pdf/route.ts",
  "src/app/api/projects/[id]/tab/route.ts",
  "src/app/api/settings/company-logo/route.ts",
  "src/app/api/settings/company-profile/route.ts",
  "src/app/api/settings/expense-options/route.ts",
  "src/app/api/system-health/route.ts",
  "src/app/api/system-metrics/route.ts",
  "src/app/api/system/backup/route.ts",
  "src/app/api/system/data-quality-check/route.ts",
  "src/app/api/system/guardian/route.ts",
  "src/app/api/system/integrity-scan/route.ts",
  "src/app/api/system/integrity/cleanup/route.ts",
  "src/app/api/system/qa-check/route.ts",
  "src/app/api/test/full-system-test/route.ts",
  "src/app/api/upload-receipt/sync/route.ts",
  "src/app/api/vendors/route.ts",
  "src/app/api/vendors/[id]/route.ts",
  "src/app/api/workers/summary/route.ts",
  "src/app/api/system/financial-reconciliation/route.ts",
];

const publicReceiptRouteFiles = [
  "src/app/api/upload-receipt/options/route.ts",
  "src/app/api/upload-receipt/upload/route.ts",
  "src/app/api/upload-receipt/submit/route.ts",
];

const strictServerActionFiles = [
  "src/app/estimates/[id]/actions.ts",
  "src/app/estimates/actions.ts",
  "src/app/estimates/new/actions.ts",
  "src/app/financial/accounts/actions.ts",
  "src/app/projects/actions.ts",
  "src/app/projects/[id]/change-orders/actions.ts",
  "src/app/projects/[id]/subcontracts/[subId]/actions.ts",
  "src/app/financial/invoices/actions.ts",
  "src/app/financial/invoices/new/actions.ts",
  "src/app/financial/payments/actions.ts",
  "src/app/workers/actions.ts",
];

const paymentMutationFiles = [
  "src/app/api/worker-reimbursements/[id]/pay/route.ts",
  "src/app/api/worker-reimbursements/create-payment/route.ts",
];

const PRIVILEGED_CLIENT_CALL = /\bgetServerSupabase(?:Admin|Internal|InternalNoStore)\s*\(/g;

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("production financial authorization boundaries", () => {
  it.each(strictRouteFiles)("uses a strict gate before privileged access in %s", (path) => {
    expect(source(path)).toContain("requireSupabaseOwnerOrAdmin");
  });

  it.each(strictRouteFiles)(
    "creates a direct privileged client only after a strict gate in %s",
    (path) => {
      const text = source(path);
      const strictGateAt = text.search(/await\s+requireSupabaseOwnerOrAdmin(?:WithClient)?\s*\(/);
      expect(strictGateAt).toBeGreaterThanOrEqual(0);
      for (const match of text.matchAll(PRIVILEGED_CLIENT_CALL)) {
        expect(match.index).toBeGreaterThan(strictGateAt);
      }
    }
  );

  it.each(strictServerActionFiles)("uses a verified session gate in %s", (path) => {
    expect(source(path)).toContain("requireSupabaseOwnerOrAdminServerAction");
  });

  it.each(strictServerActionFiles)(
    "creates a direct privileged client only after a verified session gate in %s",
    (path) => {
      const text = source(path);
      const strictGateAt = text.search(
        /await\s+requireSupabaseOwnerOrAdminServerAction(?:WithClient)?\s*\(/
      );
      expect(strictGateAt).toBeGreaterThanOrEqual(0);
      for (const match of text.matchAll(PRIVILEGED_CLIENT_CALL)) {
        expect(match.index).toBeGreaterThan(strictGateAt);
      }
    }
  );

  it.each(publicReceiptRouteFiles)(
    "keeps the documented public receipt contract free of service-role access in %s",
    (path) => {
      expect(source(path)).not.toMatch(/getServerSupabase(?:Admin|Internal|InternalNoStore)/);
    }
  );

  it.each(paymentMutationFiles)("does not invoke runtime schema repair in %s", (path) => {
    expect(source(path)).not.toContain("ensureExpensesSourceColumns");
  });

  it("documents the intentionally public receipt upload contract", () => {
    const contract = source("docs/PUBLIC_RECEIPT_UPLOAD_CONTRACT.md");
    expect(contract).toContain("/api/upload-receipt/options");
    expect(contract).toContain("/api/upload-receipt/upload");
    expect(contract).toContain("/api/upload-receipt/submit");
    expect(contract).toContain("Receipt OCR is not public");
    expect(contract).toContain("must not use a service-role client");
  });
});
