import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("invoice paid reads ignore unapplied payments_received rows", () => {
  const allocation = source("src/lib/payment-allocation.ts");
  const invoices = source("src/lib/invoices-db.ts");
  const detail = source("src/lib/invoice-detail-read.ts");
  const detailClient = source("src/app/financial/invoices/[id]/invoice-detail-client.tsx");
  const reports = source("src/lib/reports-db.ts");
  const snapshot = source("src/lib/financial/project-financial-snapshot-db.ts");

  assert.match(allocation, /Posted invoice_payments only/);
  assert.doesNotMatch(allocation, /paymentsReceived: ReceivedRow\[\]/);
  assert.doesNotMatch(invoices, /appendUnallocatedPaymentsReceived/);
  assert.match(invoices, /Unapplied receipts are excluded/);
  assert.doesNotMatch(detail, /paymentsReceivedRows\.map/);
  assert.doesNotMatch(detailClient, /unlinkedReceived/);
  assert.doesNotMatch(detailClient, /unlinked-\$\{/);
  assert.match(reports, /Unapplied payments_received are excluded until they are linked/);
  assert.doesNotMatch(reports, /were not copied into invoice_payments/);
  assert.doesNotMatch(snapshot, /unallocatedReceivedPayments/);
});

test("linking an unapplied payment reuses the invoice allocation write", () => {
  const payments = source("src/lib/payments-received-db.ts");
  const actions = source("src/app/financial/payments/actions.ts");
  assert.match(payments, /from\("invoice_payments"\)/);
  assert.match(payments, /payment_received_id: payment\.id/);
  assert.match(payments, /status: "Posted"/);
  assert.match(actions, /linkUnappliedPaymentToInvoiceAction/);
  assert.match(actions, /revalidatePaymentPaths\(result\.invoiceId, result\.projectId\)/);
});
