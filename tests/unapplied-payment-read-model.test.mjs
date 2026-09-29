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

test("linking an unapplied payment posts an allocation atomically", () => {
  const payments = source("src/lib/payments-received-db.ts");
  const actions = source("src/app/financial/payments/actions.ts");
  const page = source("src/app/financial/payments/page.tsx");
  const invoices = source("src/lib/invoices-db.ts");
  const sql = source("supabase/migrations/20260929014755_link_unapplied_payment_to_invoice.sql");
  assert.match(payments, /rpc\("link_unapplied_payment_to_invoice"/);
  assert.match(payments, /Payment link did not post an allocation/);
  assert.doesNotMatch(payments, /23505/);
  assert.doesNotMatch(payments, /already linked/);
  assert.match(actions, /linkUnappliedPaymentToInvoiceAction/);
  assert.match(actions, /revalidatePaymentPaths\(result\.invoiceId, result\.projectId\)/);
  assert.match(sql, /coalesce\(old\.status, 'Posted'\) = 'Voided'/);
  assert.match(sql, /status = 'Posted'/);
  assert.match(sql, /payment_date = v_payment\.payment_date::date/);
  assert.match(sql, /update public\.payments_received/);
  assert.match(sql, /update public\.deposits/);
  assert.match(sql, /Payment link did not post an allocation/);
  assert.match(sql, /Payment allocation was not reactivated/);
  assert.match(page, /getInvoicePaymentsForReceiptIds/);
  assert.doesNotMatch(page, /getInvoicePayments\(/);
  assert.match(invoices, /getInvoicePaymentsForReceiptIds/);
  assert.match(invoices, /\.in\("payment_received_id", chunk\)/);
});
