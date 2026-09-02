import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Revenue and AR form controls keep visible labels programmatically associated", async () => {
  const [detail, edit, list, receipt] = await Promise.all([
    source("src/app/financial/invoices/[id]/page.tsx"),
    source("src/app/financial/invoices/[id]/edit/edit-invoice-client.tsx"),
    source("src/app/financial/invoices/page.tsx"),
    source("src/components/financial/send-payment-receipt-modal.tsx"),
  ]);

  for (const [id, label] of [
    ["invoice-edit-client-name", "Client name"],
    ["invoice-edit-issue-date", "Issue date"],
    ["invoice-edit-due-date", "Due date"],
    ["invoice-edit-tax-pct", "Tax %"],
    ["invoice-edit-notes", "Notes"],
  ]) {
    assert.match(detail, new RegExp(`<label[^>]+htmlFor="${id}"[^>]*>\\s*${label}\\s*</label>`));
    assert.match(detail, new RegExp(`<Input[\\s\\S]{0,240}?id="${id}"`));
  }

  for (const [id, label] of [
    ["invoice-edit-page-project", "Project"],
    ["invoice-edit-page-customer", "Customer (optional)"],
    ["invoice-edit-page-client-name", "Client name"],
    ["invoice-edit-page-number", "Invoice number"],
    ["invoice-edit-page-issue-date", "Issue date"],
    ["invoice-edit-page-due-date", "Due date"],
    ["invoice-edit-page-tax", "Tax %"],
    ["invoice-edit-page-notes", "Notes (optional)"],
  ]) {
    assert.match(edit, new RegExp(`htmlFor="${id}"`));
    assert.match(edit, new RegExp(`id="${id}"`));
    assert.match(edit, new RegExp(`${label.replace(/[()*+?.\\^$|]/g, "\\$&")}`));
  }

  for (const [id, label] of [
    ["invoice-filter-status", "Status"],
    ["invoice-filter-project", "Project"],
    ["invoice-filter-issue-from", "Issue from"],
    ["invoice-filter-issue-to", "Issue to"],
  ]) {
    assert.match(list, new RegExp(`<label[^>]+htmlFor="${id}"[^>]*>\\s*${label}\\s*</label>`));
    assert.match(list, new RegExp(`<(?:Select|Input)[\\s\\S]{0,240}?id="${id}"`));
  }

  for (const [id, label] of [
    ["payment-receipt-recipient", "To"],
    ["payment-receipt-subject", "Subject"],
    ["payment-receipt-message", "Message"],
  ]) {
    assert.match(receipt, new RegExp(`<label[^>]+htmlFor="${id}"[^>]*>[\\s\\S]*?${label}`));
    assert.match(receipt, new RegExp(`<(?:Input|Textarea)[\\s\\S]{0,240}?id="${id}"`));
  }
});

test("Payment attachment actions use HH touch targets through tablet", async () => {
  const [payments, detail] = await Promise.all([
    source("src/app/financial/payments/page.tsx"),
    source("src/app/financial/invoices/[id]/page.tsx"),
  ]);

  assert.match(payments, /data-testid="payment-attachment-action"/);
  assert.match(detail, /data-testid="invoice-payment-attachment-action"/);
  for (const page of [payments, detail]) {
    assert.match(page, /h-11 min-h-11[^"\n]*lg:h-7 lg:min-h-0/);
  }
});

test("operational Revenue and AR surfaces do not carry dark-mode runtime branches", async () => {
  const sources = await Promise.all([
    source("src/app/financial/payments/page.tsx"),
    source("src/app/financial/deposits/page.tsx"),
    source("src/components/financial/send-payment-receipt-modal.tsx"),
    source("src/components/financial/payment-receipt-preview-modal.tsx"),
    source("src/app/financial/invoices/[id]/preview/invoice-preview-shell.tsx"),
  ]);

  for (const page of sources) {
    assert.doesNotMatch(page, /\bdark:/);
    assert.doesNotMatch(page, /data-hh-theme="neo-dark"/);
  }
});

test("Revenue and AR direct workflow surfaces avoid transition-all", async () => {
  const sources = await Promise.all([
    source("src/app/financial/invoices/[id]/page.tsx"),
    source("src/app/financial/invoices/[id]/edit/edit-invoice-client.tsx"),
    source("src/app/financial/payments/page.tsx"),
    source("src/app/financial/deposits/page.tsx"),
  ]);

  for (const page of sources) assert.doesNotMatch(page, /\btransition-all\b/);
});
