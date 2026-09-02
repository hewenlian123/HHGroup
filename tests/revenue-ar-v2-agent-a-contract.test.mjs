import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("AR workspace keeps the Figma command hierarchy, grouped queue, and read-only context", () => {
  const ar = source("src/app/financial/ar/page.tsx");

  assert.match(ar, /title="Invoices & AR"/);
  assert.match(ar, /data-testid="ar-workspace-summary"/);
  assert.match(ar, /data-testid="ar-invoice-queue"/);
  assert.match(ar, /data-testid="ar-selected-invoice-context"/);
  assert.match(ar, /searchParams:\s*Promise<\{ invoice\?: string \}>/);
  assert.match(ar, /const requestedInvoiceId = \(await searchParams\)\.invoice/);
  assert.match(ar, /outstanding\.find\(\(invoice\) => invoice\.id === requestedInvoiceId\)/);
  assert.match(ar, /View context/);
  assert.match(ar, /aria-current=\{selected \? "true" : undefined\}/);
  assert.match(ar, /<NeoTable/);
  assert.match(ar, /className="hidden lg:block"/);
  assert.match(ar, /tableClassName="min-w-0 table-fixed"/);
  assert.match(ar, /<colgroup>/);
  assert.match(ar, /className="block truncate"/);
  assert.match(ar, /aria-label="View invoice context"/);
  assert.match(ar, /aria-label="Receive payment"/);
  assert.match(ar, /<NeoMobileCard/);
  assert.match(ar, /className="space-y-2 pt-2 lg:hidden"/);
  assert.match(ar, /min-h-\[44px\]/);
  assert.match(ar, /h-11 min-h-\[44px\] xl:h-9 xl:min-h-0/);
  assert.match(ar, /xl:w-\[20%\]/);
  assert.match(ar, /xl:w-\[12%\]/);
  assert.match(ar, /whitespace-nowrap/);
  assert.match(ar, /"h-8 xl:hidden"/);
  assert.match(ar, /<NeoStatus/);
  assert.match(ar, /Receive payment/);
  assert.match(ar, /Open full invoice/);
});

test("invoice queue remains dense on desktop and stacked on mobile without changing actions", () => {
  const invoices = source("src/app/financial/invoices/page.tsx");

  assert.match(invoices, /data-testid="invoice-workspace-summary"/);
  assert.match(invoices, /data-testid={`invoice-row-\$\{inv\.invoiceNo\}`}/);
  assert.match(invoices, /data-testid={`invoice-mobile-card-\$\{inv\.invoiceNo\}`}/);
  assert.match(invoices, /label: "Receive payment"/);
  assert.match(invoices, /label: "Void"/);
  assert.match(invoices, /label: "Delete"/);
});
